package processing

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func isDedupeKeyUniqueError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "dedupe_key") && strings.Contains(message, "unique")
}

func Init(app *pocketbase.PocketBase, h Handlers) error {
	handlers = h

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		recoverHangingJobs(se.App)

		workers := configuredWorkers()

		for _, worker := range workers {
			routine.FireAndForget(func() {
				ticker := time.NewTicker(worker.interval)
				defer ticker.Stop()

				for range ticker.C {
					processDueJobs(se.App, worker)
				}
			})
		}

		return se.Next()
	})

	return nil
}

func configuredWorkers() []Worker {
	return []Worker{
		{name: "parse", jobType: JobTypeUploadParseOrTranscribe, limit: getWorkerCount("PROCESSING_PARSE_WORKERS"), interval: queuePollInterval},
		{name: "chunk", jobType: JobTypeChunkGenerate, limit: getWorkerCount("PROCESSING_CHUNK_WORKERS"), interval: queuePollInterval},
		{name: "summarize", jobType: JobTypePageSummarize, limit: getWorkerCount("PROCESSING_SUMMARIZE_WORKERS"), interval: queuePollInterval},
		{name: "embed-submit", jobType: JobTypeChunkEmbedSubmit, limit: 20, interval: queuePollInterval},
		{name: "embed-poll", jobType: JobTypeChunkEmbedPoll, limit: 20, interval: embedPollInterval},
	}
}

func Enqueue(app core.App, req EnqueueRequest) error {
	existing, err := app.FindFirstRecordByFilter(
		collections.Queue,
		"dedupe_key = {:dedupeKey}",
		dbx.Params{"dedupeKey": req.DedupeKey},
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
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
			existing.Set("page", req.PageID)
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
		if isDedupeKeyUniqueError(err) {
			existing, findErr := app.FindFirstRecordByFilter(
				collections.Queue,
				"dedupe_key = {:dedupeKey}",
				dbx.Params{"dedupeKey": req.DedupeKey},
			)
			if findErr == nil && existing != nil {
				return nil
			}
		}

		return err
	}

	return nil
}

func processDueJobs(app core.App, worker Worker) error {
	runningJobs := countRunningJobsByType(app, worker.jobType)
	availableSlots := worker.limit - runningJobs
	if availableSlots <= 0 {
		return nil
	}

	if worker.jobType == JobTypeChunkEmbedSubmit && runningJobs > 0 {
		availableSlots = 0
	}

	now := time.Now().UTC().Format(time.RFC3339)
	jobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"status = 'queued' && job_type = {:jobType} && (run_after = '' || run_after = null || run_after <= {:now})",
		"created",
		availableSlots,
		0,
		dbx.Params{"jobType": worker.jobType, "now": now},
	)
	if err != nil {
		return err
	}

	for _, job := range jobs {
		if err := claimJob(app, job, worker.name); err != nil {
			continue
		}

		routine.FireAndForget(func() {
			err := executeJob(app, job)
			if err != nil {
				handleJobFailure(app, job, err)
				return
			}

			job.Set("status", vars.QueueStatusSuccess)
			job.Set("finished_at", time.Now().UTC())
			if err := app.Save(job); err != nil {
				return
			}

			if job.GetString("job_type") == JobTypeChunkGenerate && handlers.ChunkGenerateSuccess != nil {
				if err := handlers.ChunkGenerateSuccess(app, job); err != nil {
					handleJobFailure(app, job, err)
					return
				}
			}

			if err := markUploadSuccess(app, job); err != nil {
				return
			}
		})
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
