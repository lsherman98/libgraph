package processing

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

const (
	JobTypeUploadParseOrTranscribe = "upload.parse_or_transcribe"
	JobTypeChunkGenerate           = "chunk.generate"
	JobTypePageSummarize           = "page.summarize"
	JobTypeChunkEmbedSubmit        = "chunk.embed.submit"
	JobTypeChunkEmbedPoll          = "chunk.embed.poll"
)

const (
	queuePollInterval = 10 * time.Second
	embedPollInterval = 120 * time.Second
	queueLeaseWindow  = 10 * time.Minute
	workerID          = "pb-main-worker"
)

type workerSpec struct {
	name     string
	jobTypes []string
	limit    int
	interval time.Duration
}

type JobHandler func(app *pocketbase.PocketBase, job *core.Record) error

type EnqueueRequest struct {
	JobType              string
	DedupeKey            string
	Payload              map[string]any
	Priority             int
	MaxAttempts          int
	ScheduledAt          *time.Time
	UserID               string
	UploadID             string
	PageID               string
	ChunkID              string
	EmbeddingOperationID string
}

var (
	handlersMu sync.RWMutex
	handlers   = map[string]JobHandler{}
)

const processingJobErrorMessageMaxLen = 5000

func clampProcessingJobErrorMessage(message string) string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return ""
	}

	runes := []rune(trimmed)
	if len(runes) <= processingJobErrorMessageMaxLen {
		return trimmed
	}

	suffix := " ... (truncated)"
	maxContentLen := processingJobErrorMessageMaxLen - len([]rune(suffix))
	if maxContentLen <= 0 {
		return string(runes[:processingJobErrorMessageMaxLen])
	}

	return string(runes[:maxContentLen]) + suffix
}

func RegisterHandler(jobType string, handler JobHandler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	handlers[jobType] = handler
}

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		workers := []workerSpec{
			{name: "upload-parse", jobTypes: []string{JobTypeUploadParseOrTranscribe}, limit: 2, interval: queuePollInterval},
			{name: "chunk-generate", jobTypes: []string{JobTypeChunkGenerate}, limit: 4, interval: queuePollInterval},
			{name: "page-summarize", jobTypes: []string{JobTypePageSummarize}, limit: 4, interval: queuePollInterval},
			{name: "embed-submit", jobTypes: []string{JobTypeChunkEmbedSubmit}, limit: 3, interval: queuePollInterval},
			{name: "embed-poll", jobTypes: []string{JobTypeChunkEmbedPoll}, limit: 8, interval: embedPollInterval},
		}

		for _, spec := range workers {
			spec := spec
			routine.FireAndForget(func() {
				interval := spec.interval
				if interval <= 0 {
					interval = queuePollInterval
				}
				ticker := time.NewTicker(interval)
				defer ticker.Stop()

				for {
					processDueJobs(app, spec)
					<-ticker.C
				}
			})
		}

		return se.Next()
	})

	return nil
}

func Enqueue(app *pocketbase.PocketBase, req EnqueueRequest) error {
	if strings.TrimSpace(req.JobType) == "" {
		return fmt.Errorf("processing enqueue: job type is required")
	}
	if strings.TrimSpace(req.DedupeKey) == "" {
		return fmt.Errorf("processing enqueue: dedupe key is required")
	}
	if req.Priority == 0 {
		req.Priority = 100
	}
	if req.MaxAttempts == 0 {
		req.MaxAttempts = 5
	}

	now := time.Now().UTC()
	scheduledAt := now
	if req.ScheduledAt != nil {
		scheduledAt = req.ScheduledAt.UTC()
	}

	existing, err := app.FindFirstRecordByFilter(
		collections.ProcessingJobs,
		"dedupe_key = {:dedupeKey}",
		dbx.Params{"dedupeKey": req.DedupeKey},
	)
	if err == nil {
		switch strings.TrimSpace(existing.GetString("status")) {
		case vars.QueueStatusQueued, vars.QueueStatusRunning, vars.QueueStatusSucceeded:
			return nil
		case vars.QueueStatusFailed, vars.QueueStatusDeadletter, vars.QueueStatusCancelled:
			existing.Set("status", vars.QueueStatusQueued)
			existing.Set("attempts", 0)
			existing.Set("scheduled_at", scheduledAt)
			existing.Set("lease_until", nil)
			existing.Set("started_at", nil)
			existing.Set("finished_at", nil)
			existing.Set("error_code", "")
			existing.Set("error_message", "")
			existing.Set("payload_json", req.Payload)
			existing.Set("priority", req.Priority)
			existing.Set("max_attempts", req.MaxAttempts)
			setOptionalRelations(existing, req)
			return app.Save(existing)
		default:
			return nil
		}
	}

	jobsCollection, colErr := app.FindCollectionByNameOrId(collections.ProcessingJobs)
	if colErr != nil {
		return colErr
	}

	record := core.NewRecord(jobsCollection)
	jobType := JobTypeUploadParseOrTranscribe
	switch req.JobType {
	case JobTypeChunkGenerate:
		jobType = JobTypeChunkGenerate
	case JobTypePageSummarize:
		jobType = JobTypePageSummarize
	case JobTypeChunkEmbedSubmit:
		jobType = JobTypeChunkEmbedSubmit
	case JobTypeChunkEmbedPoll:
		jobType = JobTypeChunkEmbedPoll
	}
	record.Set("job_type", jobType)
	record.Set("status", vars.QueueStatusQueued)
	record.Set("priority", req.Priority)
	record.Set("attempts", 0)
	record.Set("max_attempts", req.MaxAttempts)
	record.Set("scheduled_at", scheduledAt)
	record.Set("dedupe_key", req.DedupeKey)
	record.Set("payload_json", req.Payload)
	setOptionalRelations(record, req)

	saveErr := app.Save(record)
	if saveErr != nil && strings.Contains(strings.ToLower(saveErr.Error()), "unique") {
		return nil
	}

	return saveErr
}

func setOptionalRelations(record *core.Record, req EnqueueRequest) {
	if req.UserID != "" {
		record.Set("user", req.UserID)
	}
	if req.UploadID != "" {
		record.Set("upload", req.UploadID)
	}
	if req.PageID != "" {
		record.Set("page", req.PageID)
	}
	if req.ChunkID != "" {
		record.Set("chunk", req.ChunkID)
	}
	if req.EmbeddingOperationID != "" {
		record.Set("embedding_operation", req.EmbeddingOperationID)
	}
}

func processDueJobs(app *pocketbase.PocketBase, worker workerSpec) {
	if len(worker.jobTypes) == 0 || worker.limit <= 0 {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	jobTypeFilters := make([]string, 0, len(worker.jobTypes))
	params := dbx.Params{"now": now}
	for i, jobType := range worker.jobTypes {
		key := fmt.Sprintf("jobType%d", i)
		jobTypeFilters = append(jobTypeFilters, fmt.Sprintf("job_type = {:%s}", key))
		params[key] = jobType
	}
	jobTypeClause := "(" + strings.Join(jobTypeFilters, " || ") + ")"

	records, err := app.FindRecordsByFilter(
		collections.ProcessingJobs,
		"((status = 'queued' && (scheduled_at = '' || scheduled_at = null || scheduled_at <= {:now})) || (status = 'running' && lease_until != null && lease_until <= {:now})) && "+jobTypeClause,
		"priority,scheduled_at,created",
		worker.limit,
		0,
		params,
	)
	if err != nil {
		app.Logger().Error("[processing] failed to fetch due jobs", "worker", worker.name, "error", err)
		return
	}

	for _, job := range records {
		if err := claimJob(app, job, worker.name); err != nil {
			app.Logger().Warn("[processing] failed to claim job", "jobId", job.Id, "error", err)
			continue
		}

		execErr := executeJob(app, job)
		if execErr != nil {
			handleJobFailure(app, job, execErr)
			continue
		}

		if strings.TrimSpace(job.GetString("status")) != vars.QueueStatusRunning {
			continue
		}

		job.Set("status", vars.QueueStatusSucceeded)
		job.Set("finished_at", time.Now().UTC())
		job.Set("lease_until", nil)
		job.Set("error_code", "")
		job.Set("error_message", "")
		if err := app.Save(job); err != nil {
			app.Logger().Error("[processing] failed to mark job as succeeded", "jobId", job.Id, "error", err)
			continue
		}

		reconcileUploadStatus(app, strings.TrimSpace(job.GetString("upload")))
	}
}

func claimJob(app *pocketbase.PocketBase, job *core.Record, workerName string) error {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusRunning)
	job.Set("lease_until", now.Add(queueLeaseWindow))
	job.Set("started_at", now)
	job.Set("worker_id", fmt.Sprintf("%s:%s", workerID, workerName))
	job.Set("error_code", "")
	job.Set("error_message", "")
	return app.Save(job)
}

func executeJob(app *pocketbase.PocketBase, job *core.Record) error {
	jobType := job.GetString("job_type")

	handlersMu.RLock()
	handler := handlers[jobType]
	handlersMu.RUnlock()

	if handler == nil {
		return fmt.Errorf("no handler registered for job_type=%s", jobType)
	}

	return handler(app, job)
}

func handleJobFailure(app *pocketbase.PocketBase, job *core.Record, execErr error) {
	now := time.Now().UTC()
	attempts := job.GetInt("attempts") + 1
	maxAttempts := job.GetInt("max_attempts")
	if maxAttempts <= 0 {
		maxAttempts = 5
	}

	job.Set("attempts", attempts)
	job.Set("error_message", clampProcessingJobErrorMessage(execErr.Error()))
	job.Set("lease_until", nil)

	if attempts >= maxAttempts {
		job.Set("status", vars.QueueStatusDeadletter)
		job.Set("finished_at", now)
		if err := app.Save(job); err != nil {
			app.Logger().Error("[processing] failed to deadletter job", "jobId", job.Id, "error", err)
			return
		}

		reconcileUploadStatus(app, strings.TrimSpace(job.GetString("upload")))
		return
	}

	backoff := time.Duration(1<<maxInt(0, attempts-1)) * 15 * time.Second
	job.Set("status", vars.QueueStatusQueued)
	job.Set("scheduled_at", now.Add(backoff))
	if err := app.Save(job); err != nil {
		app.Logger().Error("[processing] failed to reschedule job", "jobId", job.Id, "error", err)
	}
}

func reconcileUploadStatus(app *pocketbase.PocketBase, uploadID string) {
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return
	}

	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		app.Logger().Warn("[processing] unable to load upload for status reconciliation", "uploadId", uploadID, "error", err)
		return
	}

	inProgressJobs, err := app.FindRecordsByFilter(
		collections.ProcessingJobs,
		"upload = {:uploadId} && (status = 'queued' || status = 'running')",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil {
		app.Logger().Warn("[processing] unable to query in-progress jobs for upload", "uploadId", uploadID, "error", err)
		return
	}

	if len(inProgressJobs) > 0 {
		if !strings.EqualFold(upload.GetString("status"), vars.UploadStatusProcessing) {
			upload.Set("status", vars.UploadStatusProcessing)
			if saveErr := app.Save(upload); saveErr != nil {
				app.Logger().Warn("[processing] failed to set upload status=PROCESSING", "uploadId", uploadID, "error", saveErr)
			}
		}
		return
	}

	failedJobs, err := app.FindRecordsByFilter(
		collections.ProcessingJobs,
		"upload = {:uploadId} && (status = 'failed' || status = 'deadletter' || status = 'cancelled')",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil {
		app.Logger().Warn("[processing] unable to query terminal failed jobs for upload", "uploadId", uploadID, "error", err)
		return
	}

	desiredStatus := vars.UploadStatusSuccess
	if len(failedJobs) > 0 {
		desiredStatus = vars.UploadStatusFailed
	}

	if strings.EqualFold(upload.GetString("status"), desiredStatus) {
		return
	}

	upload.Set("status", desiredStatus)
	if err := app.Save(upload); err != nil {
		app.Logger().Warn("[processing] failed to reconcile upload status", "uploadId", uploadID, "status", desiredStatus, "error", err)
	}
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
