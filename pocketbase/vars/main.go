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
	EmbeddingStatusFailing   = "failing"

	ChatTypeSearch = "search"
	ChatTypeChat   = "chat"

	MessageRoleUser      = "user"
	MessageRoleAssistant = "assistant"
)
