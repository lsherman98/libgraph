package vector_search

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
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

	useBatch := batchEmbeddingEnabled()
	app.Logger().Info("[vector_search] chunk embed submit mode selected",
		"batch", useBatch,
		"chunk_count", len(chunks),
		"job_id", job.Id,
	)

	if useBatch {
		return submitEmbeddingOperationAndEnqueuePoll(app, job, chunks)
	}

	return submitEmbeddingOperationAndProcessSync(app, job, chunks)
}

func handleChunkEmbedPollJob(app *pocketbase.PocketBase, job *core.Record) error {
	jobProxy, _ := pbgen.WrapRecord[pbgen.ProcessingJobs](job)

	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}

	operationID := strings.TrimSpace(payload.EmbeddingOperationID)
	if operationID == "" && jobProxy != nil {
		operationID = strings.TrimSpace(jobProxy.GetString("embedding_operation"))
	}
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
	operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)

	status := strings.TrimSpace(operationRecord.GetString("status"))
	if operationProxy != nil {
		switch operationProxy.Status() {
		case pbgen.Succeeded2:
			status = "succeeded"
		case pbgen.Failing:
			status = "failing"
		case pbgen.Cancelled2:
			status = "cancelled"
		case pbgen.Expired:
			status = "expired"
		case pbgen.Polling:
			status = "polling"
		case pbgen.Submitted:
			status = "submitted"
		case pbgen.Queued2:
			status = "queued"
		}
	}
	if status == "succeeded" || status == "failing" || status == "cancelled" || status == "expired" {
		return nil
	}

	now := time.Now().UTC()

	providerOperationID := strings.TrimSpace(operationRecord.GetString("provider_operation_id"))
	if operationProxy != nil {
		providerOperationID = strings.TrimSpace(operationProxy.ProviderOperationId())
	}
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
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Polling)
			operationProxy.SetErrorMessage("")
		} else {
			operationRecord.Set("status", "polling")
			operationRecord.Set("error_message", "")
		}
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
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Failing)
			operationProxy.SetErrorMessage(errMessage)
		} else {
			operationRecord.Set("status", "failing")
			operationRecord.Set("error_message", errMessage)
		}
		operationRecord.Set("last_polled_at", now)
		operationRecord.Set("finished_at", now)
		return app.Save(operationRecord)
	}

	result, err := resolveBatchResult(batchOperation, rawBody)
	if err != nil {
		errMessage := clampEmbeddingOperationErrorMessage(err.Error())
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Failing)
			operationProxy.SetErrorMessage(errMessage)
		} else {
			operationRecord.Set("status", "failing")
			operationRecord.Set("error_message", errMessage)
		}
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

	if operationProxy != nil {
		operationProxy.SetSucceededChunks(float64(processed))
		operationProxy.SetFailedChunks(float64(failed))
		operationProxy.SetTotalChunks(float64(len(chunkRecords)))
	} else {
		operationRecord.Set("succeeded_chunks", processed)
		operationRecord.Set("failed_chunks", failed)
		operationRecord.Set("total_chunks", len(chunkRecords))
	}
	operationRecord.Set("finished_at", now)
	if failed > 0 {
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Failing)
			operationProxy.SetErrorMessage(fmt.Sprintf("embedding batch completed with failures: %d", failed))
		} else {
			operationRecord.Set("status", "failing")
			operationRecord.Set("error_message", fmt.Sprintf("embedding batch completed with failures: %d", failed))
		}
	} else {
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Succeeded2)
			operationProxy.SetErrorMessage("")
		} else {
			operationRecord.Set("status", "succeeded")
			operationRecord.Set("error_message", "")
		}
	}
	operationRecord.Set("last_polled_at", now)

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

	operationRecord, _, err := createEmbeddingOperationRecord(app, job, chunkIDs, operation.Name, modelName, len(chunks), 10)
	if err != nil {
		return err
	}

	return enqueueEmbeddingPollJob(app, operationRecord, time.Now().UTC().Add(embeddingPollInterval()))
}

func submitEmbeddingOperationAndProcessSync(app *pocketbase.PocketBase, job *core.Record, chunkRecords []*core.Record) error {
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

	operationRecord, operationProxy, err := createEmbeddingOperationRecord(app, job, chunkIDs, providerOperationID, modelName, len(chunks), 1)
	if err != nil {
		return err
	}

	processed, failed, processErr := processChunkEmbeddingsSyncBulk(app, chunks, modelName)
	now := time.Now().UTC()

	if operationProxy != nil {
		operationProxy.SetSucceededChunks(float64(processed))
		operationProxy.SetFailedChunks(float64(failed))
		operationProxy.SetTotalChunks(float64(len(chunks)))
		operationProxy.SetAttempts(1)
	} else {
		operationRecord.Set("succeeded_chunks", processed)
		operationRecord.Set("failed_chunks", failed)
		operationRecord.Set("total_chunks", len(chunks))
		operationRecord.Set("attempts", 1)
	}

	if processErr != nil || failed > 0 {
		errMessage := fmt.Sprintf("sync embedding completed with failures: %d", failed)
		if processErr != nil {
			errMessage = processErr.Error()
		}
		errMessage = clampEmbeddingOperationErrorMessage(errMessage)
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Failing)
			operationProxy.SetErrorMessage(errMessage)
		} else {
			operationRecord.Set("status", "failing")
			operationRecord.Set("error_message", errMessage)
		}
	} else {
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Succeeded2)
			operationProxy.SetErrorMessage("")
		} else {
			operationRecord.Set("status", "succeeded")
			operationRecord.Set("error_message", "")
		}
	}

	operationRecord.Set("finished_at", now)

	if err := app.Save(operationRecord); err != nil {
		return err
	}

	app.Logger().Info("[vector_search] sync bulk embedding completed",
		"job_id", job.Id,
		"model", modelName,
		"processed", processed,
		"failed", failed,
	)

	return nil
}

func processChunkEmbeddingsSyncBulk(app *pocketbase.PocketBase, chunks []chunkRecord, modelName string) (processed int, failed int, firstErr error) {
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
			app.Logger().Error("[vector_search] sync bulk embed request failed",
				"model", modelName,
				"start", start,
				"end", end,
				"error", err,
			)
			continue
		}

		firstVectorDims := 0
		if len(vectors) > 0 && len(vectors[0]) > 0 {
			firstVectorDims = len(vectors[0])
		}
		app.Logger().Info("[vector_search] sync bulk embed response",
			"model", modelName,
			"start", start,
			"end", end,
			"requested", len(batch),
			"returned", len(vectors),
			"first_vector_dims", firstVectorDims,
		)

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
			app.Logger().Warn("[vector_search] sync bulk embed returned fewer vectors than requested",
				"model", modelName,
				"start", start,
				"end", end,
				"requested", len(batch),
				"returned", len(vectors),
			)
			if firstErr == nil {
				firstErr = fmt.Errorf("sync bulk embed returned fewer embeddings than requested: got %d, expected %d", len(vectors), len(batch))
			}
		}
	}

	return processed, failed, firstErr
}

func createEmbeddingOperationRecord(app *pocketbase.PocketBase, job *core.Record, chunkIDs []string, providerOperationID string, modelName string, totalChunks int, maxAttempts int) (*core.Record, *pbgen.EmbeddingOperations, error) {
	collection, err := app.FindCollectionByNameOrId(collections.EmbeddingOperations)
	if err != nil {
		return nil, nil, err
	}

	if maxAttempts <= 0 {
		maxAttempts = 1
	}

	jobProxy, _ := pbgen.WrapRecord[pbgen.ProcessingJobs](job)
	operationRecord := core.NewRecord(collection)
	operationRecord.Set("processing_job", job.Id)
	jobUpload := job.GetString("upload")
	jobPage := job.GetString("page")
	jobUser := job.GetString("user")
	if jobProxy != nil {
		jobUpload = jobProxy.GetString("upload")
		jobPage = jobProxy.GetString("page")
		jobUser = jobProxy.GetString("user")
	}
	operationRecord.Set("upload", jobUpload)
	operationRecord.Set("page", jobPage)
	operationRecord.Set("user", jobUser)

	operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)
	if operationProxy != nil {
		operationProxy.SetProvider("gemini")
		operationProxy.SetProviderOperationId(providerOperationID)
		operationProxy.SetStatus(pbgen.Submitted)
		operationProxy.SetModel(modelName)
		operationProxy.SetTotalChunks(float64(totalChunks))
		operationProxy.SetSucceededChunks(0)
		operationProxy.SetFailedChunks(0)
		operationProxy.SetAttempts(0)
		operationProxy.SetMaxAttempts(float64(maxAttempts))
		operationProxy.SetErrorMessage("")
	} else {
		operationRecord.Set("provider", "gemini")
		operationRecord.Set("provider_operation_id", providerOperationID)
		operationRecord.Set("status", "submitted")
		operationRecord.Set("model", modelName)
		operationRecord.Set("total_chunks", totalChunks)
		operationRecord.Set("succeeded_chunks", 0)
		operationRecord.Set("failed_chunks", 0)
		operationRecord.Set("attempts", 0)
		operationRecord.Set("max_attempts", maxAttempts)
		operationRecord.Set("error_message", "")
	}
	operationRecord.Set("chunk_ids_json", chunkIDs)
	operationRecord.Set("submitted_at", time.Now().UTC())
	if err := app.Save(operationRecord); err != nil {
		return nil, nil, err
	}

	return operationRecord, operationProxy, nil
}

func handleEmbeddingOperationPollError(app *pocketbase.PocketBase, job *core.Record, operationRecord *core.Record, pollErr error) error {
	operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)

	now := time.Now().UTC()
	attempts := operationRecord.GetInt("attempts") + 1
	maxAttempts := operationRecord.GetInt("max_attempts")
	if operationProxy != nil {
		attempts = int(operationProxy.Attempts()) + 1
		maxAttempts = int(operationProxy.MaxAttempts())
	}
	if maxAttempts <= 0 {
		maxAttempts = 10
	}

	if operationProxy != nil {
		operationProxy.SetAttempts(float64(attempts))
		operationProxy.SetErrorMessage(clampEmbeddingOperationErrorMessage(pollErr.Error()))
	} else {
		operationRecord.Set("attempts", attempts)
		operationRecord.Set("error_message", clampEmbeddingOperationErrorMessage(pollErr.Error()))
	}
	operationRecord.Set("last_polled_at", now)

	if attempts >= maxAttempts {
		if operationProxy != nil {
			operationProxy.SetStatus(pbgen.Failing)
		} else {
			operationRecord.Set("status", "failing")
		}
		operationRecord.Set("finished_at", now)
		return app.Save(operationRecord)
	}

	nextPollAt := now.Add(embeddingPollInterval())
	if operationProxy != nil {
		operationProxy.SetStatus(pbgen.Polling)
	} else {
		operationRecord.Set("status", "polling")
	}
	operationRecord.Set("next_poll_at", nextPollAt)
	if err := app.Save(operationRecord); err != nil {
		return err
	}

	return rescheduleEmbeddingPollJob(app, job, operationRecord, nextPollAt)
}

func enqueueEmbeddingPollJob(app *pocketbase.PocketBase, operationRecord *core.Record, scheduledAt time.Time) error {
	operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)

	operationID := operationRecord.Id
	dedupeKey := fmt.Sprintf("chunk.embed.poll:%s", operationID)
	userID := operationRecord.GetString("user")
	uploadID := operationRecord.GetString("upload")
	pageID := operationRecord.GetString("page")
	if operationProxy != nil {
		userID = operationProxy.GetString("user")
		uploadID = operationProxy.GetString("upload")
		pageID = operationProxy.GetString("page")
	}

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkEmbedPoll,
		DedupeKey: dedupeKey,
		Payload: map[string]any{
			"embedding_operation_id": operationID,
		},
		Priority:             100,
		MaxAttempts:          5,
		ScheduledAt:          &scheduledAt,
		UserID:               userID,
		UploadID:             uploadID,
		PageID:               pageID,
		EmbeddingOperationID: operationID,
	})
}

func rescheduleEmbeddingPollJob(app *pocketbase.PocketBase, job *core.Record, operationRecord *core.Record, scheduledAt time.Time) error {
	jobProxy, _ := pbgen.WrapRecord[pbgen.ProcessingJobs](job)
	operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)

	if job == nil {
		return enqueueEmbeddingPollJob(app, operationRecord, scheduledAt)
	}

	if jobProxy != nil {
		jobProxy.SetStatus(pbgen.Queued)
	} else {
		job.Set("status", "queued")
	}
	job.Set("scheduled_at", scheduledAt)
	job.Set("lease_until", nil)
	job.Set("started_at", nil)
	job.Set("finished_at", nil)
	if jobProxy != nil {
		jobProxy.SetErrorCode("")
		jobProxy.SetErrorMessage("")
	} else {
		job.Set("error_code", "")
		job.Set("error_message", "")
	}
	job.Set("payload_json", map[string]any{
		"embedding_operation_id": operationRecord.Id,
	})

	jobDedupeKey := strings.TrimSpace(job.GetString("dedupe_key"))
	if jobProxy != nil {
		jobDedupeKey = strings.TrimSpace(jobProxy.DedupeKey())
	}
	if jobDedupeKey == "" {
		if jobProxy != nil {
			jobProxy.SetDedupeKey(fmt.Sprintf("chunk.embed.poll:%s", operationRecord.Id))
		} else {
			job.Set("dedupe_key", fmt.Sprintf("chunk.embed.poll:%s", operationRecord.Id))
		}
	}

	if strings.TrimSpace(job.GetString("embedding_operation")) == "" {
		job.Set("embedding_operation", operationRecord.Id)
	}

	jobUser := strings.TrimSpace(job.GetString("user"))
	if jobProxy != nil {
		jobUser = strings.TrimSpace(jobProxy.GetString("user"))
	}
	if jobUser == "" {
		operationUser := operationRecord.GetString("user")
		if operationProxy != nil {
			operationUser = operationProxy.GetString("user")
		}
		job.Set("user", operationUser)
	}

	jobUpload := strings.TrimSpace(job.GetString("upload"))
	if jobProxy != nil {
		jobUpload = strings.TrimSpace(jobProxy.GetString("upload"))
	}
	if jobUpload == "" {
		operationUpload := operationRecord.GetString("upload")
		if operationProxy != nil {
			operationUpload = operationProxy.GetString("upload")
		}
		job.Set("upload", operationUpload)
	}

	jobPage := strings.TrimSpace(job.GetString("page"))
	if jobProxy != nil {
		jobPage = strings.TrimSpace(jobProxy.GetString("page"))
	}
	if jobPage == "" {
		operationPage := operationRecord.GetString("page")
		if operationProxy != nil {
			operationPage = operationProxy.GetString("page")
		}
		job.Set("page", operationPage)
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
		operationProxy, _ := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord)
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
		if operationProxy != nil {
			operationRecord.Set("next_poll_at", nextPollAt)
		}
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
		chunkProxy, _ := pbgen.WrapRecord[pbgen.DocumentChunks](record)

		uploadID := strings.TrimSpace(record.GetString("upload"))
		if chunkProxy != nil {
			uploadID = strings.TrimSpace(chunkProxy.GetString("upload"))
		}
		if uploadID == "" {
			continue
		}
		uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
		if err != nil {
			return nil, err
		}
		uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
		uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
		if uploadProxy != nil {
			uploadType = strings.TrimSpace(uploadProxy.GetString("type"))
		}
		if uploadType == "summary" {
			continue
		}

		records = append(records, record)
	}

	return records, nil
}

func embeddingOperationChunkIDs(operationRecord *core.Record) ([]string, error) {
	raw := operationRecord.GetString("chunk_ids_json")
	if operationProxy, err := pbgen.WrapRecord[pbgen.EmbeddingOperations](operationRecord); err == nil {
		raw = operationProxy.ChunkIdsJson()
	}
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
