package summarize

type PageSummaryQueuedResponse struct {
	Status    string `json:"status"`
	PageID    string `json:"page_id"`
	DedupeKey string `json:"dedupe_key"`
}

type PageSummaryBatchRequest struct {
	PageIDs []string `json:"page_ids"`
}

type PageSummaryBatchQueuedResponse struct {
	Status    string   `json:"status"`
	PageIDs   []string `json:"page_ids"`
	DedupeKey string   `json:"dedupe_key"`
}

type pageSummarizePayload struct {
	PageID       string   `json:"page_id"`
	PageIDs      []string `json:"page_ids,omitempty"`
	UserID       string   `json:"user_id"`
	UploadID     string   `json:"upload_id,omitempty"`
	FullDocument bool     `json:"full_document,omitempty"`
}
