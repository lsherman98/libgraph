package processing

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
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
	queuePollInterval = 2 * time.Second
	queueLeaseWindow  = 2 * time.Minute
	workerID          = "pb-main-worker"
)

type workerSpec struct {
	name     string
	jobTypes []string
	limit    int
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

func RegisterHandler(jobType string, handler JobHandler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	handlers[jobType] = handler
}

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		workers := []workerSpec{
			{name: "upload-parse", jobTypes: []string{JobTypeUploadParseOrTranscribe}, limit: 2},
			{name: "chunk-generate", jobTypes: []string{JobTypeChunkGenerate}, limit: 4},
			{name: "page-summarize", jobTypes: []string{JobTypePageSummarize}, limit: 4},
			{name: "embed-submit", jobTypes: []string{JobTypeChunkEmbedSubmit}, limit: 3},
			{name: "embed-poll", jobTypes: []string{JobTypeChunkEmbedPoll}, limit: 8},
		}

		for _, spec := range workers {
			spec := spec
			routine.FireAndForget(func() {
				ticker := time.NewTicker(queuePollInterval)
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
		existingProxy, wrapErr := pbgen.WrapRecord[pbgen.ProcessingJobs](existing)
		if wrapErr != nil {
			return wrapErr
		}

		switch existingProxy.Status() {
		case pbgen.Queued, pbgen.Running, pbgen.Succeeded:
			return nil
		case pbgen.Failed, pbgen.Deadletter, pbgen.Cancelled:
			existingProxy.SetStatus(pbgen.Queued)
			existingProxy.SetAttempts(0)
			existingProxy.Set("scheduled_at", scheduledAt)
			existingProxy.Set("lease_until", nil)
			existingProxy.Set("started_at", nil)
			existingProxy.Set("finished_at", nil)
			existingProxy.SetErrorCode("")
			existingProxy.SetErrorMessage("")
			existingProxy.Set("payload_json", req.Payload)
			existingProxy.SetPriority(float64(req.Priority))
			existingProxy.SetMaxAttempts(float64(req.MaxAttempts))
			setOptionalRelations(existingProxy.Record, req)
			return app.Save(existingProxy)
		default:
			return nil
		}
	}

	jobsCollection, colErr := app.FindCollectionByNameOrId(collections.ProcessingJobs)
	if colErr != nil {
		return colErr
	}

	record := core.NewRecord(jobsCollection)
	recordProxy, wrapErr := pbgen.WrapRecord[pbgen.ProcessingJobs](record)
	if wrapErr != nil {
		return wrapErr
	}
	jobType := pbgen.UploadParseOrTranscribe
	switch req.JobType {
	case JobTypeChunkGenerate:
		jobType = pbgen.ChunkGenerate
	case JobTypePageSummarize:
		jobType = pbgen.PageSummarize
	case JobTypeChunkEmbedSubmit:
		jobType = pbgen.ChunkEmbedSubmit
	case JobTypeChunkEmbedPoll:
		jobType = pbgen.ChunkEmbedPoll
	}
	recordProxy.SetJobType(jobType)
	recordProxy.SetStatus(pbgen.Queued)
	recordProxy.SetPriority(float64(req.Priority))
	recordProxy.SetAttempts(0)
	recordProxy.SetMaxAttempts(float64(req.MaxAttempts))
	recordProxy.Set("scheduled_at", scheduledAt)
	recordProxy.SetDedupeKey(req.DedupeKey)
	recordProxy.Set("payload_json", req.Payload)
	setOptionalRelations(recordProxy.Record, req)

	saveErr := app.Save(recordProxy)
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
		jobProxy, wrapErr := pbgen.WrapRecord[pbgen.ProcessingJobs](job)
		if wrapErr != nil {
			app.Logger().Warn("[processing] failed to wrap job proxy", "jobId", job.Id, "error", wrapErr)
			continue
		}

		if err := claimJob(app, jobProxy, worker.name); err != nil {
			app.Logger().Warn("[processing] failed to claim job", "jobId", job.Id, "error", err)
			continue
		}

		execErr := executeJob(app, jobProxy)
		if execErr != nil {
			handleJobFailure(app, jobProxy, execErr)
			continue
		}

		if jobProxy.Status() != pbgen.Running {
			continue
		}

		jobProxy.SetStatus(pbgen.Succeeded)
		jobProxy.Set("finished_at", time.Now().UTC())
		jobProxy.Set("lease_until", nil)
		jobProxy.SetErrorCode("")
		jobProxy.SetErrorMessage("")
		if err := app.Save(jobProxy); err != nil {
			app.Logger().Error("[processing] failed to mark job as succeeded", "jobId", job.Id, "error", err)
			continue
		}

		reconcileUploadStatus(app, strings.TrimSpace(jobProxy.GetString("upload")))
	}
}

func claimJob(app *pocketbase.PocketBase, job *pbgen.ProcessingJobs, workerName string) error {
	now := time.Now().UTC()
	job.SetStatus(pbgen.Running)
	job.Set("lease_until", now.Add(queueLeaseWindow))
	job.Set("started_at", now)
	job.SetWorkerId(fmt.Sprintf("%s:%s", workerID, workerName))
	job.SetErrorCode("")
	job.SetErrorMessage("")
	return app.Save(job)
}

func executeJob(app *pocketbase.PocketBase, job *pbgen.ProcessingJobs) error {
	jobType := job.GetString("job_type")

	handlersMu.RLock()
	handler := handlers[jobType]
	handlersMu.RUnlock()

	if handler == nil {
		return fmt.Errorf("no handler registered for job_type=%s", jobType)
	}

	return handler(app, job.Record)
}

func handleJobFailure(app *pocketbase.PocketBase, job *pbgen.ProcessingJobs, execErr error) {
	now := time.Now().UTC()
	attempts := int(job.Attempts()) + 1
	maxAttempts := int(job.MaxAttempts())
	if maxAttempts <= 0 {
		maxAttempts = 5
	}

	job.SetAttempts(float64(attempts))
	job.SetErrorMessage(execErr.Error())
	job.Set("lease_until", nil)

	if attempts >= maxAttempts {
		job.SetStatus(pbgen.Deadletter)
		job.Set("finished_at", now)
		if err := app.Save(job); err != nil {
			app.Logger().Error("[processing] failed to deadletter job", "jobId", job.Id, "error", err)
			return
		}

		reconcileUploadStatus(app, strings.TrimSpace(job.GetString("upload")))
		return
	}

	backoff := time.Duration(1<<maxInt(0, attempts-1)) * 15 * time.Second
	job.SetStatus(pbgen.Queued)
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

	uploadProxy, wrapErr := pbgen.WrapRecord[pbgen.Uploads](upload)
	if wrapErr != nil {
		app.Logger().Warn("[processing] unable to wrap upload proxy", "uploadId", uploadID, "error", wrapErr)
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
		if uploadProxy.Status() != pbgen.PROCESSING {
			uploadProxy.SetStatus(pbgen.PROCESSING)
			if saveErr := app.Save(uploadProxy); saveErr != nil {
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

	desiredStatus := "SUCCESS"
	if len(failedJobs) > 0 {
		desiredStatus = "FAILED"
	}

	if strings.EqualFold(uploadProxy.GetString("status"), desiredStatus) {
		return
	}

	uploadProxy.Set("status", desiredStatus)
	if err := app.Save(uploadProxy); err != nil {
		app.Logger().Warn("[processing] failed to reconcile upload status", "uploadId", uploadID, "status", desiredStatus, "error", err)
	}
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
