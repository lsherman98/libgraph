package processing

import (
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func RegisterHandler(jobType string, handler JobHandler) {
	handlers[jobType] = handler
}

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		workers := []Worker{
			{name: "parse", jobType: JobTypeUploadParseOrTranscribe, limit: getWorkerCount("PROCESSING_PARSE_WORKERS"), interval: queuePollInterval},
			{name: "chunk", jobType: JobTypeChunkGenerate, limit: getWorkerCount("PROCESSING_CHUNK_WORKERS"), interval: queuePollInterval},
			{name: "summarize", jobType: JobTypePageSummarize, limit: getWorkerCount("PROCESSING_SUMMARIZE_WORKERS"), interval: queuePollInterval},
			{name: "embed-submit", jobType: JobTypeChunkEmbedSubmit, limit: getWorkerCount("PROCESSING_EMBED_SUBMIT_WORKERS"), interval: queuePollInterval},
			{name: "embed-poll", jobType: JobTypeChunkEmbedPoll, limit: getWorkerCount("PROCESSING_EMBED_POLL_WORKERS"), interval: embedPollInterval},
		}

		for _, spec := range workers {
			routine.FireAndForget(func() {
				ticker := time.NewTicker(spec.interval)
				defer ticker.Stop()

				for range ticker.C {
					processDueJobs(app, spec)
				}
			})
		}

		return se.Next()
	})

	return nil
}

func Enqueue(app core.App, req EnqueueRequest) error {
	existing, err := app.FindFirstRecordByFilter(
		collections.Queue,
		"dedupe_key = {:dedupeKey}",
		dbx.Params{"dedupeKey": req.DedupeKey},
	)
	if err == nil {
		switch existing.GetString("status") {
		case vars.QueueStatusQueued, vars.QueueStatusRunning, vars.QueueStatusSuccess:
			if existing.GetString("status") == vars.QueueStatusSuccess && req.AllowRequeueOnSuccess {
				existing.Set("status", vars.QueueStatusQueued)
				existing.Set("started_at", nil)
				existing.Set("finished_at", nil)
				existing.Set("error_code", nil)
				existing.Set("error_message", nil)
				existing.Set("payload", req.Payload)
				existing.Set("user", req.UserID)
				existing.Set("upload", req.UploadID)
				existing.Set("page", req.PageID)
				return app.Save(existing)
			}
			return nil
		case vars.QueueStatusFailed, vars.QueueStatusCancelled:
			existing.Set("status", vars.QueueStatusQueued)
			existing.Set("started_at", nil)
			existing.Set("finished_at", nil)
			existing.Set("error_code", nil)
			existing.Set("error_message", nil)
			existing.Set("payload", req.Payload)
			return app.Save(existing)
		default:
			return nil
		}
	}

	jobsCollection, _ := app.FindCollectionByNameOrId(collections.Queue)

	record := core.NewRecord(jobsCollection)
	record.Set("job_type", req.JobType)
	record.Set("status", vars.QueueStatusQueued)
	record.Set("dedupe_key", req.DedupeKey)
	record.Set("payload", req.Payload)
	record.Set("user", req.UserID)
	record.Set("upload", req.UploadID)
	record.Set("page", req.PageID)

	err = app.Save(record)
	if err != nil {
		return err
	}

	return nil
}

func processDueJobs(app core.App, worker Worker) error {
	records, err := app.FindRecordsByFilter(
		collections.Queue,
		"status = 'queued' && job_type = {:jobType}",
		"created",
		worker.limit,
		0,
		dbx.Params{"jobType": worker.jobType},
	)
	if err != nil {
		return err
	}

	for _, job := range records {
		if err := claimJob(app, job, worker.name); err != nil {
			continue
		}

		err := executeJob(app, job)
		if err != nil {
			handleJobFailure(app, job, err)
			continue
		}

		job.Set("status", vars.QueueStatusSuccess)
		job.Set("finished_at", time.Now().UTC())
		if err := app.Save(job); err != nil {
			continue
		}

		markUploadSuccessfulIfComplete(app, job)
	}

	return nil
}

func claimJob(app core.App, job *core.Record, workerName string) error {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusRunning)
	job.Set("started_at", now)
	job.Set("worker_id", workerName)
	return app.Save(job)
}

func executeJob(app core.App, job *core.Record) error {
	jobType := job.GetString("job_type")
	handler := handlers[jobType]

	return handler(app, job)
}

func handleJobFailure(app core.App, job *core.Record, err error) {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusFailed)
	job.Set("finished_at", now)
	job.Set("error_message", err.Error())
	if err := app.Save(job); err != nil {
		return
	}
}

func markUploadSuccessfulIfComplete(app core.App, job *core.Record) {
	uploadID := job.GetString("upload")
	if uploadID == "" {
		return
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return
	}

	reconcileUploadStatusFromQueue(app, uploadRecord)
}

func RecoverHangingProcessingUploads(app core.App) {
	uploads, err := app.FindRecordsByFilter(
		collections.Uploads,
		"status = {:status}",
		"updated",
		0,
		0,
		dbx.Params{"status": vars.UploadStatusProcessing},
	)
	if err != nil {
		return
	}

	for _, uploadRecord := range uploads {
		reconcileUploadStatusFromQueue(app, uploadRecord)
	}
}

func reconcileUploadStatusFromQueue(app core.App, uploadRecord *core.Record) {
	if uploadRecord == nil {
		return
	}

	uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
	if uploadType == vars.UploadTypeSummary {
		return
	}

	uploadID := strings.TrimSpace(uploadRecord.Id)
	if uploadID == "" {
		return
	}

	status := strings.TrimSpace(uploadRecord.GetString("status"))
	if status == vars.UploadStatusSuccess || status == vars.UploadStatusFailed {
		return
	}

	inFlightJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && (status = 'queued' || status = 'running')",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil || len(inFlightJobs) > 0 {
		return
	}

	failedJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && (status = 'failed' || status = 'cancelled')",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil || len(failedJobs) > 0 {
		uploadRecord.Set("status", vars.UploadStatusFailed)
		app.Save(uploadRecord)
		return
	}

	successJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && status = 'success'",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil || len(successJobs) == 0 {
		return
	}

	uploadRecord.Set("status", vars.UploadStatusSuccess)
	app.Save(uploadRecord)
}
