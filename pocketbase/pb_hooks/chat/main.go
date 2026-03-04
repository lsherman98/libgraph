package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

type pageSummarizePayload struct {
	PageID       string `json:"page_id"`
	UserID       string `json:"user_id"`
	UploadID     string `json:"upload_id,omitempty"`
	FullDocument bool   `json:"full_document,omitempty"`
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
			body := ChatRequest{}
			if err := e.BindBody(&body); err != nil {
				app.Logger().Error("[chat] failed to bind request body", "error", err)
				return e.BadRequestError("invalid request body", err)
			}

			if body.Message == "" {
				return e.BadRequestError("message is required", nil)
			}

			userID := e.Auth.Id

			if body.Mode == "" {
				body.Mode = "chat"
			}

			var uploadIDs []string
			if body.Filters != nil {
				uploadIDs = resolveFilterUploadIDs(app, body.Filters)
			}

			chatID := body.ChatID
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
				chatProxy, _ := pbgen.WrapRecord[pbgen.Chats](chatRecord)
				if chatProxy != nil {
					chatProxy.SetTitle(title)
				} else {
					chatRecord.Set("title", title)
				}
				chatRecord.Set("user", userID)
				if chatProxy != nil {
					if chatType, ok := chatTypeFromMode(body.Mode); ok {
						chatProxy.SetType(chatType)
					} else {
						chatRecord.Set("type", body.Mode)
					}
				} else {
					chatRecord.Set("type", body.Mode)
				}
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
					app.Logger().Error("[chat/search] vector search failed", "error", err)
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

			searchResults, err := vector_search.Search(app, body.Message, uploadIDs, 10)
			if err != nil {
				app.Logger().Error("[chat] vector search failed", "error", err)
				searchResults = nil
			}

			systemPrompt := buildPromptWithContext(searchResults)

			history, err := loadChatHistory(app, chatID)
			if err != nil {
				app.Logger().Error("[chat] failed to load chat history", "error", err)
				return e.InternalServerError("failed to load chat history", err)
			}

			modelName := os.Getenv("GEMINI_MODEL")
			if modelName == "" {
				modelName = "gemini-2.5-flash"
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
				app.Logger().Error("[chat] Gemini request failed", "error", err)
				return e.InternalServerError("chat request failed", err)
			}

			responseText := extractResponseText(resp)
			var structured StructuredChatResponse
			if err := json.Unmarshal([]byte(responseText), &structured); err != nil {
				app.Logger().Error("[chat] failed to parse Gemini JSON response", "error", err, "raw", responseText)
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
			pageProxy, _ := pbgen.WrapRecord[pbgen.Pages](pageRecord)

			pageUserID := pageRecord.GetString("user")
			if pageProxy != nil {
				pageUserID = pageProxy.GetString("user")
			}
			if pageUserID != userID {
				return e.NotFoundError("page not found", nil)
			}
			pageUploadID := pageRecord.GetString("upload")
			if pageProxy != nil {
				pageUploadID = pageProxy.GetString("upload")
			}

			uploadRecord, err := app.FindRecordById(collections.Uploads, pageUploadID)
			if err != nil {
				return e.NotFoundError("upload not found", err)
			}
			uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
			uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
			if uploadProxy != nil {
				uploadType = strings.TrimSpace(uploadProxy.GetString("type"))
			}
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
				Priority:    80,
				MaxAttempts: 5,
				UserID:      userID,
				UploadID:    pageUploadID,
				PageID:      pageID,
			}); err != nil {
				app.Logger().Error("[summarize] failed to enqueue page summary", "pageId", pageID, "error", err)
				return e.InternalServerError("failed to enqueue summary", err)
			}

			return e.JSON(http.StatusAccepted, PageSummaryQueuedResponse{
				Status:    "queued",
				PageID:    pageID,
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

	if strings.TrimSpace(payload.PageID) == "" || strings.TrimSpace(payload.UserID) == "" {
		return fmt.Errorf("payload page_id and user_id are required")
	}

	pageRecord, err := app.FindRecordById(collections.Pages, payload.PageID)
	if err != nil {
		return err
	}
	pageProxy, _ := pbgen.WrapRecord[pbgen.Pages](pageRecord)
	uploadID := strings.TrimSpace(pageRecord.GetString("upload"))
	if pageProxy != nil {
		uploadID = strings.TrimSpace(pageProxy.GetString("upload"))
	}
	if uploadID == "" {
		return fmt.Errorf("page %s missing upload relation", payload.PageID)
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}
	uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
	uploadType := strings.TrimSpace(uploadRecord.GetString("type"))
	if uploadProxy != nil {
		uploadType = strings.TrimSpace(uploadProxy.GetString("type"))
	}
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
	if pageProxy != nil {
		pageUserID = pageProxy.GetString("user")
	}
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
			if pageProxy != nil {
				uploadID = strings.TrimSpace(pageProxy.GetString("upload"))
			}
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
		msgProxy, _ := pbgen.WrapRecord[pbgen.Messages](r)
		role := r.GetString("role")
		content := r.GetString("content")
		if msgProxy != nil {
			role = messageRoleToString(msgProxy.Role())
			content = msgProxy.Content()
		}
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
	messageProxy, _ := pbgen.WrapRecord[pbgen.Messages](record)
	record.Set("chat", chatID)
	record.Set("user", userID)
	if messageProxy != nil {
		if parsedRole, ok := messageRoleFromString(role); ok {
			messageProxy.SetRole(parsedRole)
		} else {
			record.Set("role", role)
		}
		messageProxy.SetContent(content)
	} else {
		record.Set("role", role)
		record.Set("content", content)
	}

	if sources != nil {
		sourcesJSON, err := json.Marshal(sources)
		if err != nil {
			return "", err
		}
		if messageProxy != nil {
			messageProxy.SetSources(string(sourcesJSON))
		} else {
			record.Set("sources", string(sourcesJSON))
		}
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

func ReadPageMarkdown(app *pocketbase.PocketBase, pageRecord *core.Record) (string, error) {
	filename := pageRecord.GetString("markdown")
	if pageProxy, err := pbgen.WrapRecord[pbgen.Pages](pageRecord); err == nil {
		filename = pageProxy.Markdown()
	}
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

// GenerateDocumentSummary summarises a full document (all pages concatenated).
func GenerateDocumentSummary(allMarkdown string) (string, error) {
	trimmed := strings.TrimSpace(allMarkdown)
	if trimmed == "" {
		return "", fmt.Errorf("document content is empty")
	}

	// Truncate to ~100k chars to stay within model context limits.
	const maxChars = 100_000
	if len(trimmed) > maxChars {
		trimmed = trimmed[:maxChars]
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-2.5-flash"
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
	sourcePageProxy, _ := pbgen.WrapRecord[pbgen.Pages](sourcePageRecord)
	sourceUploadID := sourcePageRecord.GetString("upload")
	if sourcePageProxy != nil {
		sourceUploadID = sourcePageProxy.GetString("upload")
	}
	if strings.TrimSpace(sourceUploadID) == "" {
		return nil, nil, nil, fmt.Errorf("source page missing upload relation")
	}

	sourceUploadRecord, err := app.FindRecordById(collections.Uploads, sourceUploadID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to load source upload: %w", err)
	}
	sourceUploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](sourceUploadRecord)

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
	if sourceUploadProxy != nil {
		baseTitle = strings.TrimSpace(sourceUploadProxy.Title())
	}
	if baseTitle == "" {
		baseTitle = "Untitled"
	}
	pageNumber := sourcePageRecord.GetInt("page")
	if sourcePageProxy != nil {
		pageNumber = int(sourcePageProxy.Page())
	}
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
		summaryProxy, _ := pbgen.WrapRecord[pbgen.Summaries](summaryRecord)
		summaryUploadID := summaryRecord.GetString("summary_upload")
		summaryPageID := summaryRecord.GetString("summary_page")
		if summaryProxy != nil {
			summaryUploadID = summaryProxy.GetString("summary_upload")
			summaryPageID = summaryProxy.GetString("summary_page")
		}

		summaryUploadRecord, uploadErr := app.FindRecordById(collections.Uploads, summaryUploadID)
		if uploadErr != nil {
			return nil, nil, nil, uploadErr
		}
		summaryUploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](summaryUploadRecord)
		summaryPageRecord, pageErr := app.FindRecordById(collections.Pages, summaryPageID)
		if pageErr != nil {
			return nil, nil, nil, pageErr
		}
		summaryPageProxy, _ := pbgen.WrapRecord[pbgen.Pages](summaryPageRecord)

		summaryUploadFile, fileErr := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
		if fileErr != nil {
			return nil, nil, nil, fileErr
		}

		if summaryUploadProxy != nil {
			summaryUploadProxy.SetTitle(summaryTitle)
			summaryUploadRecord.Set("file", summaryUploadFile)
			summaryUploadProxy.SetStatus(pbgen.SUCCESS)
			summaryUploadProxy.SetNumPages(1)
			summaryUploadProxy.SetType(pbgen.Summary)
		} else {
			summaryUploadRecord.Set("title", summaryTitle)
			summaryUploadRecord.Set("file", summaryUploadFile)
			summaryUploadRecord.Set("status", "SUCCESS")
			summaryUploadRecord.Set("num_pages", 1)
			summaryUploadRecord.Set("type", "summary")
		}
		if saveErr := app.Save(summaryUploadRecord); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		summaryPageFile, fileErr := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
		if fileErr != nil {
			return nil, nil, nil, fileErr
		}

		if summaryPageProxy != nil {
			summaryPageProxy.SetMarkdown(summaryPageFile.Name)
			summaryPageRecord.Set("markdown", summaryPageFile)
		} else {
			summaryPageRecord.Set("markdown", summaryPageFile)
		}
		if saveErr := app.Save(summaryPageRecord); saveErr != nil {
			return nil, nil, nil, saveErr
		}

		if summaryProxy != nil {
			summaryProxy.SetStatus(pbgen.Success)
			summaryProxy.SetError("")
		} else {
			summaryRecord.Set("status", "success")
			summaryRecord.Set("error", "")
		}
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
	summaryUploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](summaryUploadRecord)
	if summaryUploadProxy != nil {
		summaryUploadProxy.SetTitle(summaryTitle)
	} else {
		summaryUploadRecord.Set("title", summaryTitle)
	}
	summaryUploadRecord.Set("file", summaryUploadFile)
	if sourceUploadProxy != nil && summaryUploadProxy != nil {
		summaryUploadProxy.SetType(pbgen.Summary)
		summaryUploadProxy.SetStatus(pbgen.SUCCESS)
		summaryUploadProxy.SetNumPages(1)
	} else {
		summaryUploadRecord.Set("type", "summary")
		summaryUploadRecord.Set("status", "SUCCESS")
		summaryUploadRecord.Set("num_pages", 1)
	}
	summaryUploadRecord.Set("user", userID)
	if saveErr := app.Save(summaryUploadRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	summaryPageFile, err := filesystem.NewFileFromBytes([]byte(summaryMarkdown), summaryFilename)
	if err != nil {
		return nil, nil, nil, err
	}

	summaryPageRecord := core.NewRecord(pagesCollection)
	summaryPageProxy, _ := pbgen.WrapRecord[pbgen.Pages](summaryPageRecord)
	summaryPageRecord.Set("upload", summaryUploadRecord.Id)
	if summaryPageProxy != nil {
		summaryPageProxy.SetPage(1)
	} else {
		summaryPageRecord.Set("page", 1)
	}
	summaryPageRecord.Set("user", userID)
	summaryPageRecord.Set("markdown", summaryPageFile)
	if saveErr := app.Save(summaryPageRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	newSummaryRecord := core.NewRecord(summariesCollection)
	newSummaryProxy, _ := pbgen.WrapRecord[pbgen.Summaries](newSummaryRecord)
	newSummaryRecord.Set("user", userID)
	newSummaryRecord.Set("source_upload", sourceUploadID)
	newSummaryRecord.Set("source_page", sourcePageRecord.Id)
	newSummaryRecord.Set("summary_upload", summaryUploadRecord.Id)
	newSummaryRecord.Set("summary_page", summaryPageRecord.Id)
	if newSummaryProxy != nil {
		newSummaryProxy.SetScope(pbgen.Page)
		newSummaryProxy.SetStatus(pbgen.Success)
		newSummaryProxy.SetError("")
	} else {
		newSummaryRecord.Set("scope", "page")
		newSummaryRecord.Set("status", "success")
		newSummaryRecord.Set("error", "")
	}
	if saveErr := app.Save(newSummaryRecord); saveErr != nil {
		return nil, nil, nil, saveErr
	}

	return newSummaryRecord, summaryUploadRecord, summaryPageRecord, nil
}

func chatTypeFromMode(mode string) (pbgen.TypeSelectType6, bool) {
	switch mode {
	case "search":
		return pbgen.Search, true
	case "chat":
		return pbgen.Chat, true
	default:
		return 0, false
	}
}

func messageRoleFromString(role string) (pbgen.RoleSelectType, bool) {
	switch role {
	case "user":
		return pbgen.User, true
	case "assistant":
		return pbgen.Assistant, true
	default:
		return 0, false
	}
}

func messageRoleToString(role pbgen.RoleSelectType) string {
	switch role {
	case pbgen.Assistant:
		return "assistant"
	default:
		return "user"
	}
}
