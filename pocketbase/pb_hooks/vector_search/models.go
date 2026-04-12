package vector_search

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase/core"
)

const (
	geminiAPIBase   = "https://generativelanguage.googleapis.com/v1beta"
	bulkSize        = 100
	pollInterval    = 300 * time.Second
	embeddingDims   = 3072
	embeddingsTable = collections.DocumentChunksEmbeddings
)

var batchEnabled = false
var errRateLimited = fmt.Errorf("rate limited by Gemini API")

type SearchResult struct {
	ChunkID    string  `json:"chunk_id"`
	Content    string  `json:"content"`
	UploadID   string  `json:"upload_id"`
	PageNumber int     `json:"page_number"`
	ChunkIndex int     `json:"chunk_index"`
	Distance   float64 `json:"distance"`
	Title      string  `json:"title"`
}

type BatchEmbedRequest struct {
	Requests []EmbedContentRequest `json:"requests"`
}

type EmbedContentRequest struct {
	Model    string         `json:"model,omitempty"`
	Content  Content        `json:"content"`
	TaskType string         `json:"taskType,omitempty"`
	Title    string         `json:"title,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type Content struct {
	Parts []Part `json:"parts"`
}

type Part struct {
	Text string `json:"text"`
}

type BatchEmbed struct {
	Name     string          `json:"name"`
	Done     bool            `json:"done"`
	Error    *Status         `json:"error,omitempty"`
	Response json.RawMessage `json:"response,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
	State    string          `json:"state,omitempty"`
	Output   *BatchOutput    `json:"output,omitempty"`
}

type Status struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type BatchEmbedResult struct {
	Model  string       `json:"model"`
	Name   string       `json:"name"`
	State  string       `json:"state"`
	Output *BatchOutput `json:"output,omitempty"`
}

type BatchOutput struct {
	RawInlined    json.RawMessage `json:"inlinedResponses,omitempty"`
	ResponsesFile string          `json:"responsesFile,omitempty"`
}

type EmbedContentResponse struct {
	Embedding *ContentEmbedding `json:"embedding,omitempty"`
	Values    []float32         `json:"values,omitempty"`
	Error     *Status           `json:"error,omitempty"`
}

type BulkEmbedContentResponse struct {
	Embeddings []EmbedContentResponse `json:"embeddings,omitempty"`
	Embedding  *ContentEmbedding      `json:"embedding,omitempty"`
	Error      *Status                `json:"error,omitempty"`
}

type ContentEmbedding struct {
	Values []float32 `json:"values"`
}

type Chunk struct {
	Record   *core.Record
	Content  string
	Title    string
	UploadID string
}

type EmbedPayload struct {
	ChunkIDs       []string `json:"chunk_ids,omitempty"`
	EmbeddingJobID string   `json:"embedding_job_id,omitempty"`
}
