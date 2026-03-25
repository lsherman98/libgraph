package processing

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

const (
	JobTypeUploadParseOrTranscribe = "upload.parse"
	JobTypeChunkGenerate           = "chunk.generate"
	JobTypePageSummarize           = "page.summarize"
	JobTypeChunkEmbedSubmit        = "chunk.embed"
	JobTypeChunkEmbedPoll          = "chunk.embed.poll"
)

const (
	queuePollInterval = 10 * time.Second
	embedPollInterval = 120 * time.Second

	defaultParseWorkers       = 12
	defaultChunkWorkers       = 100
	defaultSummarizeWorkers   = 8
	defaultEmbedSubmitWorkers = 24
	defaultEmbedPollWorkers   = 24
)

type Worker struct {
	name     string
	jobType  string
	limit    int
	interval time.Duration
}

type JobHandler func(app *pocketbase.PocketBase, job *core.Record) error

type EnqueueRequest struct {
	JobType               string
	DedupeKey             string
	Payload               map[string]any
	UserID                string
	UploadID              string
	PageID                string
	AllowRequeueOnSuccess bool
}

var (
	handlers = map[string]JobHandler{}
)

func RegisterHandler(jobType string, handler JobHandler) {
	handlers[jobType] = handler
}

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		workers := []Worker{
			{name: "parse", jobType: JobTypeUploadParseOrTranscribe, limit: envIntOrDefault("PROCESSING_PARSE_WORKERS", defaultParseWorkers), interval: queuePollInterval},
			{name: "chunk", jobType: JobTypeChunkGenerate, limit: envIntOrDefault("PROCESSING_CHUNK_WORKERS", defaultChunkWorkers), interval: queuePollInterval},
			{name: "summarize", jobType: JobTypePageSummarize, limit: envIntOrDefault("PROCESSING_SUMMARIZE_WORKERS", defaultSummarizeWorkers), interval: queuePollInterval},
			{name: "embed-submit", jobType: JobTypeChunkEmbedSubmit, limit: envIntOrDefault("PROCESSING_EMBED_SUBMIT_WORKERS", defaultEmbedSubmitWorkers), interval: queuePollInterval},
			{name: "embed-poll", jobType: JobTypeChunkEmbedPoll, limit: envIntOrDefault("PROCESSING_EMBED_POLL_WORKERS", defaultEmbedPollWorkers), interval: embedPollInterval},
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

func envIntOrDefault(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func Enqueue(app *pocketbase.PocketBase, req EnqueueRequest) error {
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

	jobsCollection, err := app.FindCollectionByNameOrId(collections.Queue)
	if err != nil {
		return err
	}

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

func processDueJobs(app *pocketbase.PocketBase, worker Worker) error {
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

func claimJob(app *pocketbase.PocketBase, job *core.Record, workerName string) error {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusRunning)
	job.Set("started_at", now)
	job.Set("worker_id", workerName)
	return app.Save(job)
}

func executeJob(app *pocketbase.PocketBase, job *core.Record) error {
	jobType := job.GetString("job_type")
	handler := handlers[jobType]

	return handler(app, job)
}

func handleJobFailure(app *pocketbase.PocketBase, job *core.Record, err error) {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusFailed)
	job.Set("finished_at", now)
	job.Set("error_message", err)
	if err := app.Save(job); err != nil {
		return
	}
}

func markUploadSuccessfulIfComplete(app *pocketbase.PocketBase, job *core.Record) {
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

func recoverHangingProcessingUploads(app *pocketbase.PocketBase) {
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

func RecoverHangingProcessingUploads(app *pocketbase.PocketBase) {
	recoverHangingProcessingUploads(app)
}

func reconcileUploadStatusFromQueue(app *pocketbase.PocketBase, uploadRecord *core.Record) {
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
