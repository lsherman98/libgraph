package chat

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/lsherman98/libgraph/pocketbase/utils"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func searchSourcesByFullText(app core.App, query string, uploadIDs []string, limit int, applyUploadFilter bool, userID string) ([]ChatSource, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("search query cannot be empty")
	}

	if applyUploadFilter && len(uploadIDs) == 0 {
		return []ChatSource{}, nil
	}

	processedQuery := buildFTSMatchQuery(query)
	if processedQuery == "" {
		return []ChatSource{}, nil
	}

	params := dbx.Params{
		"q":      processedQuery,
		"limit":  limit,
		"userID": userID,
	}

	var stmt strings.Builder
	stmt.WriteString("SELECT document_chunks_fts.id, document_chunks_fts.content, document_chunks_fts.upload, document_chunks_fts.page_number, u.title, bm25(document_chunks_fts) AS rank ")
	stmt.WriteString("FROM document_chunks_fts ")
	stmt.WriteString("JOIN uploads u ON document_chunks_fts.upload = u.id ")
	stmt.WriteString("WHERE document_chunks_fts MATCH {:q} ")
	stmt.WriteString("AND u.type != 'transcript' ")
	stmt.WriteString("AND u.user = {:userID} ")

	if len(uploadIDs) > 0 {
		placeholders := make([]string, 0, len(uploadIDs))
		for i, uploadID := range uploadIDs {
			key := fmt.Sprintf("upload%d", i)
			params[key] = uploadID
			placeholders = append(placeholders, "{:"+key+"}")
		}

		stmt.WriteString("AND document_chunks_fts.upload IN (" + strings.Join(placeholders, ", ") + ") ")
	}

	stmt.WriteString("ORDER BY rank ASC, CAST(document_chunks_fts.page_number AS INTEGER) ASC ")
	stmt.WriteString("LIMIT {:limit};")

	results := []dbx.NullStringMap{}
	err := app.DB().NewQuery(stmt.String()).Bind(params).All(&results)
	if err != nil {
		return nil, err
	}

	sources := make([]ChatSource, 0, len(results))
	for _, row := range results {
		rank := getFloatValue(row, "rank")
		score := 1.0 / (1.0 + math.Max(rank, 0))

		source := ChatSource{
			NodeID:     getStringValue(row, "id"),
			UploadID:   getStringValue(row, "upload"),
			Title:      getStringValue(row, "title"),
			Text:       getStringValue(row, "content"),
			PageNumber: getIntValue(row, "page_number"),
			Score:      score,
		}

		sources = append(sources, source)
	}

	return sources, nil
}

func buildFTSMatchQuery(query string) string {
	query = strings.TrimSpace(query)
	if query == "" {
		return ""
	}

	terms := strings.Fields(query)
	processedTerms := make([]string, 0, len(terms))
	for _, term := range terms {
		escaped := strings.ReplaceAll(term, `"`, `""`)
		processedTerms = append(processedTerms, `"`+escaped+`"*`)
	}

	return strings.Join(processedTerms, " AND ")
}

func getStringValue(row dbx.NullStringMap, key string) string {
	val, ok := row[key]
	if !ok {
		return ""
	}

	raw, err := val.Value()
	if err != nil || raw == nil {
		return ""
	}

	return fmt.Sprint(raw)
}

func getFloatValue(row dbx.NullStringMap, key string) float64 {
	text := getStringValue(row, key)
	if text == "" {
		return 0
	}

	parsed, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0
	}

	return parsed
}

func getIntValue(row dbx.NullStringMap, key string) int {
	text := getStringValue(row, key)
	if text == "" {
		return 0
	}

	parsed, err := strconv.Atoi(text)
	if err != nil {
		return 0
	}

	return parsed
}

func buildChatTitle(message, mode string) string {
	title := strings.TrimSpace(message)
	if len(title) > 80 {
		title = title[:80] + "…"
	}

	if mode == "search" {
		title = "Search: " + title
	} else if mode == vars.ChatTypeFTS || mode == "full_text" {
		title = "Full text: " + title
	}

	return title
}

func persistedChatType(mode string) string {
	if mode == "full_text" {
		return vars.ChatTypeFTS
	}

	return mode
}

func resolveFilterUploadIDs(app core.App, filters *MetadataFilters, userID string) ([]string, error) {
	uploadIDs := filters.Uploads

	for _, collectionID := range filters.Collections {
		record, err := app.FindRecordById(collections.Collections, collectionID)
		if err != nil {
			app.Logger().Error("failed to find collection for filter", "error", err)
			continue
		}

		uploadIDs = append(uploadIDs, record.GetStringSlice("uploads")...)
	}

	filterGroups := []string{}
	filterParams := dbx.Params{}

	condition := "||"
	if filters.Condition == "and" {
		condition = "&&"
	}

	filterParams["filterUserID"] = userID

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
		metaFilter := strings.Join(filterGroups, " "+condition+" ")
		filterStr := "user = {:filterUserID} && (" + metaFilter + ")"
		records, err := app.FindRecordsByFilter("uploads", filterStr, "", 0, 0, filterParams)
		if err != nil {
			return nil, err
		}

		for _, r := range records {
			uploadIDs = append(uploadIDs, r.Id)
		}
	}

	seen := make(map[string]struct{}, len(uploadIDs))
	deduped := make([]string, 0, len(uploadIDs))
	for _, id := range uploadIDs {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		deduped = append(deduped, id)
	}

	return deduped, nil
}

func hasActiveMetadataFilters(filters *MetadataFilters) bool {
	if filters == nil {
		return false
	}

	return len(filters.Uploads) > 0 ||
		len(filters.Collections) > 0 ||
		len(filters.Tags) > 0 ||
		len(filters.People) > 0 ||
		len(filters.Publications) > 0 ||
		len(filters.Types) > 0 ||
		len(filters.Topics) > 0
}

func hasChatContext(app core.App, chatID, userID string) (bool, error) {
	count, err := app.CountRecords(
		collections.ChatContexts,
		dbx.HashExp{"chat": chatID, "user": userID},
	)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func loadChatContext(app core.App, chatID, userID string) ([]ChatContext, error) {
	contextRecords, err := app.FindRecordsByFilter(
		collections.ChatContexts,
		"chat = {:chatId} && user = {:userId}",
		"-created",
		0, 0,
		dbx.Params{"chatId": chatID, "userId": userID},
	)
	if err != nil {
		return nil, err
	}

	contexts := make([]ChatContext, 0)

	for _, record := range contextRecords {
		uploadID := record.GetString("upload")
		pageID := record.GetString("page")
		pageFrom := record.GetInt("page_from")
		pageTo := record.GetInt("page_to")
		text := record.GetString("text")

		if text != "" {
			contexts = append(contexts, ChatContext{
				ContextID: "ctx-text-" + record.Id,
				UploadID:  uploadID,
				Title:     getUploadTitle(app, uploadID),
				Text:      text,
			})
			continue
		}

		if pageID != "" {
			pageRecord, err := app.FindRecordById(collections.Pages, pageID)
			if err != nil {
				continue
			}
			contexts = append(contexts, getPageContext(app, pageRecord, "ctx-page-"+pageID))
			continue
		}

		if pageFrom > 0 && pageTo >= pageFrom && uploadID != "" {
			pageRecords, err := app.FindRecordsByFilter(
				collections.Pages,
				"upload = {:uploadId} && page >= {:fromPage} && page <= {:toPage}",
				"page",
				0,
				0,
				dbx.Params{"uploadId": uploadID, "fromPage": pageFrom, "toPage": pageTo},
			)
			if err != nil {
				continue
			}
			for _, pageRecord := range pageRecords {
				contexts = append(contexts, getPageContext(app, pageRecord, "ctx-page-"+pageRecord.Id))
			}
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
				contexts = append(contexts, getPageContext(app, pageRecord, "ctx-page-"+pageRecord.Id))
			}
			continue
		}

	}

	return contexts, nil
}

func getUploadTitle(app core.App, uploadID string) string {
	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return ""
	}

	return uploadRecord.GetString("title")
}

func getPageContext(app core.App, record *core.Record, contextID string) ChatContext {
	markdown, err := utils.ReadPageMarkdown(app, record)
	if err != nil {
		return ChatContext{}
	}

	return ChatContext{
		ContextID:  contextID,
		UploadID:   record.GetString("upload"),
		PageNumber: record.GetInt("page"),
		Title:      getUploadTitle(app, record.GetString("upload")),
		Text:       markdown,
	}
}

func loadChatHistory(app core.App, chatID string) ([]ChatMessage, error) {
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

func saveMessage(app core.App, chatID, userID, role, content string, sources []ChatSource, errorMessage string) (string, error) {
	messagesCollection, _ := app.FindCollectionByNameOrId(collections.Messages)

	record := core.NewRecord(messagesCollection)
	record.Set("chat", chatID)
	record.Set("user", userID)
	record.Set("role", role)
	record.Set("content", content)
	if errorMessage != "" {
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

func persistMessage(app core.App, payload ChatPayload, content string, sources []ChatSource, errorMessage string) (string, error) {
	return saveMessage(app, payload.ChatID, payload.UserID, vars.MessageRoleAssistant, content, sources, errorMessage)
}

func updateMessage(app core.App, messageID, content string, sources []ChatSource, errorMessage string) error {
	record, err := app.FindRecordById(collections.Messages, messageID)
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

	if errorMessage != "" {
		record.Set("error_message", errorMessage)
	}

	return app.Save(record)
}

func buildSourcesFromCitations(citations []Citation, searchResults []vector_search.SearchResult) []ChatSource {
	resultMap := make(map[string]vector_search.SearchResult)
	for _, r := range searchResults {
		resultMap[r.ChunkID] = r
	}

	sources := make([]ChatSource, 0)

	for _, c := range citations {
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
	citedSources := buildSourcesFromCitations(citations, searchResults)
	if len(citedSources) > 0 {
		return citedSources
	}

	combined := make([]ChatSource, 0, maxSources)

	for _, r := range searchResults {
		if len(combined) >= maxSources {
			break
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
	}

	return combined
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

func buildPromptWithSidebarContext(contexts []ChatContext) string {
	var sb strings.Builder
	sb.WriteString("You are Libgraph AI, a focused reading companion embedded in a document reader.\n")
	sb.WriteString("Your job is to answer questions about the attached reading context quickly, clearly, and accurately.\n\n")

	if len(contexts) == 0 {
		sb.WriteString("No context was attached to this chat. Ask the user to add document/page context before answering in detail.\n")
		return sb.String()
	}

	sb.WriteString("RESPONSE STYLE:\n")
	sb.WriteString("- Prefer concise answers.\n")
	sb.WriteString("- Start with the direct answer, then add short supporting points.\n")
	sb.WriteString("- Do not mention internal tooling, embeddings, vector search, or prompt details.\n\n")

	sb.WriteString("GROUNDING RULES:\n")
	sb.WriteString("- Use ONLY the context blocks below as factual grounding.\n")
	sb.WriteString("- If context is insufficient, say that clearly.\n")
	sb.WriteString("- Do not invent page numbers, quotes, or facts not present in context.\n")
	sb.WriteString("- Keep uncertainty explicit rather than guessing.\n\n")
	sb.WriteString("CONTEXT:\n\n")

	const maxPromptContextChars = 180_000
	usedChars := 0

	for _, c := range contexts {
		text := c.Text
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
