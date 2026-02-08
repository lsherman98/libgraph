package uploads

import (
	"fmt"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		title := upload.GetString("title")

		llamaClient, err := llama.New(app)
		if err != nil {
			return err
		}

		res, err := llamaClient.Parse(upload)
		if err != nil {
			e.App.Logger().Error("Failed to start parse job:", "error", err)
			upload.Set("status", "FAILED")
			if err := app.Save(upload); err != nil {
				e.App.Logger().Error("Failed to update upload status to FAILED:", "error", err)
			}
			return err
		}

		upload.Set("status", "PROCESSING")
		if err := app.Save(upload); err != nil {
			e.App.Logger().Error("Failed to update upload status:", "error", err)
		}

		jobId := res.ID

		routine.FireAndForget(func() {
			jobRes, err := llamaClient.GetParseJob(jobId)
			if err != nil {
				e.App.Logger().Error("Failed to get parse job status:", "error", err)
			}

			status := jobRes.Job.Status
			for status == "RUNNING" || status == "PENDING" {
				time.Sleep(5 * time.Second)
				jobRes, err = llamaClient.GetParseJob(jobId)
				if err != nil {
					e.App.Logger().Error("Failed to get parse job status:", "error", err)
				}
				status = jobRes.Job.Status
			}

			if status != "SUCCESS" && status != "COMPLETED" { // LlamaIndex returns "SUCCESS" in v2 parse sometimes, but enum says COMPLETED. Checking both or just reliance on enum.
				e.App.Logger().Error("LlamaIndex Parse failed", "status", status)
				upload.Set("status", "FAILED")
				app.Save(upload)
				return
			}

			pages := jobRes.Markdown.Pages

			pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
			if err != nil {
				e.App.Logger().Error("Failed to find pages collection:", "error", err)
			}

			for _, page := range pages {
				newPage := core.NewRecord(pagesCollection)
				newPage.Set("upload", upload.Id)
				newPage.Set("page", page.PageNumber)

				f, err := filesystem.NewFileFromBytes([]byte(page.Markdown), fmt.Sprintf("%s_page_%d.md", title, page.PageNumber))
				if err != nil {
					e.App.Logger().Error("Failed to create file from markdown bytes:", "error", err)
				}
				newPage.Set("markdown", f)

				if err = app.Save(newPage); err != nil {
					e.App.Logger().Error("Failed to save new page record:", "error", err)
				}
			}

			upload.Set("status", "SUCCESS")
			upload.Set("num_pages", len(pages))
			if err := app.Save(upload); err != nil {
				e.App.Logger().Error("Failed to update upload status to SUCCESS:", "error", err)
			}

			// LlamaIndex Pipeline Integration
			uploadRes, err := llamaClient.UploadFileFromURL(upload)
			if err != nil {
				e.App.Logger().Error("Failed to upload file to Llama Cloud:", "error", err)
				return
			}

			metadata := map[string]interface{}{
				"upload_id":      upload.Id,
				"title":          title,
				"user_id":        upload.GetString("user"),
				"topic_id":       upload.GetString("topic"),
				"type":           upload.GetString("type"),
				"publication_id": upload.GetString("publication"),
			}

			_, err = llamaClient.AddFilesToPipeline(uploadRes.ID, metadata)
			if err != nil {
				e.App.Logger().Error("Failed to add file to pipeline:", "error", err)
				return
			}
		})

		return e.Next()
	})

	return nil
}
