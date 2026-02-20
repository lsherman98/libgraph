package llama

import (
	"encoding/json"
	"strconv"
	"strings"
)

type UploadFileContentResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ProjectId string `json:"project_id"`
	CreatedAt string `json:"created_at"`
}

type PipelineFile struct {
	FileID         string                 `json:"file_id"`
	CustomMetadata map[string]interface{} `json:"custom_metadata,omitempty"`
}

type PipelineFileResponse struct {
	FileID     string `json:"file_id"`
	PipelineID string `json:"pipeline_id"`
	Status     string `json:"status"`
}

type AddFilesToPipelineResponse []PipelineFileResponse

type ChatRequestBody struct {
	ClassName string    `json:"class_name"`
	Data      ChatData  `json:"data"`
	Messages  []Message `json:"messages"`
}

type ChatData struct {
	ClassName           string              `json:"class_name"`
	LLMParameters       LLMParameters       `json:"llm_parameters"`
	RetrievalParameters RetrievalParameters `json:"retrieval_parameters"`
}

type LLMParameters struct {
	ClassName                  string  `json:"class_name"`
	ModelName                  string  `json:"model_name"`
	SystemPrompt               string  `json:"system_prompt,omitempty"`
	Temperature                float64 `json:"temperature"`
	UseChainOfThoughtReasoning bool    `json:"use_chain_of_thought_reasoning,omitempty"`
	UseCitation                bool    `json:"use_citation"`
}

type RetrievalParameters struct {
	ClassName                    string                 `json:"class_name"`
	Alpha                        *float64               `json:"alpha,omitempty"`
	DenseSimilarityCutoff        *float64               `json:"dense_similarity_cutoff,omitempty"`
	DenseSimilarityTopK          *int                   `json:"dense_similarity_top_k,omitempty"`
	EnableReranking              *bool                  `json:"enable_reranking,omitempty"`
	FilesTopK                    *int                   `json:"files_top_k,omitempty"`
	RerankTopN                   *int                   `json:"rerank_top_n,omitempty"`
	RetrievalMode                string                 `json:"retrieval_mode"`
	RetrievePageFigureNodes      *bool                  `json:"retrieve_page_figure_nodes,omitempty"`
	RetrievePageScreenshotNodes  *bool                  `json:"retrieve_page_screenshot_nodes,omitempty"`
	SearchFilters                *SearchFilters         `json:"search_filters,omitempty"`
	SearchFiltersInferenceSchema map[string]interface{} `json:"search_filters_inference_schema,omitempty"`
	SparseSimilarityTopK         *int                   `json:"sparse_similarity_top_k,omitempty"`
}

type SearchFilters struct {
	Condition string         `json:"condition"`
	Filters   []SearchFilter `json:"filters"`
}

type SearchFilter struct {
	Key      string      `json:"key"`
	Operator string      `json:"operator"`
	Value    interface{} `json:"value"`
}

type Message struct {
	ClassName string `json:"class_name"`
	Content   string `json:"content"`
	Role      string `json:"role"`
	ID        string `json:"id,omitempty"`
}

type ChatResponse struct {
	Response string     `json:"response"`
	Nodes    []NodeInfo `json:"nodes,omitempty"`
}

// FlexInt handles JSON values that may be a number or a numeric string (e.g. "5" or 5).
type FlexInt struct {
	Value int
	Set   bool
}

func (f *FlexInt) UnmarshalJSON(data []byte) error {
	f.Set = true
	// Try as number first.
	var n int
	if err := json.Unmarshal(data, &n); err == nil {
		f.Value = n
		return nil
	}
	// Try as quoted string.
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		parsed, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			f.Set = false
			return nil // non-numeric label like "iv" – just skip
		}
		f.Value = parsed
		return nil
	}
	f.Set = false
	return nil
}

type NodeMetadata struct {
	UploadID       string   `json:"upload_id,omitempty"`
	ExternalFileID string   `json:"external_file_id,omitempty"`
	Title          string   `json:"title,omitempty"`
	PageNumber     *FlexInt `json:"page_number,omitempty"`
	PageLabel      *FlexInt `json:"page_label,omitempty"`
	PageNum        *FlexInt `json:"page_num,omitempty"`
	StartCharIdx   *int     `json:"start_char_idx,omitempty"`
	EndCharIdx     *int     `json:"end_char_idx,omitempty"`
}

type NodeInfo struct {
	ID       string        `json:"id,omitempty"`
	Text     string        `json:"text,omitempty"`
	Metadata *NodeMetadata `json:"metadata,omitempty"`
	Score    float64       `json:"score,omitempty"`
}

type RetrieveRequestBody struct {
	ClassName                    string                 `json:"class_name"`
	Query                        string                 `json:"query"`
	Alpha                        *float64               `json:"alpha,omitempty"`
	DenseSimilarityCutoff        *float64               `json:"dense_similarity_cutoff,omitempty"`
	DenseSimilarityTopK          *int                   `json:"dense_similarity_top_k,omitempty"`
	EnableReranking              *bool                  `json:"enable_reranking,omitempty"`
	FilesTopK                    *int                   `json:"files_top_k,omitempty"`
	RerankTopN                   *int                   `json:"rerank_top_n,omitempty"`
	RetrievalMode                string                 `json:"retrieval_mode,omitempty"`
	RetrievePageFigureNodes      *bool                  `json:"retrieve_page_figure_nodes,omitempty"`
	RetrievePageScreenshotNodes  *bool                  `json:"retrieve_page_screenshot_nodes,omitempty"`
	SearchFilters                *SearchFilters         `json:"search_filters,omitempty"`
	SearchFiltersInferenceSchema map[string]interface{} `json:"search_filters_inference_schema,omitempty"`
	SparseSimilarityTopK         *int                   `json:"sparse_similarity_top_k,omitempty"`
}

type RetrieveResponse struct {
	Nodes []NodeInfo
}

type retrieveRawResponse struct {
	Nodes []retrieveRawNodeWithScore `json:"retrieval_nodes"`
}

type retrieveRawNodeWithScore struct {
	Node  retrieveRawNode `json:"node"`
	Score float64         `json:"score"`
}

type retrieveRawNode struct {
	ID_      string        `json:"id_"`
	Text     string        `json:"text"`
	Metadata *NodeMetadata `json:"extra_info"`
}
