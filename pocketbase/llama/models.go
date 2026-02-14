package llama

type StatusEnum string

const (
	StatusPending   StatusEnum = "PENDING"
	StatusRunning   StatusEnum = "RUNNING"
	StatusCompleted StatusEnum = "COMPLETED"
	StatusFailed    StatusEnum = "FAILED"
	StatusCancelled StatusEnum = "CANCELLED"
)

type ParseRequest struct {
	Tier                 string                  `json:"tier"`
	Version              string                  `json:"version"`
	Languages            []string                `json:"languages,omitempty"`
	OutputOptions        *OutputOptions          `json:"output_options,omitempty"`
	ProcessingOptions    *ProcessingOptions      `json:"processing_options,omitempty"`
	SourceURL            string                  `json:"source_url"`
	WebhookConfiguration *[]WebhookConfiguration `json:"webhook_configurations,omitempty"`
}

type OutputOptions struct {
	Markdown *MarkdownOptions `json:"markdown,omitempty"`
}

type MarkdownOptions struct {
	AnnotateLinks bool `json:"annotate_links,omitempty"`
}

type ProcessingOptions struct {
	Ignore *IgnoreOptions `json:"ignore,omitempty"`
}

type IgnoreOptions struct {
	IgnoreDiagonalText bool `json:"ignore_diagonal_text,omitempty"`
	IgnoreTextInImage  bool `json:"ignore_text_in_image,omitempty"`
	IgnoreHiddenText   bool `json:"ignore_hidden_text,omitempty"`
}

type ParseResponse struct {
	CreatedAt    string     `json:"created_at,omitempty"`
	ID           string     `json:"id,omitempty"`
	ProjectId    string     `json:"project_id,omitempty"`
	Status       StatusEnum `json:"status,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
}

type Page struct {
	PageNumber int    `json:"page_number"`
	Markdown   string `json:"markdown"`
	Success    bool   `json:"success"`
}

type MarkdownResult struct {
	Pages []Page `json:"pages"`
}

type ParseJobResponse struct {
	Job      ParseResponse  `json:"job"`
	Markdown MarkdownResult `json:"markdown,omitempty"`
}

type WebhookConfiguration struct {
	WebhookURL          string            `json:"webhook_url"`
	WebhookHeaders      map[string]string `json:"webhook_headers,omitempty"`
	WebhookEvents       []string          `json:"webhook_events,omitempty"`
	WebhookOutputFormat string            `json:"webhook_output_format,omitempty"`
}

type UploadFileFromURLRequest struct {
	Url             string `json:"url"`
	Name            string `json:"name,omitempty"`
	ExternalFileID  string `json:"external_file_id,omitempty"`
	FollowRedirects bool   `json:"follow_redirects"`
	VerifySsl       bool   `json:"verify_ssl"`
}

type UploadFileFromURLResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ProjectId string `json:"project_id"`
	CreatedAt string `json:"created_at"`
}

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

type NodeMetadata struct {
	UploadID       string `json:"upload_id,omitempty"`
	ExternalFileID string `json:"external_file_id,omitempty"`
	Title          string `json:"title,omitempty"`
	PageNumber     *int   `json:"page_number,omitempty"`
	PageLabel      *int   `json:"page_label,omitempty"`
	StartCharIdx   *int   `json:"start_char_idx,omitempty"`
	EndCharIdx     *int   `json:"end_char_idx,omitempty"`
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
	Nodes []retrieveRawNodeWithScore `json:"nodes"`
}

type retrieveRawNodeWithScore struct {
	Node  retrieveRawNode `json:"node"`
	Score float64         `json:"score"`
}

type retrieveRawNode struct {
	ID_      string        `json:"id_"`
	Text     string        `json:"text"`
	Metadata *NodeMetadata `json:"metadata"`
}
