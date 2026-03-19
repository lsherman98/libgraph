package vars

const (
	UploadTypeBook    = "book"
	UploadTypeSummary = "summary"

	UploadStatusPending    = "PENDING"
	UploadStatusProcessing = "PROCESSING"
	UploadStatusFailed     = "FAILED"
	UploadStatusSuccess    = "SUCCESS"

	QueueStatusQueued     = "queued"
	QueueStatusRunning    = "running"
	QueueStatusSuccess    = "success"
	QueueStatusSucceeded  = QueueStatusSuccess
	QueueStatusFailed     = "failed"
	QueueStatusDeadletter = QueueStatusFailed
	QueueStatusCancelled  = "cancelled"

	EmbeddingStatusQueued    = "queued"
	EmbeddingStatusSubmitted = "submitted"
	EmbeddingStatusPolling   = "polling"
	EmbeddingStatusSucceeded = "succeeded"
	EmbeddingStatusFailing   = "failing"
	EmbeddingStatusCancelled = "cancelled"

	ChatTypeSearch = "search"
	ChatTypeChat   = "chat"

	MessageRoleUser      = "user"
	MessageRoleAssistant = "assistant"
)
