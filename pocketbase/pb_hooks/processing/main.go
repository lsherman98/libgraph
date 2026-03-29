package processing

import (
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase, h Handlers) error {
	handlers = h

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		recoverHangingJobs(app)

		workers := []Worker{
			{name: "parse", jobType: JobTypeUploadParseOrTranscribe, limit: getWorkerCount("PROCESSING_PARSE_WORKERS"), interval: queuePollInterval},
			{name: "chunk", jobType: JobTypeChunkGenerate, limit: getWorkerCount("PROCESSING_CHUNK_WORKERS"), interval: queuePollInterval},
			{name: "summarize", jobType: JobTypePageSummarize, limit: getWorkerCount("PROCESSING_SUMMARIZE_WORKERS"), interval: queuePollInterval},
			{name: "embed-submit", jobType: JobTypeChunkEmbedSubmit, limit: getWorkerCount("PROCESSING_EMBED_SUBMIT_WORKERS"), interval: queuePollInterval},
			{name: "embed-poll", jobType: JobTypeChunkEmbedPoll, limit: getWorkerCount("PROCESSING_EMBED_POLL_WORKERS"), interval: embedPollInterval},
		}

		for _, worker := range workers {
			routine.FireAndForget(func() {
				ticker := time.NewTicker(worker.interval)
				defer ticker.Stop()

				for range ticker.C {
					processDueJobs(app, worker)
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
	if err != nil {
		return err
	}

	if existing != nil {
		switch existing.GetString("status") {
		case vars.QueueStatusQueued, vars.QueueStatusRunning, vars.QueueStatusSuccess:
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
	if err = app.Save(record); err != nil {
		return err
	}

	return nil
}

func processDueJobs(app core.App, worker Worker) error {
	jobs, err := app.FindRecordsByFilter(
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

	for _, job := range jobs {
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

		if err := markUploadSuccess(app, job); err != nil {
			continue
		}
	}

	return nil
}

func recoverHangingJobs(app core.App) {
	recoverRunningJobs(app)

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
		if err := reconcileUploadStatus(app, uploadRecord); err != nil {
			continue
		}
	}
}
