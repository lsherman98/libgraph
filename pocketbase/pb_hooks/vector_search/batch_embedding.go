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
	defaultPollInterval = 10 * time.Second
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
		if content == "" {
			continue
		}
		if record.GetInt("vector_id") != 0 {
			continue
		}

		uploadID := record.GetString("upload")
		title := ""
		if uploadID != "" {
			if !uploadLookupDone[uploadID] {
				uploadLookupDone[uploadID] = true
				if upload, err := app.FindRecordById("uploads", uploadID); err == nil {
					uploadTitleCache[uploadID] = upload.GetString("title")
				} else {
					app.Logger().Warn("[vector_search] failed to resolve upload title for chunk",
						"upload_id", uploadID,
						"chunk_id", record.Id,
						"error", err,
					)
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
	app.Logger().Info("[vector_search] embedding batch started",
		"display_name", displayName,
		"model", modelName,
		"chunks", len(chunks),
		"batch_size", batchSize,
		"poll_interval", pollInterval.String(),
		"job_concurrency", jobConcurrency,
	)

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

	app.Logger().Info("[vector_search] embedding batch finished",
		"display_name", displayName,
		"processed", processed,
		"failed", failed,
		"rate_limited", haltedByRateLimit,
	)

	return processed, failed, haltedByRateLimit
}

func processSingleEmbeddingBatch(ctx context.Context, app *pocketbase.PocketBase, batch []chunkRecord, batchLabel string, start, end int, fullModel, modelName string, pollInterval time.Duration, totalChunks int) (processed, failed int, haltedByRateLimit bool) {
	app.Logger().Info("[vector_search] submitting embed batch job",
		"label", batchLabel,
		"batch_size", len(batch),
		"start_offset", start,
		"end_offset", end,
	)

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
		app.Logger().Error("[vector_search] failed to submit batch job",
			"label", batchLabel,
			"error", err,
		)
		failed += len(batch)
		if isRateLimited(err) {
			remainingChunks := totalChunks - end
			if remainingChunks < 0 {
				remainingChunks = 0
			}
			app.Logger().Warn("[vector_search] rate limited, stopping batch processing — will retry on next cron run",
				"remaining_chunks", remainingChunks,
			)
			return processed, failed, true
		}
		return processed, failed, false
	}

	result, err := waitForBatchJob(ctx, op.Name, pollInterval)
	if err != nil {
		app.Logger().Error("[vector_search] batch job failed",
			"name", op.Name,
			"label", batchLabel,
			"error", err,
		)
		failed += len(batch)
		return processed, failed, false
	}

	responses := result.Output.getInlinedResponses()
	if len(responses) == 0 {
		app.Logger().Error("[vector_search] no inline responses in batch result",
			"name", op.Name,
			"label", batchLabel,
			"state", result.State,
			"has_output", result.Output != nil,
			"raw_debug", result.RawDebug,
		)
		failed += len(batch)
		return processed, failed, false
	}

	if len(responses) != len(batch) {
		app.Logger().Warn("[vector_search] response count mismatch for batch job",
			"name", op.Name,
			"label", batchLabel,
			"expected", len(batch),
			"received", len(responses),
		)
	}

	processable := min(len(responses), len(batch))
	for i := 0; i < processable; i++ {
		resp := responses[i]
		chunk := batch[i]

		if resp.Error != nil {
			app.Logger().Error("[vector_search] batch embed error for chunk",
				"chunk_id", chunk.Record.Id,
				"code", resp.Error.Code,
				"message", resp.Error.Message,
			)
			failed++
			continue
		}

		if resp.Response == nil || resp.Response.Embedding == nil || len(resp.Response.Embedding.Values) == 0 {
			app.Logger().Error("[vector_search] empty embedding in batch response",
				"chunk_id", chunk.Record.Id,
			)
			failed++
			continue
		}

		if err := storeChunkEmbedding(app, chunk.Record, resp.Response.Embedding.Values); err != nil {
			app.Logger().Error("[vector_search] failed to store batch embedding",
				"chunk_id", chunk.Record.Id,
				"error", err,
			)
			failed++
			continue
		}
		processed++
	}

	if len(responses) < len(batch) {
		missing := len(batch) - len(responses)
		failed += missing
		app.Logger().Error("[vector_search] batch job returned fewer responses than requested",
			"name", op.Name,
			"label", batchLabel,
			"missing", missing,
		)
	} else if len(responses) > len(batch) {
		app.Logger().Warn("[vector_search] batch job returned extra responses",
			"name", op.Name,
			"label", batchLabel,
			"extra", len(responses)-len(batch),
		)
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

func embeddingPollInterval() time.Duration {
	raw := os.Getenv("VECTOR_EMBED_POLL_INTERVAL_SECONDS")
	if raw == "" {
		return defaultPollInterval
	}

	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
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
		return nil, fmt.Errorf("marshal batch request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("batch create HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w (HTTP 429): %s", errRateLimited, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batch create failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var op batchOperation
	if err := json.Unmarshal(respBody, &op); err != nil {
		return nil, fmt.Errorf("parsing operation response: %w", err)
	}
	return &op, nil
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
		return nil, nil, fmt.Errorf("batch status HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("reading response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("batch status failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var op batchOperation
	if err := json.Unmarshal(respBody, &op); err != nil {
		return nil, nil, fmt.Errorf("parsing operation: %w", err)
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
		return fmt.Errorf("marshal embedding: %w", err)
	}

	// Use NonconcurrentDB for all writes so the INSERT and
	// last_insert_rowid() execute on the same serialised connection.
	db := app.NonconcurrentDB()

	insertStmt := fmt.Sprintf("INSERT INTO %s(embedding) VALUES ({:embedding});", embeddingsTable)
	if _, err := db.NewQuery(insertStmt).Bind(dbx.Params{
		"embedding": string(jsonVec),
	}).Execute(); err != nil {
		return fmt.Errorf("insert embedding: %w", err)
	}

	// Retrieve the rowid on the same connection – LastInsertId() from
	// sql.Result is unreliable for vec0 virtual tables.
	var idRow dbx.NullStringMap
	if err := db.NewQuery("SELECT last_insert_rowid() AS id").One(&idRow); err != nil {
		return fmt.Errorf("get vector id: %w", err)
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
		_, cleanupErr := db.NewQuery(fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)).Bind(dbx.Params{
			"id": vectorID,
		}).Execute()
		if cleanupErr != nil {
			app.Logger().Error("[vector_search] failed to cleanup orphan embedding after link failure",
				"chunk_id", record.Id,
				"vector_id", vectorID,
				"error", cleanupErr,
			)
		}
		return fmt.Errorf("update vector_id: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, cleanupErr := db.NewQuery(fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)).Bind(dbx.Params{
			"id": vectorID,
		}).Execute()
		if cleanupErr != nil {
			app.Logger().Error("[vector_search] failed to cleanup orphan embedding after skipped link",
				"chunk_id", record.Id,
				"vector_id", vectorID,
				"error", cleanupErr,
			)
		}
		app.Logger().Debug("[vector_search] skipping embedding link; chunk already linked",
			"chunk_id", record.Id,
			"vector_id", vectorID,
		)
		return nil
	}

	app.Logger().Debug("[vector_search] stored embedding",
		"chunk_id", record.Id,
		"vector_id", vectorID,
	)

	return nil
}
