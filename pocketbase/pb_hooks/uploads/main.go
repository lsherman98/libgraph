package uploads

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := registerDownloadRoutes(app, se); err != nil {
			return err
		}

		return se.Next()
	})

	app.OnRecordCreateRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		transcriptFile, err := findCustomTranscriptFile(e)
		if err != nil {
			return e.BadRequestError("invalid transcript_file upload", err)
		}

		if transcriptFile != nil {
			if err := attachCustomTranscriptFile(e.App, e.Record, transcriptFile); err != nil {
				return e.BadRequestError("invalid transcript_file", err)
			}
		}

		if err := validateDuplicateUpload(e.App, e.Record); err != nil {
			return err
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record

		if err := scheduleUploadProcessing(e.App, upload); err != nil {
			upload.Set("status", vars.UploadStatusFailed)
			if err := e.App.Save(upload); err != nil {
				return err
			}
		}

		return e.Next()
	})

	app.OnRecordDeleteRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		upload := e.Record
		uploadID := upload.Id

		summaries, err := e.App.FindRecordsByFilter(
			collections.Summaries,
			"source_upload = {:uploadId}",
			"",
			0,
			0,
			dbx.Params{"uploadId": uploadID},
		)
		if err != nil {
			return err
		}

		deletedSummaries := map[string]struct{}{}
		for _, summary := range summaries {
			summaryID := summary.GetString("summary_upload")
			if summaryID == "" || summaryID == uploadID {
				continue
			}
			if _, seen := deletedSummaries[summaryID]; seen {
				continue
			}

			summaryUpload, err := e.App.FindRecordById(collections.Uploads, summaryID)
			if err != nil {
				continue
			}

			if err := e.App.Delete(summaryUpload); err != nil {
				return err
			}

			deletedSummaries[summaryID] = struct{}{}
		}

		transcripts, err := findLinkedTranscripts(e.App, upload, 0)
		if err == nil {
			for _, transcript := range transcripts {
				if transcript.Id == uploadID {
					continue
				}
				_ = e.App.Delete(transcript)
			}
		}

		return e.Next()
	})

	return nil
}
