package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

const chatSearchTopK = 6
const searchModeTopK = 10

func deriveChatTitle(message, mode string) string {
	title := strings.TrimSpace(message)
	if len(title) > 80 {
		title = title[:80] + "…"
	}

	if mode == "search" {
		title = "Search: " + title
	}

	return title
}

func shouldAutoRenameChatTitle(title string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(title))
	return trimmed == "" || trimmed == "new chat"
}

type pageSummarizePayload struct {
	PageID       string   `json:"page_id"`
	PageIDs      []string `json:"page_ids,omitempty"`
	UserID       string   `json:"user_id"`
	UploadID     string   `json:"upload_id,omitempty"`
	FullDocument bool     `json:"full_document,omitempty"`
}

func Init(app *pocketbase.PocketBase) error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY environment variable is required")
	}

	var err error
	geminiClient, err = genai.NewClient(context.Background(), option.WithAPIKey(apiKey))
	if err != nil {
		return err
	}

	registerQueueHandlers()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/chat", func(e *core.RequestEvent) error {
			userID := e.Auth.Id

			body := ChatRequest{}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("invalid request body", err)
			}

			if body.Message == "" {
				return e.BadRequestError("message is required", nil)
			}

			var uploadIDs []string
			if body.Filters != nil {
				uploadIDs, err = resolveFilterUploadIDs(app, body.Filters)
				if err != nil {
					return e.InternalServerError("failed to resolve filter upload IDs", err)
				}
			}

			chatID := body.ChatID

			var sidebarContexts []chatPromptContext
			if body.Mode == "reader_sidebar" && chatID != "" {
				sidebarContexts, err = loadSidebarPromptContexts(app, chatID, userID)
				if err != nil {
					return e.InternalServerError("failed to load chat contexts", err)
				}

				if len(sidebarContexts) == 0 {
					return e.BadRequestError("at least one context item is required", nil)
				}
			}

			if chatID == "" {
				title := deriveChatTitle(body.Message, body.Mode)

				chatsCollection, err := app.FindCollectionByNameOrId("chats")
				if err != nil {
					return e.InternalServerError("failed to find chats collection", err)
				}

				chatRecord := core.NewRecord(chatsCollection)
				chatRecord.Set("title", title)
				chatRecord.Set("user", userID)
				chatRecord.Set("type", body.Mode)
				if err := app.Save(chatRecord); err != nil {
					return e.InternalServerError("failed to create chat", err)
				}
				chatID = chatRecord.Id
			} else if body.Mode == "reader_sidebar" {
				chatRecord, err := app.FindRecordById("chats", chatID)
				if err != nil {
					return e.NotFoundError("chat not found", err)
				}

				if chatRecord.GetString("user") != userID {
					return e.NotFoundError("chat not found", nil)
				}

				if shouldAutoRenameChatTitle(chatRecord.GetString("title")) {
					existingMessages, err := app.FindRecordsByFilter(
						"messages",
						"chat = {:chatId}",
						"-created",
						1,
						0,
						dbx.Params{"chatId": chatID},
					)
					if err != nil {
						return e.InternalServerError("failed to check chat messages", err)
					}

					if len(existingMessages) == 0 {
						chatRecord.Set("title", deriveChatTitle(body.Message, body.Mode))
						if err := app.Save(chatRecord); err != nil {
							return e.InternalServerError("failed to update chat title", err)
						}
					}
				}
			}

			userMsgID, err := saveMessage(app, chatID, userID, "user", body.Message, nil, vars.MessageStatusCompleted, "")
			if err != nil {
				return e.InternalServerError("failed to save user message", err)
			}

			payload := chatRespondPayload{
				ChatID:        chatID,
				Mode:          body.Mode,
				Message:       body.Message,
				UploadIDs:     uploadIDs,
				UserID:        userID,
				UserMessageID: userMsgID,
				Filters:       body.Filters,
			}

			go func(p chatRespondPayload) {
				if _, err := processChatResponse(app, p); err != nil {
					app.Logger().Error(
						"chat request failed",
						"chat_id", p.ChatID,
						"user_id", p.UserID,
						"mode", p.Mode,
						"error", err,
					)
				}
			}(payload)

			return e.JSON(http.StatusAccepted, ChatResponse{
				ChatID:             chatID,
				Status:             vars.MessageStatusRunning,
				UserMessageID:      userMsgID,
				AssistantMessageID: "",
			})
		}).Bind(apis.RequireAuth())

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

func processChatResponse(app *pocketbase.PocketBase, payload chatRespondPayload) (string, error) {
	if strings.TrimSpace(payload.ChatID) == "" || strings.TrimSpace(payload.UserID) == "" {
		return "", fmt.Errorf("chat respond payload missing required fields")
	}

	if strings.TrimSpace(payload.AssistantMessageID) != "" {
		if err := updateMessageStatusOnly(app, payload.AssistantMessageID, vars.MessageStatusRunning, ""); err != nil {
			return "", err
		}
	}

	mode := strings.TrimSpace(payload.Mode)
	if mode == "" {
		mode = vars.ChatTypeChat
	}

	if mode == vars.ChatTypeSearch {
		results, err := vector_search.Search(app, payload.Message, payload.UploadIDs, searchModeTopK)
		if err != nil {
			_, persistErr := persistAssistantMessage(app, payload, "Sorry, I couldn't complete that search response.", nil, vars.MessageStatusFailed, "search request failed")
			if persistErr != nil {
				return "", persistErr
			}
			return "", err
		}

		sources := sourcesFromSearchResults(results)
		assistantMessageID, err := persistAssistantMessage(app, payload, "", sources, vars.MessageStatusCompleted, "")
		if err != nil {
			return "", err
		}
		return assistantMessageID, nil
	}

	history, err := loadChatHistory(app, payload.ChatID)
	if err != nil {
		_, persistErr := persistAssistantMessage(app, payload, "Sorry, I couldn't load the chat history for this response.", nil, vars.MessageStatusFailed, "failed to load chat history")
		if persistErr != nil {
			return "", persistErr
		}
		return "", err
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-3.1-flash-lite-preview"
	}

	if mode == "reader_sidebar" {
		sidebarContexts, err := loadSidebarPromptContexts(app, payload.ChatID, payload.UserID)
		if err != nil {
			_, persistErr := persistAssistantMessage(app, payload, "Sorry, I couldn't load the sidebar context for this response.", nil, vars.MessageStatusFailed, "failed to load chat context")
			if persistErr != nil {
				return "", persistErr
			}
			return "", err
		}
		if len(sidebarContexts) == 0 {
			assistantMessageID, persistErr := persistAssistantMessage(app, payload, "Please add at least one context item before sending a sidebar chat message.", nil, vars.MessageStatusFailed, "missing sidebar context")
			return assistantMessageID, persistErr
		}

		systemPrompt := buildPromptWithSidebarContext(sidebarContexts)
		model := geminiClient.GenerativeModel(modelName)
		model.Temperature = floatPtr(0.2)
		model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

		cs := model.StartChat()
		cs.History = buildGeminiHistory(history)

		resp, err := cs.SendMessage(context.Background(), genai.Text(payload.Message))
		if err != nil && isRecitationBlockedError(err) {
			retryPrompt := systemPrompt + "\n\nRECITATION SAFETY:\n- Do not reproduce long verbatim excerpts from the context.\n- Prefer faithful paraphrases.\n- Use short quote snippets only when essential."
			retryModel := geminiClient.GenerativeModel(modelName)
			retryModel.Temperature = floatPtr(0.2)
			retryModel.SystemInstruction = genai.NewUserContent(genai.Text(retryPrompt))

			retryCS := retryModel.StartChat()
			retryCS.History = buildGeminiHistory(history)
			resp, err = retryCS.SendMessage(context.Background(), genai.Text(payload.Message+"\n\nPlease paraphrase instead of quoting verbatim."))
		}
		if err != nil {
			_, persistErr := persistAssistantMessage(app, payload, "Sorry, I couldn't complete that response.", nil, vars.MessageStatusFailed, "chat request failed")
			if persistErr != nil {
				return "", persistErr
			}
			return "", err
		}

		answer := strings.TrimSpace(extractResponseText(resp))
		if answer == "" {
			answer = "I couldn't generate a response from the provided context."
		}

		assistantMessageID, err := persistAssistantMessage(app, payload, answer, nil, vars.MessageStatusCompleted, "")
		if err != nil {
			return "", err
		}
		return assistantMessageID, nil
	}

	searchResults, err := vector_search.Search(app, payload.Message, payload.UploadIDs, chatSearchTopK)
	if err != nil {
		searchResults = nil
	}

	systemPrompt := buildPromptWithContext(searchResults)

	model := geminiClient.GenerativeModel(modelName)
	model.Temperature = floatPtr(0.2)
	model.MaxOutputTokens = int32Ptr(1800)
	model.ResponseMIMEType = "application/json"
	model.ResponseSchema = getResponseSchema()
	model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

	cs := model.StartChat()
	cs.History = buildGeminiHistory(history)

	resp, err := cs.SendMessage(context.Background(), genai.Text(payload.Message))
	if err != nil && isRecitationBlockedError(err) {
		retryPrompt := systemPrompt + "\n\nRECITATION SAFETY:\n- Do not reproduce long verbatim excerpts from the context.\n- Prefer faithful paraphrases.\n- Use short quote snippets only when essential."
		retryModel := geminiClient.GenerativeModel(modelName)
		retryModel.Temperature = floatPtr(0.2)
		retryModel.MaxOutputTokens = int32Ptr(1800)
		retryModel.ResponseMIMEType = "application/json"
		retryModel.ResponseSchema = getResponseSchema()
		retryModel.SystemInstruction = genai.NewUserContent(genai.Text(retryPrompt))

		retryCS := retryModel.StartChat()
		retryCS.History = buildGeminiHistory(history)
		resp, err = retryCS.SendMessage(context.Background(), genai.Text(payload.Message+"\n\nPlease paraphrase instead of quoting verbatim."))
	}
	if err != nil {
		_, persistErr := persistAssistantMessage(app, payload, "Sorry, I couldn't complete that response.", nil, vars.MessageStatusFailed, "chat request failed")
		if persistErr != nil {
			return "", persistErr
		}
		return "", err
	}

	responseText := extractResponseText(resp)
	var structured StructuredChatResponse
	if err := json.Unmarshal([]byte(responseText), &structured); err != nil {
		structured = StructuredChatResponse{Answer: responseText}
	}

	sources := buildSourcesForChatResponse(structured.Citations, searchResults, chatSearchTopK)
	if strings.TrimSpace(structured.Answer) == "" {
		structured.Answer = "I couldn't generate a response from the provided context."
	}

	assistantMessageID, err := persistAssistantMessage(app, payload, structured.Answer, sources, vars.MessageStatusCompleted, "")
	if err != nil {
		return "", err
	}

	return assistantMessageID, nil
}

func persistAssistantMessage(app *pocketbase.PocketBase, payload chatRespondPayload, content string, sources []ChatSource, status string, errorMessage string) (string, error) {
	if strings.TrimSpace(payload.AssistantMessageID) != "" {
		if err := updateMessage(app, payload.AssistantMessageID, content, sources, status, errorMessage); err != nil {
			return "", err
		}
		return payload.AssistantMessageID, nil
	}

	return saveMessage(app, payload.ChatID, payload.UserID, vars.MessageRoleAssistant, content, sources, status, errorMessage)
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

	markdown, err := ReadPageMarkdown(app, pageRecord)
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
			pageMarkdown, readErr := ReadPageMarkdown(app, p)
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
		pageMarkdown, readErr := ReadPageMarkdown(app, pages[0])
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
		pageMarkdown, readErr := ReadPageMarkdown(app, pageRecord)
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

func loadChatHistory(app *pocketbase.PocketBase, chatID string) ([]ChatMessage, error) {
	records, err := app.FindRecordsByFilter(
		"messages",
		"chat = {:chatId}",
		"created",
		0,
		0,
		dbx.Params{"chatId": chatID},
	)
	if err != nil {
		return nil, err
	}

	messages := make([]ChatMessage, 0, len(records))
	for _, r := range records {
		role := r.GetString("role")
		content := r.GetString("content")
		if strings.TrimSpace(content) == "" {
			continue
		}
		messages = append(messages, ChatMessage{
			Role:    role,
			Content: content,
		})
	}
	return messages, nil
}

func saveMessage(app *pocketbase.PocketBase, chatID, userID, role, content string, sources []ChatSource, status string, errorMessage string) (string, error) {
	messagesCollection, err := app.FindCollectionByNameOrId("messages")
	if err != nil {
		return "", err
	}

	record := core.NewRecord(messagesCollection)
	record.Set("chat", chatID)
	record.Set("user", userID)
	record.Set("role", role)
	record.Set("content", content)
	if strings.TrimSpace(status) != "" {
		record.Set("status", status)
	}
	if strings.TrimSpace(errorMessage) != "" {
		record.Set("error_message", errorMessage)
	}

	if sources != nil {
		sourcesJSON, err := json.Marshal(sources)
		if err != nil {
			return "", err
		}
		record.Set("sources", string(sourcesJSON))
	}

	if err := app.Save(record); err != nil {
		return "", err
	}

	return record.Id, nil
}

func updateMessageStatusOnly(app *pocketbase.PocketBase, messageID, status, errorMessage string) error {
	record, err := app.FindRecordById("messages", messageID)
	if err != nil {
		return err
	}

	record.Set("status", status)
	if strings.TrimSpace(errorMessage) == "" {
		record.Set("error_message", nil)
	} else {
		record.Set("error_message", errorMessage)
	}

	return app.Save(record)
}

func updateMessage(app *pocketbase.PocketBase, messageID, content string, sources []ChatSource, status, errorMessage string) error {
	record, err := app.FindRecordById("messages", messageID)
	if err != nil {
		return err
	}

	record.Set("content", content)
	if sources != nil {
		sourcesJSON, err := json.Marshal(sources)
		if err != nil {
			return err
		}
		record.Set("sources", string(sourcesJSON))
	}
	record.Set("status", status)
	if strings.TrimSpace(errorMessage) == "" {
		record.Set("error_message", nil)
	} else {
		record.Set("error_message", errorMessage)
	}

	return app.Save(record)
}

func buildPromptWithContext(results []vector_search.SearchResult) string {
	var sb strings.Builder
	sb.WriteString("You are an AI assistant helping users understand their uploaded documents.\n\n")

	if len(results) == 0 {
		sb.WriteString("No relevant context was found in the user's documents. Answer based on your general knowledge, but let the user know if you're unsure.\n")
		return sb.String()
	}

	sb.WriteString("Use the following context from the user's documents to answer their question.\n\n")
	sb.WriteString("RESPONSE STYLE:\n")
	sb.WriteString("- Be thorough by default: provide a clear direct answer followed by concise supporting detail.\n")
	sb.WriteString("- For non-trivial questions, prefer 2-4 short paragraphs and bullet points when useful.\n")
	sb.WriteString("- Synthesize across multiple relevant context chunks when available.\n")
	sb.WriteString("- Do not be terse unless the user explicitly asks for a brief answer.\n\n")

	sb.WriteString("IMPORTANT INSTRUCTIONS:\n")
	sb.WriteString("- Ground factual claims in the provided context.\n")
	sb.WriteString("- When referencing grounded information, cite it using [citation:CHUNK_ID] format where CHUNK_ID is the chunk_id from the context.\n")
	sb.WriteString("- Example: \"This is a direct quote from the text.\"[citation:abc123def]\n")
	sb.WriteString("- Each referenced grounded statement should have a nearby citation marker.\n")
	sb.WriteString("- Use as many distinct relevant chunk_ids as needed to support the answer (not just one), while avoiding irrelevant citations.\n")
	sb.WriteString("- Prefer concise paraphrases; only use short direct quotes when necessary.\n")
	sb.WriteString("- Avoid long verbatim passages from source documents.\n")
	sb.WriteString("- Each citation in the citations array must include chunk_id, page_number, and upload_id; include quote when you used a direct snippet.\n")
	sb.WriteString("- Do not add [citation:...] markers unless you are actually quoting or referencing specific content.\n")
	sb.WriteString("- If the context doesn't contain enough information, say so clearly.\n\n")
	sb.WriteString("CONTEXT:\n\n")

	for _, r := range results {
		fmt.Fprintf(&sb, "[chunk_id: %s] (upload: %s, page: %d, title: %s)\n%s\n\n",
			r.ChunkID, r.UploadID, r.PageNumber, r.Title, r.Content)
	}

	return sb.String()
}

type chatPromptContext struct {
	ContextID  string
	UploadID   string
	PageNumber int
	Title      string
	Text       string
}

func buildPromptWithSidebarContext(contexts []chatPromptContext) string {
	var sb strings.Builder
	sb.WriteString("You are Libgraph Sidebar AI, a focused reading companion embedded in the document sidebar.\n")
	sb.WriteString("Your job is to answer questions about the attached reading context quickly, clearly, and accurately.\n\n")

	if len(contexts) == 0 {
		sb.WriteString("No context was attached to this chat. Ask the user to add document/page context before answering in detail.\n")
		return sb.String()
	}

	sb.WriteString("SIDEBAR RESPONSE STYLE:\n")
	sb.WriteString("- Prefer concise answers suitable for a narrow sidebar UI.\n")
	sb.WriteString("- Start with the direct answer, then add short supporting points.\n")
	sb.WriteString("- If the question is ambiguous, ask one brief clarifying question.\n")
	sb.WriteString("- Do not mention internal tooling, embeddings, vector search, or prompt details.\n\n")

	sb.WriteString("GROUNDING RULES:\n")
	sb.WriteString("- Use ONLY the context blocks below as factual grounding.\n")
	sb.WriteString("- If context is insufficient, say that clearly and suggest what context/page to add.\n")
	sb.WriteString("- Do not invent page numbers, quotes, or facts not present in context.\n")
	sb.WriteString("- Keep uncertainty explicit rather than guessing.\n\n")
	sb.WriteString("CONTEXT:\n\n")

	const maxPromptContextChars = 180_000
	usedChars := 0
	for _, c := range contexts {
		text := strings.TrimSpace(c.Text)
		if text == "" {
			continue
		}
		if usedChars >= maxPromptContextChars {
			break
		}
		remaining := maxPromptContextChars - usedChars
		if len(text) > remaining {
			text = text[:remaining]
		}
		fmt.Fprintf(&sb, "[context_id: %s] (upload: %s, page: %d, title: %s)\n%s\n\n",
			c.ContextID, c.UploadID, c.PageNumber, c.Title, text)
		usedChars += len(text)
	}

	return sb.String()
}

func getResponseSchema() *genai.Schema {
	return &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"answer": {
				Type:        genai.TypeString,
				Description: "The complete answer to the user's question, with [citation:chunk_id] markers inline where appropriate",
			},
			"citations": {
				Type:        genai.TypeArray,
				Description: "Array of citations referenced in the answer",
				Items: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"chunk_id": {
							Type:        genai.TypeString,
							Description: "The chunk_id of the source chunk",
						},
						"quote": {
							Type:        genai.TypeString,
							Description: "Optional short quoted snippet from the context when direct quote is used",
						},
						"page_number": {
							Type:        genai.TypeInteger,
							Description: "The page number of the source",
						},
						"upload_id": {
							Type:        genai.TypeString,
							Description: "The upload ID of the source document",
						},
					},
					Required: []string{"chunk_id", "page_number", "upload_id"},
				},
			},
		},
		Required: []string{"answer", "citations"},
	}
}

func isRecitationBlockedError(err error) bool {
	if err == nil {
		return false
	}
	errText := strings.ToLower(err.Error())
	if strings.Contains(errText, "finishreasonrecitation") {
		return true
	}
	return strings.Contains(errText, "recitation") && strings.Contains(errText, "blocked")
}

func buildGeminiHistory(messages []ChatMessage) []*genai.Content {
	history := make([]*genai.Content, 0, len(messages))
	for _, msg := range messages {
		role := "user"
		if msg.Role == "assistant" {
			role = "model"
		}
		history = append(history, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(msg.Content)},
		})
	}
	return history
}

func extractResponseText(resp *genai.GenerateContentResponse) string {
	if resp == nil || len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return ""
	}
	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if text, ok := part.(genai.Text); ok {
			sb.WriteString(string(text))
		}
	}
	return sb.String()
}

func sourcesFromSearchResults(results []vector_search.SearchResult) []ChatSource {
	sources := make([]ChatSource, 0, len(results))
	for _, r := range results {
		score := 1.0 / (1.0 + r.Distance)

		sources = append(sources, ChatSource{
			NodeID:     r.ChunkID,
			UploadID:   r.UploadID,
			Title:      r.Title,
			Score:      score,
			Text:       r.Content,
			PageNumber: r.PageNumber,
		})
	}
	return sources
}

func buildSourcesFromCitations(citations []Citation, searchResults []vector_search.SearchResult) []ChatSource {
	resultMap := make(map[string]vector_search.SearchResult)
	for _, r := range searchResults {
		resultMap[r.ChunkID] = r
	}

	seen := make(map[string]bool)
	sources := make([]ChatSource, 0)

	for _, c := range citations {
		if seen[c.ChunkID] {
			continue
		}
		seen[c.ChunkID] = true

		source := ChatSource{
			NodeID:     c.ChunkID,
			UploadID:   c.UploadID,
			PageNumber: c.PageNumber,
			Text:       c.Quote,
		}

		if sr, ok := resultMap[c.ChunkID]; ok {
			source.Title = sr.Title
			source.Score = 1.0 / (1.0 + sr.Distance)
			if source.Text == "" {
				source.Text = sr.Content
			}
		}

		sources = append(sources, source)
	}

	return sources
}

func buildSourcesForChatResponse(citations []Citation, searchResults []vector_search.SearchResult, maxSources int) []ChatSource {
	if maxSources <= 0 {
		maxSources = 10
	}
	const minRelevantSources = 4

	citedSources := buildSourcesFromCitations(citations, searchResults)
	if len(citedSources) >= maxSources {
		return citedSources[:maxSources]
	}
	if len(citedSources) >= minRelevantSources {
		return citedSources
	}

	targetSources := minRelevantSources
	if targetSources > maxSources {
		targetSources = maxSources
	}

	combined := make([]ChatSource, 0, targetSources)
	seenNodeIDs := make(map[string]bool)

	for _, src := range citedSources {
		combined = append(combined, src)
		if src.NodeID != "" {
			seenNodeIDs[src.NodeID] = true
		}
	}

	for _, r := range searchResults {
		if len(combined) >= targetSources {
			break
		}
		if seenNodeIDs[r.ChunkID] {
			continue
		}
		score := 1.0 / (1.0 + r.Distance)
		combined = append(combined, ChatSource{
			NodeID:     r.ChunkID,
			UploadID:   r.UploadID,
			Title:      r.Title,
			Score:      score,
			Text:       r.Content,
			PageNumber: r.PageNumber,
		})
		seenNodeIDs[r.ChunkID] = true
	}

	return combined
}

func resolveFilterUploadIDs(app *pocketbase.PocketBase, filters *MetadataFilters) ([]string, error) {
	uploadIDSet := make(map[string]bool)

	for _, uid := range filters.Uploads {
		uploadIDSet[uid] = true
	}

	for _, collectionID := range filters.Collections {
		record, err := app.FindRecordById("collections", collectionID)
		if err != nil {
			continue
		}
		for _, uid := range record.GetStringSlice("uploads") {
			uploadIDSet[uid] = true
		}
	}

	filterGroups := []string{}
	filterParams := dbx.Params{}
	condition := "||"
	if filters.Condition == "and" {
		condition = "&&"
	}

	if len(filters.Tags) > 0 {
		parts := make([]string, 0, len(filters.Tags))
		for i, tag := range filters.Tags {
			key := fmt.Sprintf("tag%d", i)
			parts = append(parts, fmt.Sprintf("tags ~ {:%s}", key))
			filterParams[key] = tag
		}
		filterGroups = append(filterGroups, "("+strings.Join(parts, " || ")+")")
	}

	if len(filters.People) > 0 {
		parts := make([]string, 0, len(filters.People))
		for i, person := range filters.People {
			key := fmt.Sprintf("person%d", i)
			parts = append(parts, fmt.Sprintf("people ~ {:%s}", key))
			filterParams[key] = person
		}
		filterGroups = append(filterGroups, "("+strings.Join(parts, " || ")+")")
	}

	if len(filters.Publications) > 0 {
		parts := make([]string, 0, len(filters.Publications))
		for i, pub := range filters.Publications {
			key := fmt.Sprintf("pub%d", i)
			parts = append(parts, fmt.Sprintf("publication = {:%s}", key))
			filterParams[key] = pub
		}
		filterGroups = append(filterGroups, "("+strings.Join(parts, " || ")+")")
	}

	if len(filters.Types) > 0 {
		parts := make([]string, 0, len(filters.Types))
		for i, t := range filters.Types {
			key := fmt.Sprintf("type%d", i)
			parts = append(parts, fmt.Sprintf("type = {:%s}", key))
			filterParams[key] = t
		}
		filterGroups = append(filterGroups, "("+strings.Join(parts, " || ")+")")
	}

	if len(filters.Topics) > 0 {
		parts := make([]string, 0, len(filters.Topics))
		for i, topic := range filters.Topics {
			key := fmt.Sprintf("topic%d", i)
			parts = append(parts, fmt.Sprintf("topic ~ {:%s}", key))
			filterParams[key] = topic
		}
		filterGroups = append(filterGroups, "("+strings.Join(parts, " || ")+")")
	}

	if len(filterGroups) > 0 {
		filterStr := strings.Join(filterGroups, " "+condition+" ")
		records, err := app.FindRecordsByFilter("uploads", filterStr, "", 0, 0, filterParams)
		if err != nil {
			return nil, err
		} else {
			for _, r := range records {
				uploadIDSet[r.Id] = true
			}
		}
	}

	result := make([]string, 0, len(uploadIDSet))
	for uid := range uploadIDSet {
		result = append(result, uid)
	}

	return result, nil
}

func floatPtr(f float32) *float32 {
	return &f
}

func int32Ptr(v int32) *int32 {
	return &v
}

func loadSidebarPromptContexts(app *pocketbase.PocketBase, chatID, userID string) ([]chatPromptContext, error) {
	app.Logger().Info(
		"reader sidebar context load: start",
		"chat_id", chatID,
		"user_id", userID,
	)

	records, err := app.FindRecordsByFilter(
		collections.ChatContexts,
		"chat = {:chatId} && user = {:userId}",
		"-created",
		0, 0,
		dbx.Params{"chatId": chatID, "userId": userID},
	)
	if err != nil {
		return nil, err
	}

	app.Logger().Info(
		"reader sidebar context load: found chat context records",
		"chat_id", chatID,
		"user_id", userID,
		"record_count", len(records),
	)

	uploadTitleCache := make(map[string]string)
	seenPageContext := make(map[string]bool)
	contexts := make([]chatPromptContext, 0)

	resolveUploadTitle := func(uploadID string) string {
		uploadID = strings.TrimSpace(uploadID)
		if uploadID == "" {
			return "Document"
		}
		if cached, ok := uploadTitleCache[uploadID]; ok {
			return cached
		}
		uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
		if err != nil {
			uploadTitleCache[uploadID] = "Document"
			return "Document"
		}
		title := strings.TrimSpace(uploadRecord.GetString("title"))
		if title == "" {
			title = "Document"
		}
		uploadTitleCache[uploadID] = title
		return title
	}

	appendPageContext := func(pageRecord *core.Record, contextID, source string) {
		if pageRecord == nil {
			app.Logger().Info(
				"reader sidebar context load: skipped nil page record",
				"chat_id", chatID,
				"user_id", userID,
				"source", source,
			)
			return
		}
		pageID := strings.TrimSpace(pageRecord.Id)
		if pageID == "" {
			app.Logger().Info(
				"reader sidebar context load: skipped page with empty id",
				"chat_id", chatID,
				"user_id", userID,
				"source", source,
			)
			return
		}
		if seenPageContext[pageID] {
			app.Logger().Info(
				"reader sidebar context load: skipped duplicate page",
				"chat_id", chatID,
				"user_id", userID,
				"source", source,
				"page_id", pageID,
				"page_number", pageRecord.GetInt("page"),
			)
			return
		}
		markdown, readErr := ReadPageMarkdown(app, pageRecord)
		if readErr != nil {
			app.Logger().Error(
				"reader sidebar context load: failed to read page markdown",
				"chat_id", chatID,
				"user_id", userID,
				"source", source,
				"page_id", pageID,
				"page_number", pageRecord.GetInt("page"),
				"error", readErr,
			)
			return
		}
		trimmed := strings.TrimSpace(markdown)
		if trimmed == "" {
			app.Logger().Info(
				"reader sidebar context load: skipped empty markdown page",
				"chat_id", chatID,
				"user_id", userID,
				"source", source,
				"page_id", pageID,
				"page_number", pageRecord.GetInt("page"),
			)
			return
		}

		uploadID := strings.TrimSpace(pageRecord.GetString("upload"))
		markdownFilename := strings.TrimSpace(pageRecord.GetString("markdown"))
		contexts = append(contexts, chatPromptContext{
			ContextID:  contextID,
			UploadID:   uploadID,
			PageNumber: pageRecord.GetInt("page"),
			Title:      resolveUploadTitle(uploadID),
			Text:       trimmed,
		})
		seenPageContext[pageID] = true

		app.Logger().Info(
			"reader sidebar context load: appended page context",
			"chat_id", chatID,
			"user_id", userID,
			"source", source,
			"context_id", contextID,
			"upload_id", uploadID,
			"page_id", pageID,
			"page_number", pageRecord.GetInt("page"),
			"markdown_file", markdownFilename,
			"markdown_chars_raw", len(markdown),
			"text_chars", len(trimmed),
			"text_preview", previewLogText(trimmed, 140),
		)
	}

	for _, r := range records {
		uploadID := strings.TrimSpace(r.GetString("upload"))
		pageID := strings.TrimSpace(r.GetString("page"))
		pFrom := r.GetInt("page_from")
		pTo := r.GetInt("page_to")

		app.Logger().Info(
			"reader sidebar context load: processing record",
			"chat_id", chatID,
			"user_id", userID,
			"chat_context_id", r.Id,
			"upload_id", uploadID,
			"page_id", pageID,
			"page_from", pFrom,
			"page_to", pTo,
			"has_text", strings.TrimSpace(r.GetString("text")) != "",
		)

		if txt := strings.TrimSpace(r.GetString("text")); txt != "" {
			pageNumber := 0
			resolvedUploadID := uploadID
			if pageID != "" {
				pageRecord, pageErr := app.FindRecordById(collections.Pages, pageID)
				if pageErr == nil {
					resolvedUploadID = strings.TrimSpace(pageRecord.GetString("upload"))
					pageNumber = pageRecord.GetInt("page")
				}
			}
			contexts = append(contexts, chatPromptContext{
				ContextID:  "ctx-text-" + r.Id,
				UploadID:   resolvedUploadID,
				PageNumber: pageNumber,
				Title:      resolveUploadTitle(resolvedUploadID),
				Text:       txt,
			})
			app.Logger().Info(
				"reader sidebar context load: appended text context",
				"chat_id", chatID,
				"user_id", userID,
				"chat_context_id", r.Id,
				"context_id", "ctx-text-"+r.Id,
				"upload_id", resolvedUploadID,
				"page_number", pageNumber,
				"text_chars", len(txt),
			)
		}

		if pFrom > 0 && pTo >= pFrom && uploadID != "" {
			pageRecords, err := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId} && page >= {:fromPage} && page <= {:toPage}",
				"page",
				0,
				0,
				dbx.Params{"uploadId": uploadID, "fromPage": pFrom, "toPage": pTo},
			)
			if err != nil {
				app.Logger().Error(
					"reader sidebar context load: page range lookup failed",
					"chat_id", chatID,
					"user_id", userID,
					"chat_context_id", r.Id,
					"upload_id", uploadID,
					"page_from", pFrom,
					"page_to", pTo,
					"error", err,
				)
				continue
			} else {
				app.Logger().Info(
					"reader sidebar context load: page range lookup result",
					"chat_id", chatID,
					"user_id", userID,
					"chat_context_id", r.Id,
					"upload_id", uploadID,
					"page_from", pFrom,
					"page_to", pTo,
					"matched_count", len(pageRecords),
					"matched_pages", summarizePageNumbers(pageRecords),
				)
				for _, pageRecord := range pageRecords {
					appendPageContext(pageRecord, "ctx-page-"+pageRecord.Id, "range")
				}
			}
			continue
		}

		if pageID != "" {
			pageRecord, err := app.FindRecordById(collections.Pages, pageID)
			if err != nil {
				app.Logger().Error(
					"reader sidebar context load: page lookup failed",
					"chat_id", chatID,
					"user_id", userID,
					"chat_context_id", r.Id,
					"page_id", pageID,
					"error", err,
				)
				continue
			}
			appendPageContext(pageRecord, "ctx-page-"+pageID, "single_page")
			continue
		}

		if uploadID != "" {
			pageRecords, err := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId}",
				"page",
				0,
				0,
				dbx.Params{"uploadId": uploadID},
			)
			if err != nil {
				continue
			}

			for _, pageRecord := range pageRecords {
				appendPageContext(pageRecord, "ctx-page-"+pageRecord.Id, "full_upload")
			}
		}
	}

	return contexts, nil
}

func summarizePageNumbers(pageRecords []*core.Record) string {
	if len(pageRecords) == 0 {
		return ""
	}
	pages := make([]string, 0, len(pageRecords))
	for _, pageRecord := range pageRecords {
		if pageRecord == nil {
			continue
		}
		pages = append(pages, strconv.Itoa(pageRecord.GetInt("page")))
	}
	return strings.Join(pages, ",")
}

func summarizeSidebarPromptContexts(contexts []chatPromptContext) string {
	if len(contexts) == 0 {
		return ""
	}
	parts := make([]string, 0, len(contexts))
	for _, c := range contexts {
		parts = append(parts, fmt.Sprintf("%s@%d/%s", c.ContextID, c.PageNumber, c.UploadID))
	}
	return strings.Join(parts, ";")
}

func previewLogText(text string, maxLen int) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || maxLen <= 0 {
		return ""
	}
	normalized := strings.Join(strings.Fields(trimmed), " ")
	if len(normalized) <= maxLen {
		return normalized
	}
	return normalized[:maxLen] + "…"
}

func ReadPageMarkdown(app *pocketbase.PocketBase, pageRecord *core.Record) (string, error) {
	filename := pageRecord.GetString("markdown")
	if filename == "" {
		return "", fmt.Errorf("page markdown file is empty")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()

	filePath := pageRecord.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return "", err
	}
	defer blob.Close()

	content, err := io.ReadAll(blob)
	if err != nil {
		return "", err
	}

	return string(content), nil
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
	model.Temperature = floatPtr(0.2)
	model.SystemInstruction = genai.NewUserContent(genai.Text("You summarize a single page from a user's document. Return concise markdown with 4-7 bullet points and a short 1-sentence takeaway at the end. Do not include citations, JSON, or extra preamble."))

	prompt := fmt.Sprintf("Summarize this page content:\n\n%s", trimmed)
	resp, err := model.GenerateContent(context.Background(), genai.Text(prompt))
	if err != nil {
		return "", err
	}

	summary := strings.TrimSpace(extractResponseText(resp))
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
	model.Temperature = floatPtr(0.2)
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

	summary := strings.TrimSpace(extractResponseText(resp))
	if summary == "" {
		return "", fmt.Errorf("empty summary response")
	}
	if isLikelyMissingContentSummary(summary) {
		return "", fmt.Errorf("invalid summary response: model reported missing content")
	}

	return summary, nil
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

func UpsertPageSummaryArtifact(app *pocketbase.PocketBase, sourcePageRecord *core.Record, userID, summaryMarkdown string, fullDocument bool) (*core.Record, *core.Record, *core.Record, error) {
	sourceUploadID := sourcePageRecord.GetString("upload")
	if strings.TrimSpace(sourceUploadID) == "" {
		return nil, nil, nil, fmt.Errorf("source page missing upload relation")
	}

	sourceUploadRecord, err := app.FindRecordById(collections.Uploads, sourceUploadID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to load source upload: %w", err)
	}
	uploadsCollection, err := app.FindCollectionByNameOrId(collections.Uploads)
	if err != nil {
		return nil, nil, nil, err
	}

	pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
	if err != nil {
		return nil, nil, nil, err
	}

	summariesCollection, err := app.FindCollectionByNameOrId(collections.Summaries)
	if err != nil {
		return nil, nil, nil, err
	}

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
