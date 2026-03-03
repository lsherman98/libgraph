package chat

type ChatRequest struct {
	Message string           `json:"message"`
	Mode    string           `json:"mode,omitempty"` // "chat" or "search"
	ChatID  string           `json:"chat_id,omitempty"`
	Filters *MetadataFilters `json:"filters,omitempty"`
}

type MetadataFilters struct {
	Condition    string   `json:"condition,omitempty"` // "and" or "or", defaults to "or"
	Tags         []string `json:"tags,omitempty"`
	People       []string `json:"people,omitempty"`
	Publications []string `json:"publications,omitempty"`
	Types        []string `json:"types,omitempty"`
	Topics       []string `json:"topics,omitempty"`
	Uploads      []string `json:"uploads,omitempty"`
	Collections  []string `json:"collections,omitempty"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	ChatID             string       `json:"chat_id"`
	Message            string       `json:"message,omitempty"`
	Sources            []ChatSource `json:"sources,omitempty"`
	UserMessageID      string       `json:"user_message_id"`
	AssistantMessageID string       `json:"assistant_message_id"`
}

type ChatSource struct {
	UploadID   string  `json:"upload_id,omitempty"`
	NodeID     string  `json:"node_id,omitempty"`
	Title      string  `json:"title,omitempty"`
	Score      float64 `json:"score,omitempty"`
	Text       string  `json:"text,omitempty"`
	PageNumber int     `json:"page_number,omitempty"`
}

type StructuredChatResponse struct {
	Answer    string     `json:"answer"`
	Citations []Citation `json:"citations"`
}

type Citation struct {
	ChunkID    string `json:"chunk_id"`
	Quote      string `json:"quote"`
	PageNumber int    `json:"page_number"`
	UploadID   string `json:"upload_id"`
}

type PageSummaryResponse struct {
	SummaryID      string `json:"summary_id"`
	SourcePageID   string `json:"source_page_id"`
	SourceUploadID string `json:"source_upload_id"`
	SummaryUpload  string `json:"summary_upload_id"`
	SummaryPage    string `json:"summary_page_id"`
	UpdatedAt      string `json:"updated_at"`
}

type PageSummaryQueuedResponse struct {
	Status    string `json:"status"`
	PageID    string `json:"page_id"`
	DedupeKey string `json:"dedupe_key"`
}
