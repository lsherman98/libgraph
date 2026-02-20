package vector_search

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
)

type SearchResult struct {
	ChunkID    string  `json:"chunk_id"`
	Content    string  `json:"content"`
	UploadID   string  `json:"upload_id"`
	PageNumber int     `json:"page_number"`
	ChunkIndex int     `json:"chunk_index"`
	Distance   float64 `json:"distance"`
	Title      string  `json:"title"`
}

type asyncBatchEmbedRequest struct {
	Batch batchEmbedJobConfig `json:"batch"`
}

type batchEmbedJobConfig struct {
	DisplayName string                  `json:"displayName"`
	InputConfig inputEmbedContentConfig `json:"inputConfig"`
}

type inputEmbedContentConfig struct {
	Requests *inlinedEmbedContentRequests `json:"requests,omitempty"`
}

type inlinedEmbedContentRequests struct {
	Requests []inlinedEmbedContentRequest `json:"requests"`
}

type inlinedEmbedContentRequest struct {
	Request  restEmbedContentRequest `json:"request"`
	Metadata map[string]any          `json:"metadata,omitempty"`
}

type restEmbedContentRequest struct {
	Model    string      `json:"model"`
	Content  restContent `json:"content"`
	TaskType string      `json:"taskType,omitempty"`
	Title    string      `json:"title,omitempty"`
}

type restContent struct {
	Parts []restPart `json:"parts"`
}

type restPart struct {
	Text string `json:"text"`
}

type batchOperation struct {
	Name     string          `json:"name"`
	Done     bool            `json:"done"`
	Error    *rpcStatus      `json:"error,omitempty"`
	Response json.RawMessage `json:"response,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`

	State      string                   `json:"state,omitempty"`
	Output     *embedContentBatchOutput `json:"output,omitempty"`
	BatchStats *batchStats              `json:"batchStats,omitempty"`
}

type rpcStatus struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type embedContentBatchResult struct {
	Model      string                   `json:"model"`
	Name       string                   `json:"name"`
	State      string                   `json:"state"`
	Output     *embedContentBatchOutput `json:"output,omitempty"`
	BatchStats *batchStats              `json:"batchStats,omitempty"`
	RawDebug   string                   `json:"-"`
}

type embedContentBatchOutput struct {
	RawInlined    json.RawMessage `json:"inlinedResponses,omitempty"`
	ResponsesFile string          `json:"responsesFile,omitempty"`
}

type inlinedEmbedContentResponse struct {
	Response *restEmbedContentResponse `json:"response,omitempty"`
	Error    *rpcStatus                `json:"error,omitempty"`
}

type restEmbedContentResponse struct {
	Embedding *restContentEmbedding `json:"embedding,omitempty"`
}

type restContentEmbedding struct {
	Values []float32 `json:"values"`
}

type batchStats struct {
	RequestCount           string `json:"requestCount"`
	SuccessfulRequestCount string `json:"successfulRequestCount"`
	FailedRequestCount     string `json:"failedRequestCount"`
	PendingRequestCount    string `json:"pendingRequestCount"`
}

type chunkRecord struct {
	Record   *core.Record
	Content  string
	Title    string
	UploadID string
}
