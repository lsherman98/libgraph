package vars

const (
	UploadTypeBook    = "book"
	UploadTypeSummary = "summary"

	UploadStatusPending    = "pending"
	UploadStatusProcessing = "processing"
	UploadStatusFailed     = "failed"
	UploadStatusSuccess    = "success"

	QueueStatusQueued    = "queued"
	QueueStatusRunning   = "running"
	QueueStatusSuccess   = "success"
	QueueStatusFailed    = "failed"
	QueueStatusCancelled = "cancelled"

	EmbeddingStatusQueued    = "queued"
	EmbeddingStatusSubmitted = "submitted"
	EmbeddingStatusPolling   = "polling"
	EmbeddingStatusSucceeded = "succeeded"
	EmbeddingStatusFailed    = "failed"

	SummaryStatusProcessing = "processing"
	SummaryStatusFailed     = "failed"
	SummaryStatusSuccess    = "success"

	ChatTypeSearch  = "search"
	ChatTypeChat    = "chat"
	ChatTypeContext = "context_chat"
	ChatTypeFTS     = "fts"

	MessageRoleUser      = "user"
	MessageRoleAssistant = "assistant"
)
