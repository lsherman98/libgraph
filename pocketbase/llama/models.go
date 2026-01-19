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
	Languages            []string                `json:"languages"`
	OutputOptions        *OutputOptions          `json:"output_options,omitempty"`
	ProcessingOptions    *ProcessingOptions      `json:"processing_options,omitempty"`
	SourceURL            string                  `json:"source_url"`
	WebhookConfiguration *[]WebhookConfiguration `json:"webhook_configurations,omitempty"`
}

type OutputOptions struct {
	Markdown     *MarkdownOptions  `json:"markdown,omitempty"`
	ImagesToSave []string          `json:"images_to_save,omitempty"`
	ExportPDF    *ExportPDFOptions `json:"export_pdf,omitempty"`
}

type MarkdownOptions struct {
	AnnotateLinks bool `json:"annotate_links"`
}

type ExportPDFOptions struct {
	Enable bool `json:"enable"`
}

type ProcessingOptions struct {
	Ignore *IgnoreOptions `json:"ignore,omitempty"`
}

type IgnoreOptions struct {
	IgnoreDiagonalText bool `json:"ignore_diagonal_text"`
	IgnoreTextInImage  bool `json:"ignore_text_in_image"`
	IgnoreHiddenText   bool `json:"ignore_hidden_text"`
}

type ParseResponse struct {
	CreatedAt    string     `json:"created_at,omitempty"`
	ID           string     `json:"id,omitempty"`
	ProjectId    string     `json:"project_id,omitempty"`
	Status       StatusEnum `json:"status,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
}

type WebhookConfiguration struct {
	WebhookURL          string            `json:"webhook_url"`
	WebhookHeaders      map[string]string `json:"webhook_headers,omitempty"`
	WebhookEvents       []string          `json:"webhook_events,omitempty"`
	WebhookOutputFormat string            `json:"webhook_output_format,omitempty"`
}
