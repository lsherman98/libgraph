package summarize

type SummaryResponse struct {
	Status    string `json:"status"`
	PageID    string `json:"page_id"`
	DedupeKey string `json:"dedupe_key"`
}

type SummaryBatchRequest struct {
	PageIDs []string `json:"page_ids"`
}

type SummaryBatchResponse struct {
	Status    string   `json:"status"`
	PageIDs   []string `json:"page_ids"`
	DedupeKey string   `json:"dedupe_key"`
}

type SummarizePayload struct {
	PageIDs      []string `json:"page_ids,omitempty"`
	FullDocument bool     `json:"full_document,omitempty"`
}
