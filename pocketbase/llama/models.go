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
	FollowRedirects bool   `json:"follow_redirects"`
	VerifySsl       bool   `json:"verify_ssl"`
}

type UploadFileFromURLResponse struct {
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
