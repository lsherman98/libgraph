package uploads

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordCreateRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		upload := e.Record

		if err := validateTranscript(upload); err != nil {
			return err
		}

		if err := e.Next(); err != nil {
			return err
		}

		uploadID := upload.Id
		if uploadID == "" {
			return nil
		}

		routine.FireAndForget(func() {
			upload, err := e.App.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return
			}

			optimized, err := optimizeAudioUpload(e.App, upload)
			if err == nil && optimized {
				return
			}

			if err := scheduleUploadProcessing(e.App, upload); err != nil {
				upload.Set("status", vars.UploadStatusFailed)
				if err := e.App.Save(upload); err != nil {
					return
				}
			}
		})

		return nil
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

		return e.Next()
	})

	return nil
}
