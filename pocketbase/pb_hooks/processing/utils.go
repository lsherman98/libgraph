package processing

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const retryFailedJobsMaxAge = 15 * time.Minute

func getWorkerCount(name string) int {
	count, _ := strconv.Atoi(os.Getenv(name))
	if count <= 0 {
		return 1
	}

	return count
}

func countRunningJobsByType(app core.App, jobType string) int {
	records, err := app.FindRecordsByFilter(
		collections.Queue,
		"status = {:status} && job_type = {:jobType}",
		"",
		0,
		0,
		dbx.Params{"status": vars.QueueStatusRunning, "jobType": jobType},
	)
	if err != nil {
		return 0
	}

	return len(records)
}

func recoverRunningJobs(app core.App) {
	runningJobs, _ := app.FindRecordsByFilter(
		collections.Queue,
		"status = {:status}",
		"updated",
		0,
		0,
		dbx.Params{"status": vars.QueueStatusRunning},
	)

	for _, job := range runningJobs {
		job.Set("status", vars.QueueStatusQueued)
		job.Set("started_at", nil)
		job.Set("finished_at", nil)
		job.Set("worker_id", nil)
		job.Set("error_code", nil)
		job.Set("error_message", nil)
		if err := app.Save(job); err != nil {
			continue
		}
	}
}

func claimJob(app core.App, job *core.Record, workerName string) error {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusRunning)
	job.Set("started_at", now)
	job.Set("worker_id", workerName)
	return app.Save(job)
}

func executeJob(app core.App, job *core.Record) error {
	switch job.GetString("job_type") {
	case JobTypeUploadParseOrTranscribe:
		return handlers.UploadParse(app, job)
	case JobTypeChunkGenerate:
		return handlers.ChunkGenerate(app, job)
	case JobTypePageSummarize:
		return handlers.PageSummarize(app, job)
	case JobTypeChunkEmbedSubmit:
		return handlers.ChunkEmbedSubmit(app, job)
	case JobTypeChunkEmbedPoll:
		return handlers.ChunkEmbedPoll(app, job)
	default:
		return fmt.Errorf("unknown job type: %s", job.GetString("job_type"))
	}
}

const maxEmbedRetries = 10

// embedRetryBaseDelay is the base delay for exponential backoff on embed job retries.
// Delay = min(embedRetryBaseDelay * 2^retryCount, embedRetryMaxDelay).
const embedRetryBaseDelay = 60 * time.Second
const embedRetryMaxDelay = 30 * time.Minute

func isEmbedJob(jobType string) bool {
	return jobType == JobTypeChunkEmbedSubmit || jobType == JobTypeChunkEmbedPoll
}

func embedRetryDelay(retryCount int) time.Duration {
	delay := embedRetryBaseDelay
	for range retryCount {
		delay *= 2
		if delay >= embedRetryMaxDelay {
			return embedRetryMaxDelay
		}
	}
	return delay
}

func handleJobFailure(app core.App, job *core.Record, err error) {
	jobType := job.GetString("job_type")

	app.Logger().Error("job execution failed",
		"queue_job", job.Id,
		"job_type", jobType,
		"upload", job.GetString("upload"),
		"error", err,
	)

	retryCount := job.GetInt("retry_count")

	if isEmbedJob(jobType) && retryCount < maxEmbedRetries {
		delay := embedRetryDelay(retryCount)
		runAfter := time.Now().UTC().Add(delay)
		app.Logger().Info("resetting embed job to queued for retry",
			"queue_job", job.Id,
			"job_type", jobType,
			"retry_count", retryCount+1,
			"run_after", runAfter,
			"error", err,
		)
		job.Set("status", vars.QueueStatusQueued)
		job.Set("started_at", nil)
		job.Set("finished_at", nil)
		job.Set("worker_id", nil)
		job.Set("error_code", nil)
		job.Set("error_message", nil)
		job.Set("retry_count", retryCount+1)
		job.Set("run_after", runAfter)
		if err := app.Save(job); err != nil {
			app.Logger().Error("failed to reset embed job for retry",
				"queue_job", job.Id,
				"error", err,
			)
		}
		return
	}

	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusFailed)
	job.Set("finished_at", now)
	job.Set("error_message", err.Error())
	if err := app.Save(job); err != nil {
		return
	}

	if err := markUploadFailure(app, job); err != nil {
		app.Logger().Warn("failed to reconcile upload status after job failure",
			"queue_job", job.Id,
			"upload", job.GetString("upload"),
			"error", err,
		)
	}
}

func reconcileUploadStatus(app core.App, upload *core.Record) error {
	uploadType := upload.GetString("type")
	if uploadType == vars.UploadTypeSummary {
		return nil
	}

	status := upload.GetString("status")
	if status == vars.UploadStatusSuccess {
		return nil
	}

	processingJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && (status = 'queued' || status = 'running')",
		"",
		1,
		0,
		dbx.Params{"uploadId": upload.Id},
	)
	if err != nil || len(processingJobs) > 0 {
		return nil
	}

	failedJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && (status = 'failed' || status = 'cancelled')",
		"",
		1,
		0,
		dbx.Params{"uploadId": upload.Id},
	)
	if err != nil || len(failedJobs) > 0 {
		upload.Set("status", vars.UploadStatusFailed)
		if err := app.Save(upload); err != nil {
			return err
		}

		return nil
	}

	successJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && status = 'success'",
		"",
		1,
		0,
		dbx.Params{"uploadId": upload.Id},
	)
	if err != nil || len(successJobs) == 0 {
		return nil
	}

	upload.Set("status", vars.UploadStatusSuccess)
	if err := app.Save(upload); err != nil {
		return err
	}

	return nil
}

func markUploadSuccess(app core.App, job *core.Record) error {
	uploadID := job.GetString("upload")
	if uploadID == "" {
		return nil
	}

	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	if err := reconcileUploadStatus(app, upload); err != nil {
		return err
	}

	return nil
}

func markUploadFailure(app core.App, job *core.Record) error {
	uploadID := job.GetString("upload")
	if uploadID == "" {
		return nil
	}

	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	upload.Set("status", vars.UploadStatusFailed)
	if err := app.Save(upload); err != nil {
		return err
	}

	return nil
}

func RetryFailedJobs(app core.App, limit int) {
	if limit <= 0 {
		limit = 200
	}

	minCreatedAt := time.Now().UTC().Add(-retryFailedJobsMaxAge).Format(time.RFC3339)

	jobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"(status = 'failed' || status = 'cancelled') && created >= {:minCreatedAt}",
		"updated",
		limit,
		0,
		dbx.Params{"minCreatedAt": minCreatedAt},
	)
	if err != nil {
		return
	}

	for _, job := range jobs {
		job.Set("status", vars.QueueStatusQueued)
		job.Set("started_at", nil)
		job.Set("finished_at", nil)
		job.Set("worker_id", nil)
		job.Set("error_code", nil)
		job.Set("error_message", nil)
		if err := app.Save(job); err != nil {
			continue
		}

		uploadID := job.GetString("upload")
		if uploadID == "" {
			continue
		}

		upload, err := app.FindRecordById(collections.Uploads, uploadID)
		if err != nil {
			continue
		}

		if upload.GetString("type") == vars.UploadTypeSummary {
			continue
		}

		upload.Set("status", vars.UploadStatusProcessing)
		if err := app.Save(upload); err != nil {
			continue
		}
	}
}
