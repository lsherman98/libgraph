package summarize

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sort"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"google.golang.org/api/option"
)

var gemini *genai.Client

func Init(app *pocketbase.PocketBase) error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY environment variable is required")
	}

	client, err := genai.NewClient(context.Background(), option.WithAPIKey(apiKey))
	if err != nil {
		return err
	}
	gemini = client

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/uploads/{uploadId}/summarize", func(e *core.RequestEvent) error {
			uploadID := e.Request.PathValue("uploadId")
			if uploadID == "" {
				return e.BadRequestError("upload id is required", nil)
			}

			userID := e.Auth.Id

			upload, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return e.NotFoundError("upload not found", err)
			}

			if upload.GetString("user") != userID {
				return e.NotFoundError("upload not found", nil)
			}

			uploadType := upload.GetString("type")
			if uploadType == vars.UploadTypeSummary {
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}

			if uploadType == vars.UploadTypeBook {
				return e.BadRequestError("book uploads must be summarized by page selection", nil)
			}

			dedupeKey := fmt.Sprintf("upload.summarize.full:%s:%s", userID, uploadID)

			if err := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypePageSummarize,
				DedupeKey: dedupeKey,
				Payload: map[string]any{
					"full_document": true,
				},
				UserID:   userID,
				UploadID: uploadID,
			}); err != nil {
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, SummaryResponse{
				Status:    "queued",
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		se.Router.POST("/api/pages/summarize", func(e *core.RequestEvent) error {
			body := SummaryBatchRequest{}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("invalid request body", err)
			}

			if len(body.PageIDs) == 0 {
				return e.BadRequestError("page_ids is required", nil)
			}

			userID := e.Auth.Id

			pages := make([]*core.Record, 0, len(body.PageIDs))
			for _, pageID := range body.PageIDs {
				page, err := app.FindRecordById(collections.Pages, pageID)
				if err != nil {
					return e.NotFoundError("page not found", err)
				}

				if page.GetString("user") != userID {
					return e.NotFoundError("page not found", nil)
				}

				pages = append(pages, page)
			}

			upload, err := app.FindRecordById(collections.Uploads, pages[0].GetString("upload"))
			if err != nil {
				return e.NotFoundError("upload not found", err)
			}

			if upload.GetString("user") != userID {
				return e.NotFoundError("upload not found", nil)
			}

			uploadType := upload.GetString("type")
			if uploadType == vars.UploadTypeSummary {
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}

			if uploadType != vars.UploadTypeBook  {
				return e.BadRequestError("multiple page summary is only supported for books", nil)
			}

			sort.Slice(pages, func(i, j int) bool {
				return pages[i].GetInt("page") < pages[j].GetInt("page")
			})

			sortedIDs := make([]string, 0, len(pages))
			for _, page := range pages {
				sortedIDs = append(sortedIDs, page.Id)
			}

			firstPage := pages[0].GetInt("page")
			lastPage := pages[len(pages)-1].GetInt("page")
			dedupeKey := fmt.Sprintf("page.summarize.range:%s:%s:%d-%d", userID, upload.Id, firstPage, lastPage)

			if err := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypePageSummarize,
				DedupeKey: dedupeKey,
				Payload: map[string]any{
					"page_ids":  sortedIDs,
				},
				UserID:   userID,
				UploadID: upload.Id,
				PageID:   sortedIDs[0],
			}); err != nil {
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, SummaryBatchResponse{
				Status:    "queued",
				PageIDs:   sortedIDs,
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	return nil
}
