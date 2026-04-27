package chat

type ChatRequest struct {
	Message string           `json:"message"`
	Mode    string           `json:"mode,omitempty"` // "chat", "search", or "context_chat"
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
	ChatID    string       `json:"chat_id"`
	Message   string       `json:"message,omitempty"`
	Sources   []ChatSource `json:"sources,omitempty"`
	MessageID string       `json:"message_id"`
}

type ChatPayload struct {
	ChatID    string           `json:"chat_id"`
	Mode      string           `json:"mode"`
	Message   string           `json:"message"`
	UploadIDs []string         `json:"upload_ids,omitempty"`
	ApplyUploadFilter bool     `json:"apply_upload_filter,omitempty"`
	UserID    string           `json:"user_id"`
	MessageID string           `json:"message_id"`
	Filters   *MetadataFilters `json:"filters,omitempty"`
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

type ChatContext struct {
	ContextID  string
	UploadID   string
	PageNumber int
	Title      string
	Text       string
}
