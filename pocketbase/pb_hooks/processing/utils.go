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

func getWorkerCount(name string) int {
	count, _ := strconv.Atoi(os.Getenv(name))
	return count
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

func handleJobFailure(app core.App, job *core.Record, err error) {
	now := time.Now().UTC()
	job.Set("status", vars.QueueStatusFailed)
	job.Set("finished_at", now)
	job.Set("error_message", err.Error())
	if err := app.Save(job); err != nil {
		return
	}
}

func reconcileUploadStatus(app core.App, upload *core.Record) error {
	uploadType := upload.GetString("type")
	if uploadType == vars.UploadTypeSummary {
		return nil
	}

	status := upload.GetString("status")
	if status == vars.UploadStatusSuccess || status == vars.UploadStatusFailed {
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
	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	if err := reconcileUploadStatus(app, upload); err != nil {
		return err
	}

	return nil
}
