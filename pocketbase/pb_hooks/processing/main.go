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
)

type Worker struct {
	name     string
	jobType  string
	limit    int
	interval time.Duration
}

type JobHandler func(app *pocketbase.PocketBase, job *core.Record) error

type EnqueueRequest struct {
	JobType   string
	DedupeKey string
	Payload   map[string]any
	UserID    string
	UploadID  string
	PageID    string
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
			{name: "parse", jobType: JobTypeUploadParseOrTranscribe, limit: 2, interval: queuePollInterval},
			{name: "chunk", jobType: JobTypeChunkGenerate, limit: 4, interval: queuePollInterval},
			{name: "summarize", jobType: JobTypePageSummarize, limit: 4, interval: queuePollInterval},
			{name: "embed-submit", jobType: JobTypeChunkEmbedSubmit, limit: 3, interval: queuePollInterval},
			{name: "embed-poll", jobType: JobTypeChunkEmbedPoll, limit: 8, interval: embedPollInterval},
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

func Enqueue(app *pocketbase.PocketBase, req EnqueueRequest) error {
	existing, err := app.FindFirstRecordByFilter(
		collections.Queue,
		"dedupe_key = {:dedupeKey}",
		dbx.Params{"dedupeKey": req.DedupeKey},
	)
	if err == nil {
		switch existing.GetString("status") {
		case vars.QueueStatusQueued, vars.QueueStatusRunning, vars.QueueStatusSuccess:
			return nil
		case vars.QueueStatusFailed, vars.QueueStatusCancelled:
			existing.Set("status", vars.QueueStatusQueued)
			existing.Set("started_at", nil)
			existing.Set("finished_at", nil)
			existing.Set("error_code", nil)
			existing.Set("error_message", nil)
			existing.Set("payload_json", req.Payload)
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
	record.Set("payload_json", req.Payload)
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
