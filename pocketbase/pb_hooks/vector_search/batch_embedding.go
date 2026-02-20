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
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	geminiAPIBase       = "https://generativelanguage.googleapis.com/v1beta"
	maxBatchSize        = 100
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
			if upload, err := app.FindRecordById("uploads", uploadID); err == nil {
				title = upload.GetString("title")
			}
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

func processBatchEmbeddings(ctx context.Context, app *pocketbase.PocketBase, chunks []chunkRecord, displayName string) (processed, failed int) {
	if len(chunks) == 0 {
		return 0, 0
	}

	modelName := embeddingModelName()
	fullModel := fmt.Sprintf("models/%s", modelName)

	for start := 0; start < len(chunks); start += maxBatchSize {
		end := start + maxBatchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		batch := chunks[start:end]
		batchLabel := fmt.Sprintf("%s-part-%d", displayName, start/maxBatchSize+1)

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
				app.Logger().Warn("[vector_search] rate limited, stopping batch processing — will retry on next cron run",
					"remaining_chunks", len(chunks)-end,
				)
				return processed, failed
			}
			continue
		}

		result, err := waitForBatchJob(ctx, op.Name, defaultPollInterval)
		if err != nil {
			app.Logger().Error("[vector_search] batch job failed",
				"name", op.Name,
				"error", err,
			)
			failed += len(batch)
			continue
		}

		responses := result.Output.getInlinedResponses()
		if len(responses) == 0 {
			app.Logger().Error("[vector_search] no inline responses in batch result",
				"name", op.Name,
				"state", result.State,
				"has_output", result.Output != nil,
				"raw_debug", result.RawDebug,
			)
			failed += len(batch)
			continue
		}

		for i, resp := range responses {
			if i >= len(batch) {
				break
			}
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
	}

	return processed, failed
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
			return &result, nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func storeChunkEmbedding(app *pocketbase.PocketBase, record *core.Record, values []float32) error {
	jsonVec, err := json.Marshal(values)
	if err != nil {
		return fmt.Errorf("marshal embedding: %w", err)
	}

	insertStmt := fmt.Sprintf("INSERT INTO %s(embedding) VALUES ({:embedding});", embeddingsTable)
	res, err := app.DB().NewQuery(insertStmt).Bind(dbx.Params{
		"embedding": string(jsonVec),
	}).Execute()
	if err != nil {
		return fmt.Errorf("insert embedding: %w", err)
	}

	vectorID, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("get vector id: %w", err)
	}

	updateStmt := "UPDATE document_chunks SET vector_id = {:vectorId} WHERE id = {:chunkId}"
	if _, err := app.DB().NewQuery(updateStmt).Bind(dbx.Params{
		"vectorId": vectorID,
		"chunkId":  record.Id,
	}).Execute(); err != nil {
		return fmt.Errorf("update vector_id: %w", err)
	}

	return nil
}
