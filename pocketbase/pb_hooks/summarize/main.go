package summarize

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/utils"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

func Init(app *pocketbase.PocketBase) error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY environment variable is required")
	}

	client, err := genai.NewClient(context.Background(), option.WithAPIKey(apiKey))
	if err != nil {
		return err
	}
	geminiClient = client

	registerQueueHandlers()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/pages/{pageId}/summarize", func(e *core.RequestEvent) error {
			pageID := strings.TrimSpace(e.Request.PathValue("pageId"))
			if pageID == "" {
				app.Logger().Error("single page summarize failed: missing page id", "route", "/api/pages/{pageId}/summarize")
				return e.BadRequestError("page id is required", nil)
			}

			userID := e.Auth.Id

			pageRecord, err := app.FindRecordById("pages", pageID)
			if err != nil {
				app.Logger().Error("single page summarize failed: page lookup failed", "route", "/api/pages/{pageId}/summarize", "user_id", userID, "page_id", pageID, "error", err)
				return e.NotFoundError("page not found", err)
			}

			pageUserID := pageRecord.GetString("user")
			if pageUserID != userID {
				app.Logger().Error("single page summarize failed: page ownership mismatch", "route", "/api/pages/{pageId}/summarize", "user_id", userID, "page_id", pageID, "page_user_id", pageUserID)
				return e.NotFoundError("page not found", nil)
			}
			pageUploadID := pageRecord.GetString("upload")

			uploadRecord, err := app.FindRecordById(collections.Uploads, pageUploadID)
			if err != nil {
				app.Logger().Error("single page summarize failed: upload lookup failed", "route", "/api/pages/{pageId}/summarize", "user_id", userID, "page_id", pageID, "upload_id", pageUploadID, "error", err)
				return e.NotFoundError("upload not found", err)
			}
			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadType == "summary" {
				app.Logger().Error("single page summarize failed: summary uploads cannot be summarized", "route", "/api/pages/{pageId}/summarize", "user_id", userID, "page_id", pageID, "upload_id", pageUploadID)
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}

			fullDocument := uploadType != "book"
			dedupeKey := fmt.Sprintf("page.summarize:%s:%s", userID, pageID)
			if fullDocument {
				dedupeKey = fmt.Sprintf("upload.summarize.full:%s:%s", userID, pageUploadID)
			}

			if err := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypePageSummarize,
				DedupeKey: dedupeKey,
				Payload: map[string]any{
					"page_id":       pageID,
					"user_id":       userID,
					"upload_id":     pageUploadID,
					"full_document": fullDocument,
				},
				UserID:                userID,
				UploadID:              pageUploadID,
				PageID:                pageID,
				AllowRequeueOnSuccess: true,
			}); err != nil {
				app.Logger().Error("single page summarize failed: enqueue failed", "route", "/api/pages/{pageId}/summarize", "user_id", userID, "page_id", pageID, "upload_id", pageUploadID, "dedupe_key", dedupeKey, "full_document", fullDocument, "error", err)
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, PageSummaryQueuedResponse{
				Status:    "queued",
				PageID:    pageID,
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		se.Router.POST("/api/uploads/{uploadId}/summarize", func(e *core.RequestEvent) error {
			uploadID := strings.TrimSpace(e.Request.PathValue("uploadId"))
			if uploadID == "" {
				app.Logger().Error("upload summarize failed: missing upload id", "route", "/api/uploads/{uploadId}/summarize")
				return e.BadRequestError("upload id is required", nil)
			}

			userID := e.Auth.Id

			uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				app.Logger().Error("upload summarize failed: upload lookup failed", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID, "error", err)
				return e.NotFoundError("upload not found", err)
			}

			uploadUserID := uploadRecord.GetString("user")
			if uploadUserID != userID {
				app.Logger().Error("upload summarize failed: upload ownership mismatch", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID, "upload_user_id", uploadUserID)
				return e.NotFoundError("upload not found", nil)
			}

			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadType == "summary" {
				app.Logger().Error("upload summarize failed: summary uploads cannot be summarized", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID)
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}
			if uploadType == "book" {
				app.Logger().Error("upload summarize failed: book uploads must use page summarize endpoints", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID)
				return e.BadRequestError("book uploads must be summarized by page selection", nil)
			}

			pages, err := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId} && user = {:userId}",
				"+page",
				1,
				0,
				dbx.Params{"uploadId": uploadID, "userId": userID},
			)
			if err != nil {
				app.Logger().Error("upload summarize failed: first page lookup failed", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID, "error", err)
				return e.InternalServerError("failed to load upload pages", err)
			}
			if len(pages) == 0 {
				app.Logger().Error("upload summarize failed: no pages found for upload", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID)
				return e.BadRequestError("upload has no pages to summarize", nil)
			}

			anchorPageID := pages[0].Id
			dedupeKey := fmt.Sprintf("upload.summarize.full:%s:%s", userID, uploadID)

			if err := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypePageSummarize,
				DedupeKey: dedupeKey,
				Payload: map[string]any{
					"page_id":       anchorPageID,
					"user_id":       userID,
					"upload_id":     uploadID,
					"full_document": true,
				},
				UserID:                userID,
				UploadID:              uploadID,
				PageID:                anchorPageID,
				AllowRequeueOnSuccess: true,
			}); err != nil {
				app.Logger().Error("upload summarize failed: enqueue failed", "route", "/api/uploads/{uploadId}/summarize", "user_id", userID, "upload_id", uploadID, "page_id", anchorPageID, "dedupe_key", dedupeKey, "error", err)
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, PageSummaryQueuedResponse{
				Status:    "queued",
				PageID:    anchorPageID,
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		se.Router.POST("/api/pages/summarize", func(e *core.RequestEvent) error {
			body := PageSummaryBatchRequest{}
			if err := e.BindBody(&body); err != nil {
				app.Logger().Error("batch summarize failed: invalid request body", "route", "/api/pages/summarize", "error", err)
				return e.BadRequestError("invalid request body", err)
			}

			if len(body.PageIDs) == 0 {
				app.Logger().Error("batch summarize failed: missing page_ids", "route", "/api/pages/summarize", "user_id", e.Auth.Id)
				return e.BadRequestError("page_ids is required", nil)
			}

			userID := e.Auth.Id
			requestedIDs := make([]string, 0, len(body.PageIDs))
			seenIDs := map[string]struct{}{}
			for _, rawID := range body.PageIDs {
				pageID := strings.TrimSpace(rawID)
				if pageID == "" {
					continue
				}
				if _, exists := seenIDs[pageID]; exists {
					continue
				}
				seenIDs[pageID] = struct{}{}
				requestedIDs = append(requestedIDs, pageID)
			}

			if len(requestedIDs) == 0 {
				app.Logger().Error("batch summarize failed: no valid page ids after normalization", "route", "/api/pages/summarize", "user_id", userID)
				return e.BadRequestError("at least one valid page id is required", nil)
			}

			pages := make([]*core.Record, 0, len(requestedIDs))
			uploadID := ""
			for _, pageID := range requestedIDs {
				pageRecord, err := app.FindRecordById(collections.Pages, pageID)
				if err != nil {
					app.Logger().Error("batch summarize failed: page lookup failed", "route", "/api/pages/summarize", "user_id", userID, "page_id", pageID, "error", err)
					return e.NotFoundError("page not found", err)
				}

				if pageRecord.GetString("user") != userID {
					app.Logger().Error("batch summarize failed: page ownership mismatch", "route", "/api/pages/summarize", "user_id", userID, "page_id", pageID, "page_user_id", pageRecord.GetString("user"))
					return e.NotFoundError("page not found", nil)
				}

				pageUploadID := strings.TrimSpace(pageRecord.GetString("upload"))
				if pageUploadID == "" {
					app.Logger().Error("batch summarize failed: page missing upload relation", "route", "/api/pages/summarize", "user_id", userID, "page_id", pageID)
					return e.BadRequestError("page upload is required", nil)
				}

				if uploadID == "" {
					uploadID = pageUploadID
				} else if uploadID != pageUploadID {
					app.Logger().Error("batch summarize failed: pages from mixed uploads", "route", "/api/pages/summarize", "user_id", userID, "first_upload_id", uploadID, "page_id", pageID, "page_upload_id", pageUploadID)
					return e.BadRequestError("all selected pages must belong to the same upload", nil)
				}

				pages = append(pages, pageRecord)
			}

			uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				app.Logger().Error("batch summarize failed: upload lookup failed", "route", "/api/pages/summarize", "user_id", userID, "upload_id", uploadID, "error", err)
				return e.NotFoundError("upload not found", err)
			}
			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadType == "summary" {
				app.Logger().Error("batch summarize failed: summary uploads cannot be summarized", "route", "/api/pages/summarize", "user_id", userID, "upload_id", uploadID)
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}
			if uploadType != "book" && len(pages) > 1 {
				app.Logger().Error("batch summarize failed: multi-page summaries require book uploads", "route", "/api/pages/summarize", "user_id", userID, "upload_id", uploadID, "upload_type", uploadType, "page_count", len(pages))
				return e.BadRequestError("multiple page summary is only supported for books", nil)
			}

			sort.Slice(pages, func(i, j int) bool {
				return pages[i].GetInt("page") < pages[j].GetInt("page")
			})

			sortedIDs := make([]string, 0, len(pages))
			for _, pageRecord := range pages {
				sortedIDs = append(sortedIDs, pageRecord.Id)
			}

			firstPage := pages[0].GetInt("page")
			lastPage := pages[len(pages)-1].GetInt("page")
			dedupeKey := fmt.Sprintf("page.summarize.range:%s:%s:%d-%d", userID, uploadID, firstPage, lastPage)

			if err := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypePageSummarize,
				DedupeKey: dedupeKey,
				Payload: map[string]any{
					"page_ids":  sortedIDs,
					"user_id":   userID,
					"upload_id": uploadID,
				},
				UserID:                userID,
				UploadID:              uploadID,
				PageID:                sortedIDs[0],
				AllowRequeueOnSuccess: true,
			}); err != nil {
				app.Logger().Error("batch summarize failed: enqueue failed", "route", "/api/pages/summarize", "user_id", userID, "upload_id", uploadID, "page_ids", sortedIDs, "dedupe_key", dedupeKey, "error", err)
				return e.InternalServerError("failed to enqueue summary", err)
			}
			app.Logger().Info("batch summarize enqueued", "route", "/api/pages/summarize", "user_id", userID, "upload_id", uploadID, "page_ids", sortedIDs, "dedupe_key", dedupeKey)

			return e.JSON(http.StatusAccepted, PageSummaryBatchQueuedResponse{
				Status:    "queued",
				PageIDs:   sortedIDs,
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	return nil
}

func registerQueueHandlers() {
	processing.RegisterHandler(processing.JobTypePageSummarize, handlePageSummarizeJob)
}

func handlePageSummarizeJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := pageSummarizePayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		app.Logger().Error("page summarize job failed: payload unmarshal failed", "job_id", job.Id, "job_type", job.GetString("job_type"), "error", err)
		return err
	}

	if payload.UserID == "" {
		err := fmt.Errorf("payload user_id is required")
		app.Logger().Error("page summarize job failed: missing user_id", "job_id", job.Id, "job_type", job.GetString("job_type"), "payload", payload, "error", err)
		return err
	}

	if len(payload.PageIDs) > 0 {
		return handlePageRangeSummarizeJob(app, payload)
	}

	if payload.PageID == "" {
		err := fmt.Errorf("payload page_id is required")
		app.Logger().Error("page summarize job failed: missing page_id", "job_id", job.Id, "job_type", job.GetString("job_type"), "payload", payload, "error", err)
		return err
	}

	pageRecord, err := app.FindRecordById(collections.Pages, payload.PageID)
	if err != nil {
		app.Logger().Error("page summarize job failed: page lookup failed", "job_id", job.Id, "page_id", payload.PageID, "user_id", payload.UserID, "error", err)
		return err
	}
	uploadID := pageRecord.GetString("upload")
	if uploadID == "" {
		return fmt.Errorf("page %s missing upload relation", payload.PageID)
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		app.Logger().Error("page summarize job failed: upload lookup failed", "job_id", job.Id, "page_id", payload.PageID, "upload_id", uploadID, "user_id", payload.UserID, "error", err)
		return err
	}
	uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
	if uploadType == "summary" {
		return fmt.Errorf("cannot summarize summary upload %s", uploadID)
	}
	if uploadType != "book" {
		payload.FullDocument = true
		if payload.UploadID == "" {
			payload.UploadID = uploadID
		}
	}

	pageUserID := pageRecord.GetString("user")
	if pageUserID != payload.UserID {
		return fmt.Errorf("page %s does not belong to user %s", payload.PageID, payload.UserID)
	}

	markdown, err := utils.ReadPageMarkdown(app, pageRecord)
	if err != nil {
		app.Logger().Error("page summarize job failed: page markdown read failed", "job_id", job.Id, "page_id", payload.PageID, "upload_id", uploadID, "user_id", payload.UserID, "error", err)
		return err
	}

	summary := ""
	if payload.FullDocument {
		uploadID := payload.UploadID
		if uploadID == "" {
			uploadID = pageRecord.GetString("upload")
		}
		if uploadID == "" {
			return fmt.Errorf("upload_id is required for full document summary")
		}

		pages, err := app.FindRecordsByFilter(
			collections.Pages,
			"upload = {:uploadId}",
			"+page",
			0,
			0,
			dbx.Params{"uploadId": uploadID},
		)
		if err != nil {
			app.Logger().Error("page summarize job failed: full-document page list query failed", "job_id", job.Id, "upload_id", uploadID, "user_id", payload.UserID, "error", err)
			return err
		}
		if len(pages) == 0 {
			return fmt.Errorf("no pages found for upload %s", uploadID)
		}

		allMarkdown := strings.Builder{}
		for _, p := range pages {
			pageMarkdown, readErr := utils.ReadPageMarkdown(app, p)
			if readErr != nil {
				app.Logger().Error("page summarize job failed: full-document page markdown read failed", "job_id", job.Id, "upload_id", uploadID, "source_page_id", p.Id, "source_page_number", p.GetInt("page"), "user_id", payload.UserID, "error", readErr)
				return readErr
			}
			pageMarkdown = strings.TrimSpace(pageMarkdown)
			if pageMarkdown == "" {
				continue
			}
			if allMarkdown.Len() > 0 {
				allMarkdown.WriteString("\n\n")
			}
			allMarkdown.WriteString(pageMarkdown)
		}

		summary, err = GenerateDocumentSummary(allMarkdown.String())
		if err != nil {
			app.Logger().Error("page summarize job failed: document summary generation failed", "job_id", job.Id, "upload_id", uploadID, "user_id", payload.UserID, "error", err)
			return err
		}
	} else {
		summary, err = GeneratePageSummary(markdown)
		if err != nil {
			app.Logger().Error("page summarize job failed: page summary generation failed", "job_id", job.Id, "page_id", payload.PageID, "upload_id", uploadID, "user_id", payload.UserID, "error", err)
			return err
		}
	}

	_, _, _, err = UpsertPageSummaryArtifact(app, pageRecord, payload.UserID, summary, payload.FullDocument)
	if err != nil {
		app.Logger().Error("page summarize job failed: summary artifact upsert failed", "job_id", job.Id, "page_id", payload.PageID, "upload_id", uploadID, "user_id", payload.UserID, "full_document", payload.FullDocument, "error", err)
	}
	return err
}

func handlePageRangeSummarizeJob(app *pocketbase.PocketBase, payload pageSummarizePayload) error {
	cleanIDs := make([]string, 0, len(payload.PageIDs))
	seenIDs := map[string]struct{}{}
	for _, rawID := range payload.PageIDs {
		pageID := strings.TrimSpace(rawID)
		if pageID == "" {
			continue
		}
		if _, exists := seenIDs[pageID]; exists {
			continue
		}
		seenIDs[pageID] = struct{}{}
		cleanIDs = append(cleanIDs, pageID)
	}

	if len(cleanIDs) == 0 {
		return fmt.Errorf("payload page_ids is required")
	}

	pages := make([]*core.Record, 0, len(cleanIDs))
	uploadID := strings.TrimSpace(payload.UploadID)
	for _, pageID := range cleanIDs {
		pageRecord, err := app.FindRecordById(collections.Pages, pageID)
		if err != nil {
			return err
		}
		if pageRecord.GetString("user") != payload.UserID {
			return fmt.Errorf("page %s does not belong to user %s", pageID, payload.UserID)
		}

		pageUploadID := strings.TrimSpace(pageRecord.GetString("upload"))
		if pageUploadID == "" {
			return fmt.Errorf("page %s missing upload relation", pageID)
		}

		if uploadID == "" {
			uploadID = pageUploadID
		} else if uploadID != pageUploadID {
			return fmt.Errorf("all pages in page_ids must belong to the same upload")
		}

		pages = append(pages, pageRecord)
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}
	uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
	if uploadType == "summary" {
		return fmt.Errorf("cannot summarize summary upload %s", uploadID)
	}
	if uploadType != "book" && len(pages) > 1 {
		return fmt.Errorf("multiple page summary is only supported for books")
	}

	sort.Slice(pages, func(i, j int) bool {
		return pages[i].GetInt("page") < pages[j].GetInt("page")
	})

	if len(pages) == 1 {
		pageMarkdown, readErr := utils.ReadPageMarkdown(app, pages[0])
		if readErr != nil {
			return readErr
		}

		summary, summarizeErr := GeneratePageSummary(pageMarkdown)
		if summarizeErr != nil {
			return summarizeErr
		}

		_, _, _, upsertErr := UpsertPageSummaryArtifact(app, pages[0], payload.UserID, summary, false)
		return upsertErr
	}

	allMarkdown := strings.Builder{}
	for _, pageRecord := range pages {
		pageMarkdown, readErr := utils.ReadPageMarkdown(app, pageRecord)
		if readErr != nil {
			return readErr
		}
		trimmed := strings.TrimSpace(pageMarkdown)
		if trimmed == "" {
			continue
		}
		if allMarkdown.Len() > 0 {
			allMarkdown.WriteString("\n\n")
		}
		allMarkdown.WriteString(fmt.Sprintf("## Page %d\n\n%s", pageRecord.GetInt("page"), trimmed))
	}

	summary, err := GenerateDocumentSummary(allMarkdown.String())
	if err != nil {
		return err
	}

	primaryPage := pages[0]
	primarySummaryRecord, summaryUploadRecord, _, err := UpsertPageSummaryArtifact(app, primaryPage, payload.UserID, summary, true)
	if err != nil {
		return err
	}

	minPage := pages[0].GetInt("page")
	maxPage := pages[len(pages)-1].GetInt("page")
	baseTitle := strings.TrimSpace(uploadRecord.GetString("title"))
	if baseTitle == "" {
		baseTitle = "Untitled"
	}

	if minPage == maxPage {
		summaryUploadRecord.Set("title", fmt.Sprintf("%s — Summary (Page %d)", baseTitle, minPage))
	} else {
		summaryUploadRecord.Set("title", fmt.Sprintf("%s — Summary (Pages %d–%d)", baseTitle, minPage, maxPage))
	}
	if saveErr := app.Save(summaryUploadRecord); saveErr != nil {
		return saveErr
	}

	for _, sourcePageRecord := range pages {
		if err := linkPageToSummaryRecord(app, sourcePageRecord, primarySummaryRecord.Id); err != nil {
			return err
		}
	}

	return nil
}

func linkPageToSummaryRecord(app *pocketbase.PocketBase, sourcePageRecord *core.Record, summaryRecordID string) error {
	if strings.TrimSpace(summaryRecordID) == "" {
		return fmt.Errorf("summary record id is required")
	}

	sourcePageRecord.Set("summary", summaryRecordID)
	return app.Save(sourcePageRecord)
}

func GeneratePageSummary(markdown string) (string, error) {
	trimmed := strings.TrimSpace(markdown)
	if trimmed == "" {
		return "", fmt.Errorf("page content is empty")
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}

	model := geminiClient.GenerativeModel(modelName)
	model.Temperature = utils.FloatPtr(0.2)
	model.SystemInstruction = genai.NewUserContent(genai.Text("You summarize a single page from a user's document. Return concise markdown with 4-7 bullet points and a short 1-sentence takeaway at the end. Do not include citations, JSON, or extra preamble."))

	prompt := fmt.Sprintf("Summarize this page content:\n\n%s", trimmed)
	resp, err := model.GenerateContent(context.Background(), genai.Text(prompt))
	if err != nil {
		return "", err
	}

	summary := strings.TrimSpace(utils.ExtractResponseText(resp))
	if summary == "" {
		return "", fmt.Errorf("empty summary response")
	}
	if isLikelyMissingContentSummary(summary) {
		return "", fmt.Errorf("invalid summary response: model reported missing content")
	}

	return summary, nil
}

func GenerateDocumentSummary(allMarkdown string) (string, error) {
	trimmed := strings.TrimSpace(allMarkdown)
	if trimmed == "" {
		return "", fmt.Errorf("document content is empty")
	}

	const maxChars = 100_000
	if len(trimmed) > maxChars {
		trimmed = trimmed[:maxChars]
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-3.1-flash-lite-preview"
	}

	model := geminiClient.GenerativeModel(modelName)
	model.Temperature = utils.FloatPtr(0.2)
	model.SystemInstruction = genai.NewUserContent(genai.Text(
		"You summarize an entire document uploaded by a user. " +
			"Return concise markdown with a 2-3 sentence overview followed by 5-10 bullet points covering the key ideas. " +
			"End with a one-sentence takeaway. Do not include citations, JSON, or extra preamble.",
	))

	prompt := fmt.Sprintf("Summarize this document:\n\n%s", trimmed)
	resp, err := model.GenerateContent(context.Background(), genai.Text(prompt))
	if err != nil {
		return "", err
	}

	summary := strings.TrimSpace(utils.ExtractResponseText(resp))
	if summary == "" {
		return "", fmt.Errorf("empty summary response")
	}
	if isLikelyMissingContentSummary(summary) {
		return "", fmt.Errorf("invalid summary response: model reported missing content")
	}

	return summary, nil
}

func UpsertPageSummaryArtifact(app *pocketbase.PocketBase, sourcePageRecord *core.Record, userID, summaryMarkdown string, fullDocument bool) (*core.Record, *core.Record, *core.Record, error) {
	sourceUploadID := sourcePageRecord.GetString("upload")
	if strings.TrimSpace(sourceUploadID) == "" {
		return nil, nil, nil, fmt.Errorf("source page missing upload relation")
	}

	sourceUploadRecord, err := app.FindRecordById(collections.Uploads, sourceUploadID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to load source upload: %w", err)
	}
	
	uploadsCollection, _ := app.FindCollectionByNameOrId(collections.Uploads)
	pagesCollection, _ := app.FindCollectionByNameOrId(collections.Pages)
	summariesCollection, _ := app.FindCollectionByNameOrId(collections.Summaries)

	baseTitle := strings.TrimSpace(sourceUploadRecord.GetString("title"))
	if baseTitle == "" {
		baseTitle = "Untitled"
	}
	pageNumber := sourcePageRecord.GetInt("page")
	summaryTitle := fmt.Sprintf("%s — Summary (Page %d)", baseTitle, pageNumber)
	summaryFilename := fmt.Sprintf("summary_page_%d.md", pageNumber)
	if fullDocument {
		summaryTitle = fmt.Sprintf("%s — Summary", baseTitle)
		summaryFilename = "summary.md"
	}

	existingSummaryID := strings.TrimSpace(sourcePageRecord.GetString("summary"))
	if existingSummaryID != "" {
		summaryRecord, findErr := app.FindRecordById(collections.Summaries, existingSummaryID)
		if findErr != nil {
			return nil, nil, nil, findErr
		}

		summaryUploadID := summaryRecord.GetString("summary_upload")
		summaryPageID := summaryRecord.GetString("summary_page")

		summaryUploadRecord, uploadErr := app.FindRecordById(collections.Uploads, summaryUploadID)
		if uploadErr != nil {
			return nil, nil, nil, uploadErr
		}
		summaryPageRecord, pageErr := app.FindRecordById(collections.Pages, summaryPageID)
		if pageErr != nil {
			return nil, nil, nil, pageErr
		}

		summaryUploadFile, fileErr := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
		if fileErr != nil {
			return nil, nil, nil, fileErr
		}

		summaryUploadRecord.Set("title", summaryTitle)
		summaryUploadRecord.Set("file", summaryUploadFile)
		summaryUploadRecord.Set("status", vars.UploadStatusSuccess)
		summaryUploadRecord.Set("num_pages", 1)
		summaryUploadRecord.Set("type", "summary")
		if saveErr := app.Save(summaryUploadRecord); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		summaryPageFile, fileErr := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
		if fileErr != nil {
			return nil, nil, nil, fileErr
		}

		summaryPageRecord.Set("markdown", summaryPageFile)
		if saveErr := app.Save(summaryPageRecord); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		summaryRecord.Set("status", vars.SummaryStatusSuccess)
		summaryRecord.Set("source_upload", sourceUploadID)
		summaryRecord.Set("scope", "page")
		if saveErr := app.Save(summaryRecord); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		if saveErr := linkPageToSummaryRecord(app, sourcePageRecord, summaryRecord.Id); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		return summaryRecord, summaryUploadRecord, summaryPageRecord, nil
	}

	summaryUploadFile, err := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
	if err != nil {
		return nil, nil, nil, err
	}

	summaryUploadRecord := core.NewRecord(uploadsCollection)
	summaryUploadRecord.Set("title", summaryTitle)
	summaryUploadRecord.Set("file", summaryUploadFile)
	summaryUploadRecord.Set("type", "summary")
	summaryUploadRecord.Set("status", vars.UploadStatusSuccess)
	summaryUploadRecord.Set("num_pages", 1)
	summaryUploadRecord.Set("user", userID)
	if saveErr := app.Save(summaryUploadRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	summaryPageFile, err := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
	if err != nil {
		return nil, nil, nil, err
	}

	summaryPageRecord := core.NewRecord(pagesCollection)
	summaryPageRecord.Set("upload", summaryUploadRecord.Id)
	summaryPageRecord.Set("page", 1)
	summaryPageRecord.Set("user", userID)
	summaryPageRecord.Set("markdown", summaryPageFile)
	if saveErr := app.Save(summaryPageRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	newSummaryRecord := core.NewRecord(summariesCollection)
	newSummaryRecord.Set("user", userID)
	newSummaryRecord.Set("source_upload", sourceUploadID)
	newSummaryRecord.Set("summary_upload", summaryUploadRecord.Id)
	newSummaryRecord.Set("summary_page", summaryPageRecord.Id)
	newSummaryRecord.Set("scope", "page")
	newSummaryRecord.Set("status", vars.SummaryStatusSuccess)
	if saveErr := app.Save(newSummaryRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	if saveErr := linkPageToSummaryRecord(app, sourcePageRecord, newSummaryRecord.Id); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	return newSummaryRecord, summaryUploadRecord, summaryPageRecord, nil
}

func isLikelyMissingContentSummary(summary string) bool {
	normalized := strings.ToLower(strings.TrimSpace(summary))
	if normalized == "" {
		return false
	}

	missingContentSignals := []string{
		"you haven't provided",
		"you have not provided",
		"please paste the text",
		"please provide the text",
		"upload the file you would like me to summarize",
		"haven't provided the full text",
	}

	for _, signal := range missingContentSignals {
		if strings.Contains(normalized, signal) {
			return true
		}
	}

	return false
}
