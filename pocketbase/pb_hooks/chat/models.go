package chat

type ChatRequest struct {
	Message             string                `json:"message"`
	Mode                string                `json:"mode,omitempty"` // "chat" or "search"
	Filters             *MetadataFilters      `json:"filters,omitempty"`
	History             []ChatMessage         `json:"history,omitempty"`
	LLMParameters       *LLMParametersInput   `json:"llm_parameters,omitempty"`
	RetrievalParameters *RetrievalParamsInput `json:"retrieval_parameters,omitempty"`
}

type LLMParametersInput struct {
	ModelName                  string   `json:"model_name,omitempty"`
	SystemPrompt               string   `json:"system_prompt,omitempty"`
	Temperature                *float64 `json:"temperature,omitempty"`
	UseChainOfThoughtReasoning *bool    `json:"use_chain_of_thought_reasoning,omitempty"`
	UseCitation                *bool    `json:"use_citation,omitempty"`
}

type RetrievalParamsInput struct {
	Alpha                       *float64 `json:"alpha,omitempty"`
	DenseSimilarityCutoff       *float64 `json:"dense_similarity_cutoff,omitempty"`
	DenseSimilarityTopK         *int     `json:"dense_similarity_top_k,omitempty"`
	EnableReranking             *bool    `json:"enable_reranking,omitempty"`
	FilesTopK                   *int     `json:"files_top_k,omitempty"`
	RerankTopN                  *int     `json:"rerank_top_n,omitempty"`
	RetrievalMode               string   `json:"retrieval_mode,omitempty"`
	RetrievePageFigureNodes     *bool    `json:"retrieve_page_figure_nodes,omitempty"`
	RetrievePageScreenshotNodes *bool    `json:"retrieve_page_screenshot_nodes,omitempty"`
	SparseSimilarityTopK        *int     `json:"sparse_similarity_top_k,omitempty"`
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
	Sources []ChatSource `json:"sources,omitempty"`
}

type ChatSource struct {
	UploadID       string  `json:"upload_id,omitempty"`
	ExternalFileID string  `json:"external_file_id,omitempty"`
	NodeID         string  `json:"node_id,omitempty"`
	Title          string  `json:"title,omitempty"`
	Score          float64 `json:"score,omitempty"`
	Text           string  `json:"text,omitempty"`
	PageNumber     int     `json:"page_number,omitempty"`
	StartCharIdx   *int    `json:"start_char_idx,omitempty"`
	EndCharIdx     *int    `json:"end_char_idx,omitempty"`
}
