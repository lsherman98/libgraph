package vector_search

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	geminiAPIBase       = "https://generativelanguage.googleapis.com/v1beta"
	maxBatchSize        = 500
	maxSyncBulkRequests = 100
	defaultPollInterval = 300 * time.Second
)

var embeddingBatchMu sync.Mutex

var errRateLimited = fmt.Errorf("rate limited by Gemini API")

func isRateLimited(err error) bool {
	return errors.Is(err, errRateLimited)
}

func (o *embedContentBatchOutput) getInlinedResponses() []inlinedEmbedContentResponse {
	if o == nil || len(o.RawInlined) == 0 || string(o.RawInlined) == "null" {
		return nil
	}

	var direct []inlinedEmbedContentResponse
	if err := json.Unmarshal(o.RawInlined, &direct); err == nil && len(direct) > 0 {
		return direct
	}

	var wrapped struct {
		InlinedResponses []inlinedEmbedContentResponse `json:"inlinedResponses"`
	}
	if err := json.Unmarshal(o.RawInlined, &wrapped); err == nil {
		return wrapped.InlinedResponses
	}

	return nil
}

func collectChunkRecords(app *pocketbase.PocketBase, records []*core.Record) []chunkRecord {
	chunks := make([]chunkRecord, 0, len(records))
	uploadTitleCache := make(map[string]string)
	uploadLookupDone := make(map[string]bool)

	for _, record := range records {
		content := record.GetString("content")
		vectorID := float64(record.GetInt("vector_id"))
		uploadID := record.GetString("upload")

		if content == "" {
			continue
		}
		if vectorID != 0 {
			continue
		}

		title := ""
		if uploadID != "" {
			if !uploadLookupDone[uploadID] {
				uploadLookupDone[uploadID] = true
				if upload, err := app.FindRecordById("uploads", uploadID); err == nil {
					uploadTitle := upload.GetString("title")
					uploadTitleCache[uploadID] = uploadTitle
				}
			}
			title = uploadTitleCache[uploadID]
		}

		chunks = append(chunks, chunkRecord{
			Record:   record,
			Content:  content,
			Title:    title,
			UploadID: uploadID,
		})
	}
	return chunks
}

func processBatchEmbeddings(ctx context.Context, app *pocketbase.PocketBase, chunks []chunkRecord, displayName string) (processed, failed int, haltedByRateLimit bool) {
	if len(chunks) == 0 {
		return 0, 0, false
	}

	batchSize := embeddingMaxBatchSize()
	pollInterval := embeddingPollInterval()
	jobConcurrency := embeddingJobConcurrency()

	modelName := embeddingModelName()
	fullModel := fmt.Sprintf("models/%s", modelName)

	type batchJob struct {
		start int
		end   int
		batch []chunkRecord
		label string
	}

	type batchResult struct {
		processed         int
		failed            int
		haltedByRateLimit bool
	}

	totalJobs := (len(chunks) + batchSize - 1) / batchSize
	jobs := make([]batchJob, 0, totalJobs)
	for start := 0; start < len(chunks); start += batchSize {
		end := min(start+batchSize, len(chunks))
		jobs = append(jobs, batchJob{
			start: start,
			end:   end,
			batch: chunks[start:end],
			label: fmt.Sprintf("%s-part-%d", displayName, start/batchSize+1),
		})
	}

	results := make(chan batchResult, len(jobs))
	sem := make(chan struct{}, jobConcurrency)
	var wg sync.WaitGroup
	var stopSubmitting atomic.Bool

	for _, job := range jobs {
		if stopSubmitting.Load() {
			break
		}

		sem <- struct{}{}
		wg.Add(1)
		go func(job batchJob) {
			defer wg.Done()
			defer func() { <-sem }()

			if stopSubmitting.Load() {
				results <- batchResult{}
				return
			}

			p, f, halted := processSingleEmbeddingBatch(ctx, app, job.batch, job.label, job.start, job.end, fullModel, modelName, pollInterval, len(chunks))
			if halted {
				stopSubmitting.Store(true)
			}

			results <- batchResult{
				processed:         p,
				failed:            f,
				haltedByRateLimit: halted,
			}
		}(job)
	}

	wg.Wait()
	close(results)

	for result := range results {
		processed += result.processed
		failed += result.failed
		if result.haltedByRateLimit {
			haltedByRateLimit = true
		}
	}

	return processed, failed, haltedByRateLimit
}

func processSingleEmbeddingBatch(ctx context.Context, app *pocketbase.PocketBase, batch []chunkRecord, batchLabel string, start, end int, fullModel, modelName string, pollInterval time.Duration, totalChunks int) (processed, failed int, haltedByRateLimit bool) {
	requests := make([]inlinedEmbedContentRequest, len(batch))
	for i, c := range batch {
		requests[i] = inlinedEmbedContentRequest{
			Request: restEmbedContentRequest{
				Model:    fullModel,
				Content:  restContent{Parts: []restPart{{Text: c.Content}}},
				TaskType: "RETRIEVAL_DOCUMENT",
				Title:    c.Title,
			},
			Metadata: map[string]any{
				"chunk_id": c.Record.Id,
			},
		}
	}

	op, err := submitBatchEmbedJob(ctx, requests, batchLabel, modelName)
	if err != nil {
		failed += len(batch)
		if isRateLimited(err) {
			remainingChunks := totalChunks - end
			if remainingChunks < 0 {
				remainingChunks = 0
			}
			return processed, failed, true
		}
		return processed, failed, false
	}

	result, err := waitForBatchJob(ctx, op.Name, pollInterval)
	if err != nil {
		failed += len(batch)
		return processed, failed, false
	}

	responses := result.Output.getInlinedResponses()
	if len(responses) == 0 {
		failed += len(batch)
		return processed, failed, false
	}

	processable := min(len(responses), len(batch))
	for i := 0; i < processable; i++ {
		resp := responses[i]
		chunk := batch[i]

		if resp.Error != nil {
			failed++
			continue
		}

		if resp.Response == nil || resp.Response.Embedding == nil || len(resp.Response.Embedding.Values) == 0 {
			failed++
			continue
		}

		if err := storeChunkEmbedding(app, chunk.Record, resp.Response.Embedding.Values); err != nil {
			failed++
			continue
		}
		processed++
	}

	if len(responses) < len(batch) {
		missing := len(batch) - len(responses)
		failed += missing
	}

	return processed, failed, false
}

func embeddingMaxBatchSize() int {
	raw := os.Getenv("VECTOR_EMBED_MAX_BATCH_SIZE")
	if raw == "" {
		return maxBatchSize
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return maxBatchSize
	}

	if parsed > maxBatchSize {
		return maxBatchSize
	}

	return parsed
}

func batchEmbeddingEnabled() bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv("BATCH")))
	if raw == "" {
		return false
	}

	switch raw {
	case "1", "true", "t", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func embeddingPollInterval() time.Duration {
	raw := os.Getenv("VECTOR_EMBED_POLL_INTERVAL_SECONDS")
	if raw == "" {
		return defaultPollInterval
	}

	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return defaultPollInterval
	}

	minimumSeconds := int(defaultPollInterval / time.Second)
	if seconds < minimumSeconds {
		return defaultPollInterval
	}

	return time.Duration(seconds) * time.Second
}

func embeddingJobConcurrency() int {
	const defaultConcurrency = 10
	const maxConcurrency = 10

	raw := os.Getenv("VECTOR_EMBED_JOB_CONCURRENCY")
	if raw == "" {
		return defaultConcurrency
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return defaultConcurrency
	}

	if parsed > maxConcurrency {
		return maxConcurrency
	}

	return parsed
}

func submitBatchEmbedJob(ctx context.Context, requests []inlinedEmbedContentRequest, displayName, modelName string) (*batchOperation, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	url := fmt.Sprintf("%s/models/%s:asyncBatchEmbedContent?key=%s", geminiAPIBase, modelName, apiKey)

	body := asyncBatchEmbedRequest{
		Batch: batchEmbedJobConfig{
			DisplayName: displayName,
			InputConfig: inputEmbedContentConfig{
				Requests: &inlinedEmbedContentRequests{
					Requests: requests,
				},
			},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w (HTTP 429): %s", errRateLimited, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batch create failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var op batchOperation
	if err := json.Unmarshal(respBody, &op); err != nil {
		return nil, err
	}

	return &op, nil
}

func submitBulkEmbedContent(ctx context.Context, modelName string, parts []restPart) ([][]float32, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}
	if len(parts) == 0 {
		return nil, nil
	}

	requests := make([]restEmbedContentRequest, len(parts))
	for i, part := range parts {
		requests[i] = restEmbedContentRequest{
			Model:    fmt.Sprintf("models/%s", modelName),
			Content:  restContent{Parts: []restPart{{Text: part.Text}}},
			TaskType: "RETRIEVAL_DOCUMENT",
		}
	}

	vectors := make([][]float32, 0, len(requests))
	for start := 0; start < len(requests); start += maxSyncBulkRequests {
		end := min(start+maxSyncBulkRequests, len(requests))
		chunkVectors, err := submitBulkEmbedContentChunk(ctx, apiKey, modelName, requests[start:end])
		if err != nil {
			return nil, fmt.Errorf("batchEmbedContents chunk failed (%d-%d): %w", start, end, err)
		}
		vectors = append(vectors, chunkVectors...)
	}

	return vectors, nil
}

func submitBulkEmbedContentChunk(ctx context.Context, apiKey, modelName string, requests []restEmbedContentRequest) ([][]float32, error) {

	url := fmt.Sprintf("%s/models/%s:batchEmbedContents?key=%s", geminiAPIBase, modelName, apiKey)
	body := restBulkEmbedContentRequest{
		Requests: requests,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w (HTTP 429): %s", errRateLimited, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batchEmbedContents failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var parsed restBulkEmbedContentResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}

	if len(parsed.Embeddings) == 0 && parsed.Embedding != nil {
		parsed.Embeddings = []restEmbedContentResponse{{Embedding: parsed.Embedding}}
	}

	vectors := make([][]float32, 0, len(parsed.Embeddings))
	for _, emb := range parsed.Embeddings {
		if len(emb.Values) > 0 {
			vectors = append(vectors, emb.Values)
			continue
		}
		if emb.Embedding != nil && len(emb.Embedding.Values) > 0 {
			vectors = append(vectors, emb.Embedding.Values)
			continue
		}
		vectors = append(vectors, nil)
	}

	return vectors, nil
}

func getBatchJobStatus(ctx context.Context, batchName string) (*batchOperation, []byte, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	url := fmt.Sprintf("%s/%s?key=%s", geminiAPIBase, batchName, apiKey)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("batch status failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var op batchOperation
	if err := json.Unmarshal(respBody, &op); err != nil {
		return nil, nil, err
	}

	return &op, respBody, nil
}

func waitForBatchJob(ctx context.Context, batchName string, pollInterval time.Duration) (*embedContentBatchResult, error) {
	for {
		op, rawBody, err := getBatchJobStatus(ctx, batchName)
		if err != nil {
			return nil, err
		}

		isDone := op.Done ||
			op.State == "JOB_STATE_SUCCEEDED" ||
			op.State == "JOB_STATE_FAILED" ||
			op.State == "JOB_STATE_CANCELLED"

		if isDone {
			if op.Error != nil {
				return nil, fmt.Errorf("batch job failed (code %d): %s", op.Error.Code, op.Error.Message)
			}
			if op.State == "JOB_STATE_FAILED" {
				return nil, fmt.Errorf("batch job state is FAILED")
			}

			return resolveBatchResult(op, rawBody)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func resolveBatchResult(op *batchOperation, rawBody []byte) (*embedContentBatchResult, error) {
	var result embedContentBatchResult

	if len(op.Response) > 0 && string(op.Response) != "null" {
		if err := json.Unmarshal(op.Response, &result); err == nil && result.Output != nil {
			return &result, nil
		}
	}

	if op.Output != nil {
		result.Name = op.Name
		result.State = op.State
		result.Output = op.Output
		result.BatchStats = op.BatchStats
		return &result, nil
	}

	if err := json.Unmarshal(rawBody, &result); err == nil && result.Output != nil {
		return &result, nil
	}

	if len(op.Metadata) > 0 && string(op.Metadata) != "null" {
		if err := json.Unmarshal(op.Metadata, &result); err == nil && result.Output != nil {
			return &result, nil
		}
	}

	_ = json.Unmarshal(rawBody, &result)
	result.RawDebug = string(rawBody)
	if result.Output == nil {
		return nil, fmt.Errorf("batch result missing output")
	}

	return &result, nil
}

func storeChunkEmbedding(app *pocketbase.PocketBase, record *core.Record, values []float32) error {
	if len(values) != embeddingDims {
		return fmt.Errorf("embedding dimension mismatch for chunk %s: got %d, expected %d", record.Id, len(values), embeddingDims)
	}

	jsonVec, err := json.Marshal(values)
	if err != nil {
		return err
	}

	// Use NonconcurrentDB for all writes so the INSERT and
	// last_insert_rowid() execute on the same serialised connection.
	db := app.NonconcurrentDB()

	insertStmt := fmt.Sprintf("INSERT INTO %s(embedding) VALUES ({:embedding});", embeddingsTable)
	if _, err := db.NewQuery(insertStmt).Bind(dbx.Params{
		"embedding": string(jsonVec),
	}).Execute(); err != nil {
		return err
	}

	// Retrieve the rowid on the same connection – LastInsertId() from
	// sql.Result is unreliable for vec0 virtual tables.
	var idRow dbx.NullStringMap
	if err := db.NewQuery("SELECT last_insert_rowid() AS id").One(&idRow); err != nil {
		return err
	}

	var vectorID int64
	if v, verr := idRow["id"].Value(); verr == nil && v != nil {
		fmt.Sscanf(fmt.Sprint(v), "%d", &vectorID)
	}

	if vectorID <= 0 {
		return fmt.Errorf("last_insert_rowid returned %d after vec0 INSERT – embedding was stored but could not be linked", vectorID)
	}

	updateStmt := "UPDATE document_chunks SET vector_id = {:vectorId} WHERE id = {:chunkId} AND (vector_id = 0 OR vector_id IS NULL)"
	result, err := db.NewQuery(updateStmt).Bind(dbx.Params{
		"vectorId": vectorID,
		"chunkId":  record.Id,
	}).Execute()
	if err != nil {
		_, err := db.NewQuery(fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)).Bind(dbx.Params{
			"id": vectorID,
		}).Execute()
		if err != nil {
			return err
		}
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err := db.NewQuery(fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)).Bind(dbx.Params{
			"id": vectorID,
		}).Execute()
		if err != nil {
			return err
		}

		return nil
	}

	return nil
}
