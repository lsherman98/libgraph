package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

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
		return fmt.Errorf("failed to create Gemini client: %w", err)
	}

	registerQueueHandlers(app)

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
				uploadIDs = resolveFilterUploadIDs(app, body.Filters)
			}

			chatID := body.ChatID

			var sidebarContexts []chatPromptContext
			if body.Mode == "reader_sidebar" && chatID != "" {
				sidebarContexts, err := loadSidebarPromptContexts(app, chatID, userID)
				if err != nil {
					return e.InternalServerError("failed to load chat contexts", err)
				}
				if len(sidebarContexts) == 0 {
					return e.BadRequestError("at least one context item is required", nil)
				}
			}

			if chatID == "" {
				title := body.Message
				if len(title) > 80 {
					title = title[:80] + "…"
				}

				if body.Mode == "search" {
					title = "Search: " + title
				}

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
			}

			userMsgID, err := saveMessage(app, chatID, userID, "user", body.Message, nil)
			if err != nil {
				return e.InternalServerError("failed to save user message", err)
			}

			if body.Mode == "search" {
				results, err := vector_search.Search(app, body.Message, uploadIDs, 10)
				if err != nil {
					return e.InternalServerError("search request failed", err)
				}

				sources := sourcesFromSearchResults(results)

				assistantMsgID, err := saveMessage(app, chatID, userID, "assistant", "", sources)
				if err != nil {
					return e.InternalServerError("failed to save assistant message", err)
				}

				return e.JSON(http.StatusOK, ChatResponse{
					ChatID:             chatID,
					Sources:            sources,
					UserMessageID:      userMsgID,
					AssistantMessageID: assistantMsgID,
				})
			}

			if body.Mode == "reader_sidebar" {
				systemPrompt := buildPromptWithSidebarContext(sidebarContexts)

				history, err := loadChatHistory(app, chatID)
				if err != nil {
					return e.InternalServerError("failed to load chat history", err)
				}

				modelName := os.Getenv("GEMINI_MODEL")
				if modelName == "" {
					modelName = "gemini-3.1-flash-lite-preview"
				}

				model := geminiClient.GenerativeModel(modelName)
				model.Temperature = floatPtr(0.2)
				model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

				cs := model.StartChat()
				cs.History = buildGeminiHistory(history)

				resp, err := cs.SendMessage(context.Background(), genai.Text(body.Message))
				if err != nil {
					return e.InternalServerError("chat request failed", err)
				}

				answer := strings.TrimSpace(extractResponseText(resp))
				if answer == "" {
					answer = "I couldn't generate a response from the provided context."
				}

				assistantMsgID, err := saveMessage(app, chatID, userID, "assistant", answer, nil)
				if err != nil {
					return e.InternalServerError("failed to save assistant message", err)
				}

				return e.JSON(http.StatusOK, ChatResponse{
					ChatID:             chatID,
					Message:            answer,
					UserMessageID:      userMsgID,
					AssistantMessageID: assistantMsgID,
				})
			}

			searchResults, err := vector_search.Search(app, body.Message, uploadIDs, 10)
			if err != nil {
				searchResults = nil
			}

			systemPrompt := buildPromptWithContext(searchResults)

			history, err := loadChatHistory(app, chatID)
			if err != nil {
				return e.InternalServerError("failed to load chat history", err)
			}

			modelName := os.Getenv("GEMINI_MODEL")
			if modelName == "" {
				modelName = "gemini-3.1-flash-lite-preview"
			}

			model := geminiClient.GenerativeModel(modelName)
			model.Temperature = floatPtr(0.2)
			model.ResponseMIMEType = "application/json"
			model.ResponseSchema = getResponseSchema()
			model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

			cs := model.StartChat()
			cs.History = buildGeminiHistory(history)

			resp, err := cs.SendMessage(context.Background(), genai.Text(body.Message))
			if err != nil {
				return e.InternalServerError("chat request failed", err)
			}

			responseText := extractResponseText(resp)
			var structured StructuredChatResponse
			if err := json.Unmarshal([]byte(responseText), &structured); err != nil {
				structured = StructuredChatResponse{Answer: responseText}
			}

			sources := buildSourcesFromCitations(structured.Citations, searchResults)

			assistantMsgID, err := saveMessage(app, chatID, userID, "assistant", structured.Answer, sources)
			if err != nil {
				return e.InternalServerError("failed to save assistant message", err)
			}

			return e.JSON(http.StatusOK, ChatResponse{
				ChatID:             chatID,
				Message:            structured.Answer,
				Sources:            sources,
				UserMessageID:      userMsgID,
				AssistantMessageID: assistantMsgID,
			})
		}).Bind(apis.RequireAuth())

		se.Router.POST("/api/pages/{pageId}/summarize", func(e *core.RequestEvent) error {
			pageID := strings.TrimSpace(e.Request.PathValue("pageId"))
			if pageID == "" {
				return e.BadRequestError("page id is required", nil)
			}

			userID := e.Auth.Id

			pageRecord, err := app.FindRecordById("pages", pageID)
			if err != nil {
				return e.NotFoundError("page not found", err)
			}

			pageUserID := pageRecord.GetString("user")
			if pageUserID != userID {
				return e.NotFoundError("page not found", nil)
			}
			pageUploadID := pageRecord.GetString("upload")

			uploadRecord, err := app.FindRecordById(collections.Uploads, pageUploadID)
			if err != nil {
				return e.NotFoundError("upload not found", err)
			}
			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadType == "summary" {
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
				UserID:   userID,
				UploadID: pageUploadID,
				PageID:   pageID,
			}); err != nil {
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, PageSummaryQueuedResponse{
				Status:    "queued",
				PageID:    pageID,
				DedupeKey: dedupeKey,
			})
		}).Bind(apis.RequireAuth())

		se.Router.POST("/api/pages/summarize", func(e *core.RequestEvent) error {
			body := PageSummaryBatchRequest{}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("invalid request body", err)
			}

			if len(body.PageIDs) == 0 {
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
				return e.BadRequestError("at least one valid page id is required", nil)
			}

			pages := make([]*core.Record, 0, len(requestedIDs))
			uploadID := ""
			for _, pageID := range requestedIDs {
				pageRecord, err := app.FindRecordById(collections.Pages, pageID)
				if err != nil {
					return e.NotFoundError("page not found", err)
				}

				if pageRecord.GetString("user") != userID {
					return e.NotFoundError("page not found", nil)
				}

				pageUploadID := strings.TrimSpace(pageRecord.GetString("upload"))
				if pageUploadID == "" {
					return e.BadRequestError("page upload is required", nil)
				}

				if uploadID == "" {
					uploadID = pageUploadID
				} else if uploadID != pageUploadID {
					return e.BadRequestError("all selected pages must belong to the same upload", nil)
				}

				pages = append(pages, pageRecord)
			}

			uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return e.NotFoundError("upload not found", err)
			}
			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadType == "summary" {
				return e.BadRequestError("cannot summarize summary uploads", nil)
			}
			if uploadType != "book" && len(pages) > 1 {
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
				UserID:   userID,
				UploadID: uploadID,
				PageID:   sortedIDs[0],
			}); err != nil {
				return e.InternalServerError("failed to enqueue summary", err)
			}

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

func registerQueueHandlers(app *pocketbase.PocketBase) {
	processing.RegisterHandler(processing.JobTypePageSummarize, handlePageSummarizeJob)
}

func handlePageSummarizeJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := pageSummarizePayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}

	if strings.TrimSpace(payload.UserID) == "" {
		return fmt.Errorf("payload user_id is required")
	}

	if len(payload.PageIDs) > 0 {
		return handlePageRangeSummarizeJob(app, payload)
	}

	if strings.TrimSpace(payload.PageID) == "" {
		return fmt.Errorf("payload page_id is required")
	}

	pageRecord, err := app.FindRecordById(collections.Pages, payload.PageID)
	if err != nil {
		return err
	}
	uploadID := strings.TrimSpace(pageRecord.GetString("upload"))
	if uploadID == "" {
		return fmt.Errorf("page %s missing upload relation", payload.PageID)
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}
	uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
	if uploadType == "summary" {
		return fmt.Errorf("cannot summarize summary upload %s", uploadID)
	}
	if uploadType != "book" {
		payload.FullDocument = true
		if strings.TrimSpace(payload.UploadID) == "" {
			payload.UploadID = uploadID
		}
	}

	pageUserID := pageRecord.GetString("user")
	if pageUserID != payload.UserID {
		return fmt.Errorf("page %s does not belong to user %s", payload.PageID, payload.UserID)
	}

	markdown, err := ReadPageMarkdown(app, pageRecord)
	if err != nil {
		return err
	}

	summary := ""
	if payload.FullDocument {
		uploadID := strings.TrimSpace(payload.UploadID)
		if uploadID == "" {
			uploadID = strings.TrimSpace(pageRecord.GetString("upload"))
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
			return err
		}
		if len(pages) == 0 {
			return fmt.Errorf("no pages found for upload %s", uploadID)
		}

		allMarkdown := strings.Builder{}
		for _, p := range pages {
			pageMarkdown, readErr := ReadPageMarkdown(app, p)
			if readErr != nil {
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
			return err
		}
	} else {
		summary, err = GeneratePageSummary(markdown)
		if err != nil {
			return err
		}
	}

	_, _, _, err = UpsertPageSummaryArtifact(app, pageRecord, payload.UserID, summary, payload.FullDocument)
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
	primarySummaryRecord, summaryUploadRecord, summaryPageRecord, err := UpsertPageSummaryArtifact(app, primaryPage, payload.UserID, summary, true)
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

	for _, sourcePageRecord := range pages[1:] {
		if err := upsertSummaryLinkRecord(app, sourcePageRecord, payload.UserID, summaryUploadRecord.Id, summaryPageRecord.Id); err != nil {
			return err
		}
	}

	if primarySummaryRecord.GetString("source_page") != primaryPage.Id || primarySummaryRecord.GetString("source_upload") != uploadID {
		if err := upsertSummaryLinkRecord(app, primaryPage, payload.UserID, summaryUploadRecord.Id, summaryPageRecord.Id); err != nil {
			return err
		}
	}

	return nil
}

func upsertSummaryLinkRecord(app *pocketbase.PocketBase, sourcePageRecord *core.Record, userID, summaryUploadID, summaryPageID string) error {
	summariesCollection, err := app.FindCollectionByNameOrId(collections.Summaries)
	if err != nil {
		return err
	}

	summaryRecord, err := app.FindFirstRecordByFilter(
		collections.Summaries,
		"user = {:userId} && source_page = {:sourcePage}",
		dbx.Params{"userId": userID, "sourcePage": sourcePageRecord.Id},
	)

	sourceUploadID := strings.TrimSpace(sourcePageRecord.GetString("upload"))
	if sourceUploadID == "" {
		return fmt.Errorf("source page missing upload relation")
	}

	if err != nil {
		summaryRecord = core.NewRecord(summariesCollection)
		summaryRecord.Set("user", userID)
		summaryRecord.Set("source_page", sourcePageRecord.Id)
	}

	summaryRecord.Set("source_upload", sourceUploadID)
	summaryRecord.Set("summary_upload", summaryUploadID)
	summaryRecord.Set("summary_page", summaryPageID)
	summaryRecord.Set("scope", "page")
	summaryRecord.Set("status", "success")

	return app.Save(summaryRecord)
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
		messages = append(messages, ChatMessage{
			Role:    role,
			Content: content,
		})
	}
	return messages, nil
}

func saveMessage(app *pocketbase.PocketBase, chatID, userID, role, content string, sources []ChatSource) (string, error) {
	messagesCollection, err := app.FindCollectionByNameOrId("messages")
	if err != nil {
		return "", err
	}

	record := core.NewRecord(messagesCollection)
	record.Set("chat", chatID)
	record.Set("user", userID)
	record.Set("role", role)
	record.Set("content", content)

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

func buildPromptWithContext(results []vector_search.SearchResult) string {
	var sb strings.Builder
	sb.WriteString("You are an AI assistant helping users understand their uploaded documents.\n\n")

	if len(results) == 0 {
		sb.WriteString("No relevant context was found in the user's documents. Answer based on your general knowledge, but let the user know if you're unsure.\n")
		return sb.String()
	}

	sb.WriteString("Use the following context from the user's documents to answer their question.\n\n")
	sb.WriteString("IMPORTANT INSTRUCTIONS:\n")
	sb.WriteString("- Quote directly from the provided context when answering.\n")
	sb.WriteString("- When quoting or referencing information, ALWAYS cite it using [citation:CHUNK_ID] format where CHUNK_ID is the chunk_id from the context.\n")
	sb.WriteString("- Example: \"This is a direct quote from the text.\"[citation:abc123def]\n")
	sb.WriteString("- CRITICAL: Every individual quote or piece of referenced information must have its own citation immediately after it.\n")
	sb.WriteString("- Prefer longer, more complete quotes over brief paraphrases.\n")
	sb.WriteString("- MANDATORY: For EVERY quote you use from the context, you MUST include that exact quote text in the citations array in your JSON response.\n")
	sb.WriteString("- Each citation in the citations array must include the chunk_id, quote text, page_number, and upload_id from the context.\n")
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
							Description: "The specific quoted text from the context",
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
					Required: []string{"chunk_id", "quote", "page_number", "upload_id"},
				},
			},
		},
		Required: []string{"answer", "citations"},
	}
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

func resolveFilterUploadIDs(app *pocketbase.PocketBase, filters *MetadataFilters) []string {
	uploadIDSet := make(map[string]bool)

	for _, uid := range filters.Uploads {
		uploadIDSet[uid] = true
	}

	for _, collectionID := range filters.Collections {
		record, err := app.FindRecordById("collections", collectionID)
		if err != nil {
			app.Logger().Error("[chat] failed to resolve collection", "id", collectionID, "error", err)
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
			app.Logger().Error("[chat] failed to query uploads for filters",
				"filter", filterStr,
				"error", err,
			)
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

	return result
}

func floatPtr(f float32) *float32 {
	return &f
}

func loadSidebarPromptContexts(app *pocketbase.PocketBase, chatID, userID string) ([]chatPromptContext, error) {
	records, err := app.FindRecordsByFilter(
		collections.ChatContexts,
		"chat = {:chatId} && user = {:userId}",
		"-created",
		0, 0,
		dbx.Params{"chatId": chatID, "userId": userID},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query chat_contexts: %w", err)
	}

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
			app.Logger().Warn("[chat/reader_sidebar] failed to resolve upload title", "upload_id", uploadID, "error", err)
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

	appendPageContext := func(pageRecord *core.Record, contextID string) {
		if pageRecord == nil {
			return
		}
		pageID := strings.TrimSpace(pageRecord.Id)
		if pageID == "" || seenPageContext[pageID] {
			return
		}
		markdown, readErr := ReadPageMarkdown(app, pageRecord)
		if readErr != nil {
			app.Logger().Warn("[chat/reader_sidebar] failed to read page markdown", "page_id", pageID, "error", readErr)
			return
		}
		trimmed := strings.TrimSpace(markdown)
		if trimmed == "" {
			return
		}

		uploadID := strings.TrimSpace(pageRecord.GetString("upload"))
		contexts = append(contexts, chatPromptContext{
			ContextID:  contextID,
			UploadID:   uploadID,
			PageNumber: pageRecord.GetInt("page"),
			Title:      resolveUploadTitle(uploadID),
			Text:       trimmed,
		})
		seenPageContext[pageID] = true
	}

	for _, r := range records {
		uploadID := strings.TrimSpace(r.GetString("upload"))
		pageID := strings.TrimSpace(r.GetString("page"))

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
		}

		pFrom := r.GetInt("page_from")
		pTo := r.GetInt("page_to")
		if pFrom > 0 && pTo >= pFrom && uploadID != "" {
			pageRecords, pageErr := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId} && page >= {:fromPage} && page <= {:toPage}",
				"page",
				0,
				0,
				dbx.Params{"uploadId": uploadID, "fromPage": pFrom, "toPage": pTo},
			)
			if pageErr != nil {
				app.Logger().Warn("[chat/reader_sidebar] failed to resolve page range context", "upload_id", uploadID, "from", pFrom, "to", pTo, "error", pageErr)
			} else {
				for _, pageRecord := range pageRecords {
					appendPageContext(pageRecord, "ctx-page-"+pageRecord.Id)
				}
			}
			continue
		}

		if pageID != "" {
			pageRecord, err := app.FindRecordById(collections.Pages, pageID)
			if err != nil {
				app.Logger().Error("[chat/reader_sidebar] failed to resolve page to upload",
					"page_id", pageID, "error", err)
				continue
			}
			appendPageContext(pageRecord, "ctx-page-"+pageID)
			continue
		}

		if uploadID != "" {
			pageRecords, pageErr := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId}",
				"page",
				0,
				0,
				dbx.Params{"uploadId": uploadID},
			)
			if pageErr != nil {
				app.Logger().Warn("[chat/reader_sidebar] failed to resolve upload context pages", "upload_id", uploadID, "error", pageErr)
				continue
			}
			for _, pageRecord := range pageRecords {
				appendPageContext(pageRecord, "ctx-page-"+pageRecord.Id)
			}
		}
	}

	return contexts, nil
}

func ReadPageMarkdown(app *pocketbase.PocketBase, pageRecord *core.Record) (string, error) {
	filename := pageRecord.GetString("markdown")
	if filename == "" {
		return "", fmt.Errorf("page markdown file is empty")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", fmt.Errorf("failed to create filesystem: %w", err)
	}
	defer fsys.Close()

	filePath := pageRecord.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read markdown from storage: %w", err)
	}
	defer blob.Close()

	content, err := io.ReadAll(blob)
	if err != nil {
		return "", fmt.Errorf("failed to read markdown bytes: %w", err)
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

	summaryRecord, err := app.FindFirstRecordByFilter(
		collections.Summaries,
		"user = {:userId} && source_page = {:sourcePage}",
		dbx.Params{"userId": userID, "sourcePage": sourcePageRecord.Id},
	)

	if err == nil {
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
		summaryUploadRecord.Set("status", "SUCCESS")
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

		summaryRecord.Set("status", "success")
		if saveErr := app.Save(summaryRecord); saveErr != nil {
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
	summaryUploadRecord.Set("status", "SUCCESS")
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
	newSummaryRecord.Set("source_page", sourcePageRecord.Id)
	newSummaryRecord.Set("summary_upload", summaryUploadRecord.Id)
	newSummaryRecord.Set("summary_page", summaryPageRecord.Id)
	newSummaryRecord.Set("scope", "page")
	newSummaryRecord.Set("status", "success")
	if saveErr := app.Save(newSummaryRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	return newSummaryRecord, summaryUploadRecord, summaryPageRecord, nil
}
