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

const embeddingOperationErrorMessageMaxLen = 5000

func clampEmbeddingOperationErrorMessage(message string) string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return ""
	}

	runes := []rune(trimmed)
	if len(runes) <= embeddingOperationErrorMessageMaxLen {
		return trimmed
	}

	suffix := " ... (truncated)"
	maxContentLen := embeddingOperationErrorMessageMaxLen - len([]rune(suffix))
	if maxContentLen <= 0 {
		return string(runes[:embeddingOperationErrorMessageMaxLen])
	}

	return string(runes[:maxContentLen]) + suffix
}

func HandleChunkEmbedSubmitJob(app core.App, job *core.Record) error {
	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return err
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

	useBatch := batchEmbeddingEnabled()
	if useBatch {
		return submitEmbeddingOperationAndEnqueuePoll(app, job, chunks)
	}

	return submitEmbeddingOperationAndProcessSync(app, job, chunks)
}

func HandleChunkEmbedPollJob(app core.App, job *core.Record) error {
	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return err
	}

	operationID := strings.TrimSpace(payload.EmbeddingOperationID)
	if operationID == "" {
		operationID = strings.TrimSpace(job.GetString("embedding_operation"))
	}
	if operationID == "" {
		return fmt.Errorf("payload embedding_operation_id is required")
	}

	operationRecord, err := app.FindRecordById(collections.EmbeddingJobs, operationID)
	if err != nil {
		return err
	}

	status := strings.TrimSpace(operationRecord.GetString("status"))
	if status == "succeeded" || status == "failing" || status == "cancelled" || status == "expired" {
		return nil
	}

	now := time.Now().UTC()

	providerOperationID := strings.TrimSpace(operationRecord.GetString("provider_operation_id"))
	if providerOperationID == "" {
		providerOperationID = strings.TrimSpace(operationRecord.GetString("batch_id"))
	}
	if providerOperationID == "" {
		return fmt.Errorf("embedding operation missing provider_operation_id/batch_id")
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
		operationRecord.Set("error_message", "")
		operationRecord.Set("last_polled_at", now)
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
		errMessage = clampEmbeddingOperationErrorMessage(errMessage)
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", errMessage)
		operationRecord.Set("last_polled_at", now)
		operationRecord.Set("finished_at", now)
		return app.Save(operationRecord)
	}

	result, err := resolveBatchResult(batchOperation, rawBody)
	if err != nil {
		errMessage := clampEmbeddingOperationErrorMessage(err.Error())
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", errMessage)
		operationRecord.Set("last_polled_at", now)
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
	operationRecord.Set("last_polled_at", now)

	return app.Save(operationRecord)
}

func submitEmbeddingOperationAndEnqueuePoll(app core.App, job *core.Record, chunkRecords []*core.Record) error {
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

	operationRecord, err := createEmbeddingOperationRecord(app, job, chunkIDs, operation.Name, modelName, len(chunks), 10)
	if err != nil {
		return err
	}

	return enqueueEmbeddingPollJob(app, operationRecord, time.Now().UTC().Add(embeddingPollInterval()))
}

func submitEmbeddingOperationAndProcessSync(app core.App, job *core.Record, chunkRecords []*core.Record) error {
	chunks := collectChunkRecords(app, chunkRecords)
	if len(chunks) == 0 {
		return nil
	}

	chunkIDs := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		chunkIDs = append(chunkIDs, chunk.Record.Id)
	}

	modelName := embeddingModelName()
	providerOperationID := fmt.Sprintf("sync:%s", job.Id)

	operationRecord, err := createEmbeddingOperationRecord(app, job, chunkIDs, providerOperationID, modelName, len(chunks), 1)
	if err != nil {
		return err
	}

	processed, failed, err := processChunkEmbeddingsSyncBulk(app, chunks, modelName)
	now := time.Now().UTC()

	operationRecord.Set("succeeded_chunks", processed)
	operationRecord.Set("failed_chunks", failed)
	operationRecord.Set("total_chunks", len(chunks))
	operationRecord.Set("attempts", 1)

	if err != nil || failed > 0 {
		errMessage := fmt.Sprintf("sync embedding completed with failures: %d", failed)
		if err != nil {
			errMessage = err.Error()
		}
		errMessage = clampEmbeddingOperationErrorMessage(errMessage)
		operationRecord.Set("status", "failing")
		operationRecord.Set("error_message", errMessage)
	} else {
		operationRecord.Set("status", "succeeded")
		operationRecord.Set("error_message", "")
	}

	operationRecord.Set("finished_at", now)

	if err := app.Save(operationRecord); err != nil {
		return err
	}

	return nil
}

func processChunkEmbeddingsSyncBulk(app core.App, chunks []chunkRecord, modelName string) (processed int, failed int, firstErr error) {
	if len(chunks) == 0 {
		return 0, 0, nil
	}

	batchSize := embeddingMaxBatchSize()
	for start := 0; start < len(chunks); start += batchSize {
		end := min(start+batchSize, len(chunks))
		batch := chunks[start:end]

		parts := make([]restPart, len(batch))
		for i, chunk := range batch {
			parts[i] = restPart{Text: chunk.Content}
		}

		vectors, err := submitBulkEmbedContent(context.Background(), modelName, parts)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			failed += len(batch)
			continue
		}

		processable := min(len(vectors), len(batch))
		for i := 0; i < processable; i++ {
			if len(vectors[i]) == 0 {
				failed++
				continue
			}
			if err := storeChunkEmbedding(app, batch[i].Record, vectors[i]); err != nil {
				if firstErr == nil {
					firstErr = err
				}
				failed++
				continue
			}
			processed++
		}

		if len(vectors) < len(batch) {
			failed += len(batch) - len(vectors)
			if firstErr == nil {
				firstErr = fmt.Errorf("sync bulk embed returned fewer embeddings than requested: got %d, expected %d", len(vectors), len(batch))
			}
		}
	}

	return processed, failed, firstErr
}

func createEmbeddingOperationRecord(app core.App, job *core.Record, chunkIDs []string, providerOperationID string, modelName string, totalChunks int, maxAttempts int) (*core.Record, error) {
	collection, _ := app.FindCollectionByNameOrId(collections.EmbeddingJobs)

	if maxAttempts <= 0 {
		maxAttempts = 1
	}

	operationRecord := core.NewRecord(collection)
	operationRecord.Set("job", job.Id)
	jobUpload := job.GetString("upload")
	jobPage := job.GetString("page")
	jobUser := job.GetString("user")
	operationRecord.Set("upload", jobUpload)
	operationRecord.Set("page", jobPage)
	operationRecord.Set("user", jobUser)
	operationRecord.Set("batch_id", providerOperationID)
	operationRecord.Set("status", "submitted")
	operationRecord.Set("chunk_ids", chunkIDs)
	if err := app.Save(operationRecord); err != nil {
		return nil, err
	}

	return operationRecord, nil
}

func handleEmbeddingOperationPollError(app core.App, job *core.Record, operationRecord *core.Record, pollErr error) error {
	now := time.Now().UTC()
	attempts := operationRecord.GetInt("attempts") + 1
	maxAttempts := operationRecord.GetInt("max_attempts")
	if maxAttempts <= 0 {
		maxAttempts = 10
	}

	operationRecord.Set("attempts", attempts)
	operationRecord.Set("error_message", clampEmbeddingOperationErrorMessage(pollErr.Error()))
	operationRecord.Set("last_polled_at", now)

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

func enqueueEmbeddingPollJob(app core.App, operationRecord *core.Record, scheduledAt time.Time) error {
	operationID := operationRecord.Id
	dedupeKey := fmt.Sprintf("chunk.embed.poll:%s", operationID)
	userID := operationRecord.GetString("user")
	uploadID := operationRecord.GetString("upload")
	pageID := operationRecord.GetString("page")

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkEmbedPoll,
		DedupeKey: dedupeKey,
		Payload: map[string]any{
			"embedding_operation_id": operationID,
		},
		UserID:   userID,
		UploadID: uploadID,
		PageID:   pageID,
	})
}

func rescheduleEmbeddingPollJob(app core.App, job *core.Record, operationRecord *core.Record, scheduledAt time.Time) error {
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
	job.Set("payload", map[string]any{
		"embedding_operation_id": operationRecord.Id,
	})

	jobDedupeKey := strings.TrimSpace(job.GetString("dedupe_key"))
	if jobDedupeKey == "" {
		job.Set("dedupe_key", fmt.Sprintf("chunk.embed.poll:%s", operationRecord.Id))
	}

	if strings.TrimSpace(job.GetString("embedding_operation")) == "" {
		job.Set("embedding_operation", operationRecord.Id)
	}

	jobUser := strings.TrimSpace(job.GetString("user"))
	if jobUser == "" {
		job.Set("user", operationRecord.GetString("user"))
	}

	jobUpload := strings.TrimSpace(job.GetString("upload"))
	if jobUpload == "" {
		job.Set("upload", operationRecord.GetString("upload"))
	}

	jobPage := strings.TrimSpace(job.GetString("page"))
	if jobPage == "" {
		job.Set("page", operationRecord.GetString("page"))
	}

	return app.Save(job)
}

func EnqueuePendingEmbeddingPollJobs(app *pocketbase.PocketBase, limit int) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if limit <= 0 {
		limit = 100
	}

	operations, err := app.FindRecordsByFilter(
		collections.EmbeddingJobs,
		"(status = 'submitted' || status = 'polling') && (next_poll_at = '' || next_poll_at = null || next_poll_at <= {:now})",
		"next_poll_at,created",
		limit,
		0,
		dbx.Params{"now": now},
	)
	if err != nil {
		return err
	}

	for _, operationRecord := range operations {
		opID := operationRecord.Id
		existingJobs, err := app.FindRecordsByFilter(
			collections.Queue,
			"embedding_operation = {:operationId} && job_type = {:jobType} && (status = 'queued' || status = 'running')",
			"",
			1,
			0,
			dbx.Params{"operationId": opID, "jobType": processing.JobTypeChunkEmbedPoll},
		)
		if err != nil {
			continue
		}

		if len(existingJobs) > 0 {
			continue
		}

		nextPollAt := time.Now().UTC()
		if err := enqueueEmbeddingPollJob(app, operationRecord, nextPollAt); err != nil {
			continue
		}

		operationRecord.Set("next_poll_at", nextPollAt)
		if saveErr := app.Save(operationRecord); saveErr != nil {
			continue
		}
	}

	return nil
}

func loadEmbeddableChunkRecords(app core.App, chunkIDs []string) ([]*core.Record, error) {
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

		uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
		if uploadType == "summary" {
			continue
		}

		records = append(records, record)
	}

	return records, nil
}

func embeddingOperationChunkIDs(operationRecord *core.Record) ([]string, error) {
	raw := operationRecord.GetString("chunk_ids")
	if strings.TrimSpace(raw) == "" {
		return nil, fmt.Errorf("embedding operation %s has empty chunk_ids", operationRecord.Id)
	}

	chunkIDs := make([]string, 0)
	if err := json.Unmarshal([]byte(raw), &chunkIDs); err != nil {
		return nil, err
	}

	return chunkIDs, nil
}

func persistEmbeddingBatchResult(app core.App, chunkRecords []*core.Record, result *embedContentBatchResult) (processed int, failed int, err error) {
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
