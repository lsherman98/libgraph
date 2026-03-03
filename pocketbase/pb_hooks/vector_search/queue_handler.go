package vector_search

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type chunkEmbedPayload struct {
	ChunkIDs             []string `json:"chunk_ids,omitempty"`
	EmbeddingOperationID string   `json:"embedding_operation_id,omitempty"`
}

func registerQueueHandlers(app *pocketbase.PocketBase) {
	processing.RegisterHandler(processing.JobTypeChunkEmbedSubmit, handleChunkEmbedSubmitJob)
	processing.RegisterHandler(processing.JobTypeChunkEmbedPoll, handleChunkEmbedPollJob)
}

func handleChunkEmbedSubmitJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}

	chunkIDs := make([]string, 0, len(payload.ChunkIDs))
	seen := make(map[string]struct{}, len(payload.ChunkIDs))
	for _, raw := range payload.ChunkIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		chunkIDs = append(chunkIDs, id)
	}

	if len(chunkIDs) == 0 {
		return fmt.Errorf("payload chunk_ids is required")
	}

	chunks, err := loadEmbeddableChunkRecords(app, chunkIDs)
	if err != nil {
		return err
	}
	if len(chunks) == 0 {
		return nil
	}

	return submitEmbeddingOperationAndEnqueuePoll(app, job, chunks)
}

func handleChunkEmbedPollJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}

	operationID := strings.TrimSpace(payload.EmbeddingOperationID)
	if operationID == "" {
		operationID = strings.TrimSpace(job.GetString("embedding_operation"))
	}
	if operationID == "" {
		return fmt.Errorf("payload embedding_operation_id is required")
	}

	operationRecord, err := app.FindRecordById(collections.EmbeddingOperations, operationID)
	if err != nil {
		return err
	}

	status := strings.TrimSpace(operationRecord.GetString("status"))
	if status == "succeeded" || status == "failing" || status == "cancelled" || status == "expired" {
		return nil
	}

	now := time.Now().UTC()
	operationRecord.Set("status", "polling")
	operationRecord.Set("last_polled_at", now)
	operationRecord.Set("error_message", "")
	if err := app.Save(operationRecord); err != nil {
		return err
	}

	providerOperationID := strings.TrimSpace(operationRecord.GetString("provider_operation_id"))
	if providerOperationID == "" {
		return fmt.Errorf("embedding operation missing provider_operation_id")
	}

	batchOperation, rawBody, err := getBatchJobStatus(context.Background(), providerOperationID)
	if err != nil {
		return handleEmbeddingOperationPollError(app, job, operationRecord, err)
	}

	isDone := batchOperation.Done ||
		batchOperation.State == "JOB_STATE_SUCCEEDED" ||
		batchOperation.State == "JOB_STATE_FAILED" ||
		batchOperation.State == "JOB_STATE_CANCELLED"

	if !isDone {
		nextPollAt := now.Add(embeddingPollInterval())
		operationRecord.Set("status", "polling")
		operationRecord.Set("next_poll_at", nextPollAt)
		if err := app.Save(operationRecord); err != nil {
			return err
		}

		return rescheduleEmbeddingPollJob(app, job, operationRecord, nextPollAt)
	}

	if batchOperation.Error != nil || batchOperation.State == "JOB_STATE_FAILED" || batchOperation.State == "JOB_STATE_CANCELLED" {
		errMessage := "embedding batch failed"
		if batchOperation.Error != nil && strings.TrimSpace(batchOperation.Error.Message) != "" {
			errMessage = batchOperation.Error.Message
		}
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", errMessage)
		operationRecord.Set("finished_at", now)
		return app.Save(operationRecord)
	}

	result, err := resolveBatchResult(batchOperation, rawBody)
	if err != nil {
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", err.Error())
		operationRecord.Set("finished_at", now)
		if saveErr := app.Save(operationRecord); saveErr != nil {
			return saveErr
		}
		return nil
	}

	chunkIDs, err := embeddingOperationChunkIDs(operationRecord)
	if err != nil {
		return err
	}

	chunkRecords, err := loadEmbeddableChunkRecords(app, chunkIDs)
	if err != nil {
		return err
	}

	processed, failed, err := persistEmbeddingBatchResult(app, chunkRecords, result)
	if err != nil {
		return err
	}

	operationRecord.Set("succeeded_chunks", processed)
	operationRecord.Set("failed_chunks", failed)
	operationRecord.Set("total_chunks", len(chunkRecords))
	operationRecord.Set("finished_at", now)
	if failed > 0 {
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", fmt.Sprintf("embedding batch completed with failures: %d", failed))
	} else {
		operationRecord.Set("status", "succeeded")
		operationRecord.Set("error_message", "")
	}

	return app.Save(operationRecord)
}

func submitEmbeddingOperationAndEnqueuePoll(app *pocketbase.PocketBase, job *core.Record, chunkRecords []*core.Record) error {
	chunks := collectChunkRecords(app, chunkRecords)
	if len(chunks) == 0 {
		return nil
	}
	chunkIDs := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		chunkIDs = append(chunkIDs, chunk.Record.Id)
	}

	modelName := embeddingModelName()
	fullModel := fmt.Sprintf("models/%s", modelName)
	requests := make([]inlinedEmbedContentRequest, len(chunks))
	for i, c := range chunks {
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

	batchLabel := fmt.Sprintf("queue-chunk-embed-submit-%s", job.Id)
	operation, err := submitBatchEmbedJob(context.Background(), requests, batchLabel, modelName)
	if err != nil {
		return err
	}

	collection, err := app.FindCollectionByNameOrId(collections.EmbeddingOperations)
	if err != nil {
		return err
	}

	operationRecord := core.NewRecord(collection)
	operationRecord.Set("processing_job", job.Id)
	operationRecord.Set("upload", job.GetString("upload"))
	operationRecord.Set("page", job.GetString("page"))
	operationRecord.Set("user", job.GetString("user"))
	operationRecord.Set("provider", "gemini")
	operationRecord.Set("provider_operation_id", operation.Name)
	operationRecord.Set("status", "submitted")
	operationRecord.Set("model", modelName)
	operationRecord.Set("chunk_ids_json", chunkIDs)
	operationRecord.Set("total_chunks", len(chunks))
	operationRecord.Set("succeeded_chunks", 0)
	operationRecord.Set("failed_chunks", 0)
	operationRecord.Set("attempts", 0)
	operationRecord.Set("max_attempts", 10)
	operationRecord.Set("submitted_at", time.Now().UTC())
	operationRecord.Set("error_message", "")
	if err := app.Save(operationRecord); err != nil {
		return err
	}

	return enqueueEmbeddingPollJob(app, operationRecord, time.Now().UTC().Add(embeddingPollInterval()))
}

func handleEmbeddingOperationPollError(app *pocketbase.PocketBase, job *core.Record, operationRecord *core.Record, pollErr error) error {
	now := time.Now().UTC()
	attempts := operationRecord.GetInt("attempts") + 1
	maxAttempts := operationRecord.GetInt("max_attempts")
	if maxAttempts <= 0 {
		maxAttempts = 10
	}

	operationRecord.Set("attempts", attempts)
	operationRecord.Set("error_message", pollErr.Error())

	if attempts >= maxAttempts {
		operationRecord.Set("status", "failing")
		operationRecord.Set("finished_at", now)
		return app.Save(operationRecord)
	}

	nextPollAt := now.Add(embeddingPollInterval())
	operationRecord.Set("status", "polling")
	operationRecord.Set("next_poll_at", nextPollAt)
	if err := app.Save(operationRecord); err != nil {
		return err
	}

	return rescheduleEmbeddingPollJob(app, job, operationRecord, nextPollAt)
}

func enqueueEmbeddingPollJob(app *pocketbase.PocketBase, operationRecord *core.Record, scheduledAt time.Time) error {
	operationID := operationRecord.Id
	dedupeKey := fmt.Sprintf("chunk.embed.poll:%s", operationID)
	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkEmbedPoll,
		DedupeKey: dedupeKey,
		Payload: map[string]any{
			"embedding_operation_id": operationID,
		},
		Priority:             100,
		MaxAttempts:          5,
		ScheduledAt:          &scheduledAt,
		UserID:               operationRecord.GetString("user"),
		UploadID:             operationRecord.GetString("upload"),
		PageID:               operationRecord.GetString("page"),
		EmbeddingOperationID: operationID,
	})
}

func rescheduleEmbeddingPollJob(app *pocketbase.PocketBase, job *core.Record, operationRecord *core.Record, scheduledAt time.Time) error {
	if job == nil {
		return enqueueEmbeddingPollJob(app, operationRecord, scheduledAt)
	}

	job.Set("status", "queued")
	job.Set("scheduled_at", scheduledAt)
	job.Set("lease_until", nil)
	job.Set("started_at", nil)
	job.Set("finished_at", nil)
	job.Set("error_code", "")
	job.Set("error_message", "")
	job.Set("payload_json", map[string]any{
		"embedding_operation_id": operationRecord.Id,
	})

	if strings.TrimSpace(job.GetString("dedupe_key")) == "" {
		job.Set("dedupe_key", fmt.Sprintf("chunk.embed.poll:%s", operationRecord.Id))
	}

	if strings.TrimSpace(job.GetString("embedding_operation")) == "" {
		job.Set("embedding_operation", operationRecord.Id)
	}

	if strings.TrimSpace(job.GetString("user")) == "" {
		job.Set("user", operationRecord.GetString("user"))
	}

	if strings.TrimSpace(job.GetString("upload")) == "" {
		job.Set("upload", operationRecord.GetString("upload"))
	}

	if strings.TrimSpace(job.GetString("page")) == "" {
		job.Set("page", operationRecord.GetString("page"))
	}

	return app.Save(job)
}

func enqueuePendingEmbeddingPollJobs(app *pocketbase.PocketBase, limit int) {
	now := time.Now().UTC().Format(time.RFC3339)
	if limit <= 0 {
		limit = 100
	}

	operations, err := app.FindRecordsByFilter(
		collections.EmbeddingOperations,
		"(status = 'submitted' || status = 'polling') && (next_poll_at = '' || next_poll_at = null || next_poll_at <= {:now})",
		"next_poll_at,created",
		limit,
		0,
		dbx.Params{"now": now},
	)
	if err != nil {
		app.Logger().Error("[vector_search] failed to fetch pending embedding operations", "error", err)
		return
	}

	for _, operationRecord := range operations {
		opID := operationRecord.Id
		existingJobs, err := app.FindRecordsByFilter(
			collections.ProcessingJobs,
			"embedding_operation = {:operationId} && job_type = {:jobType} && (status = 'queued' || status = 'running')",
			"",
			1,
			0,
			dbx.Params{"operationId": opID, "jobType": processing.JobTypeChunkEmbedPoll},
		)
		if err != nil {
			app.Logger().Warn("[vector_search] failed checking existing poll job", "operation_id", opID, "error", err)
			continue
		}

		if len(existingJobs) > 0 {
			continue
		}

		nextPollAt := time.Now().UTC()
		if err := enqueueEmbeddingPollJob(app, operationRecord, nextPollAt); err != nil {
			app.Logger().Warn("[vector_search] failed to enqueue poll job", "operation_id", opID, "error", err)
			continue
		}

		operationRecord.Set("next_poll_at", nextPollAt)
		if saveErr := app.Save(operationRecord); saveErr != nil {
			app.Logger().Warn("[vector_search] failed to update next_poll_at", "operation_id", opID, "error", saveErr)
		}
	}
}

func loadEmbeddableChunkRecords(app *pocketbase.PocketBase, chunkIDs []string) ([]*core.Record, error) {
	records := make([]*core.Record, 0, len(chunkIDs))
	for _, chunkID := range chunkIDs {
		record, err := app.FindRecordById(collections.DocumentChunks, chunkID)
		if err != nil {
			return nil, err
		}

		uploadID := strings.TrimSpace(record.GetString("upload"))
		if uploadID == "" {
			continue
		}
		uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
		if err != nil {
			return nil, err
		}
		if uploadRecord.GetBool("is_summary") {
			continue
		}

		records = append(records, record)
	}

	return records, nil
}

func embeddingOperationChunkIDs(operationRecord *core.Record) ([]string, error) {
	raw := operationRecord.GetString("chunk_ids_json")
	if strings.TrimSpace(raw) == "" {
		return nil, fmt.Errorf("embedding operation %s has empty chunk_ids_json", operationRecord.Id)
	}

	chunkIDs := make([]string, 0)
	if err := json.Unmarshal([]byte(raw), &chunkIDs); err != nil {
		return nil, err
	}
	return chunkIDs, nil
}

func persistEmbeddingBatchResult(app *pocketbase.PocketBase, chunkRecords []*core.Record, result *embedContentBatchResult) (processed int, failed int, err error) {
	responses := result.Output.getInlinedResponses()
	if len(responses) == 0 {
		return 0, len(chunkRecords), fmt.Errorf("batch result has no inline responses")
	}

	processable := min(len(responses), len(chunkRecords))
	for i := 0; i < processable; i++ {
		resp := responses[i]
		record := chunkRecords[i]

		if resp.Error != nil {
			failed++
			continue
		}
		if resp.Response == nil || resp.Response.Embedding == nil || len(resp.Response.Embedding.Values) == 0 {
			failed++
			continue
		}
		if storeErr := storeChunkEmbedding(app, record, resp.Response.Embedding.Values); storeErr != nil {
			failed++
			continue
		}
		processed++
	}

	if len(responses) < len(chunkRecords) {
		failed += len(chunkRecords) - len(responses)
	}

	return processed, failed, nil
}
