package vector_search

import (
	"context"
	"fmt"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func HandleEmbedPollJob(app core.App, job *core.Record) error {
	payload := EmbedPayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return err
	}

	embedding, err := app.FindRecordById(collections.EmbeddingJobs, payload.EmbeddingJobID)
	if err != nil {
		return err
	}

	status := embedding.GetString("status")
	if status == vars.EmbeddingStatusSucceeded || status == vars.EmbeddingStatusFailed {
		return nil
	}

	now := time.Now().UTC()
	batchId := embedding.GetString("batch_id")

	batch, err := getBatchOperation(context.Background(), batchId)
	if err != nil {
		return handlePollError(app, job, embedding, err)
	}

	isDone, err := getBatchJobStatus(batch)
	if err != nil {
		return handlePollError(app, job, embedding, err)
	}

	if isDone {
		embedding.Set("last_polled_at", now)
		embedding.Set("finished_at", now)
		embedding.Set("status", vars.EmbeddingStatusSucceeded)
		if err := app.Save(embedding); err != nil {
			return err
		}
	} else {
		nextPollAt := now.Add(pollInterval)
		embedding.Set("status", vars.EmbeddingStatusPolling)
		embedding.Set("last_polled_at", now)
		embedding.Set("next_poll_at", nextPollAt)
		if err := app.Save(embedding); err != nil {
			return err
		}

		return reschedulePollJob(app, job, embedding, nextPollAt)
	}

	result, err := resolveBatchResult(batch)
	if err != nil {
		embedding.Set("status", vars.EmbeddingStatusFailed)
		embedding.Set("error_message", err.Error())
		if err := app.Save(embedding); err != nil {
			return err
		}
		return err
	}

	chunkRecords, err := loadChunkRecords(app, payload.ChunkIDs)
	if err != nil {
		return err
	}

	_, failed, err := persistEmbeddingBatchResult(app, chunkRecords, result)
	if err != nil {
		return err
	}

	if failed > 0 {
		embedding.Set("status", vars.EmbeddingStatusFailed)
		embedding.Set("error_message", fmt.Sprintf("embedding batch completed with failures: %d", failed))
	}

	return app.Save(embedding)
}

func handlePollError(app core.App, job *core.Record, embeddingJob *core.Record, err error) error {
	now := time.Now().UTC()
	nextPollAt := now.Add(pollInterval)

	embeddingJob.Set("error_message", err.Error())
	embeddingJob.Set("last_polled_at", now)
	embeddingJob.Set("status", vars.EmbeddingStatusPolling)
	embeddingJob.Set("next_poll_at", nextPollAt)
	if err := app.Save(embeddingJob); err != nil {
		return err
	}

	return reschedulePollJob(app, job, embeddingJob, nextPollAt)
}

func enqueuePollJob(app core.App, embeddingJob *core.Record) error {
	embeddingJobID := embeddingJob.Id
	dedupeKey := fmt.Sprintf("chunk.embed.poll:%s", embeddingJobID)
	userID := embeddingJob.GetString("user")
	uploadID := embeddingJob.GetString("upload")
	pageID := embeddingJob.GetString("page")

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkEmbedPoll,
		DedupeKey: dedupeKey,
		Payload: map[string]any{
			"embedding_job_id": embeddingJobID,
		},
		UserID:   userID,
		UploadID: uploadID,
		PageID:   pageID,
	})
}

func reschedulePollJob(app core.App, job *core.Record, embeddingJob *core.Record, scheduledAt time.Time) error {
	if job == nil {
		return enqueuePollJob(app, embeddingJob)
	}

	job.Set("status", vars.QueueStatusQueued)
	job.Set("scheduled_at", scheduledAt)
	job.Set("payload", map[string]any{
		"embedding_job_id": embeddingJob.Id,
	})

	return app.Save(job)
}

func EnqueuePendingPollJobs(app *pocketbase.PocketBase, limit int) error {
	now := time.Now().UTC().Format(time.RFC3339)

	embeddingJobs, err := app.FindRecordsByFilter(
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

	for _, embeddingJob := range embeddingJobs {
		dedupeKey := fmt.Sprintf("chunk.embed.poll:%s", embeddingJob.Id)

		existingJob, err := app.FindFirstRecordByFilter(
			collections.Queue,
			"dedupe_key = {:dedupeKey} && job_type = {:jobType} && (status = 'queued' || status = 'running')",
			dbx.Params{"dedupeKey": dedupeKey, "jobType": processing.JobTypeChunkEmbedPoll},
		)
		if err == nil && existingJob != nil {
			continue
		}

		nextPollAt := time.Now().UTC()
		if err := enqueuePollJob(app, embeddingJob); err != nil {
			continue
		}

		embeddingJob.Set("next_poll_at", nextPollAt)
		if err := app.Save(embeddingJob); err != nil {
			continue
		}
	}

	return nil
}
