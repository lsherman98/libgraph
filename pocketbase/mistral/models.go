package mistral

type TranscriptionResponse struct {
	Model    string                 `json:"model"`
	Text     string                 `json:"text"`
	Language *string                `json:"language,omitempty"`
	Segments []TranscriptionSegment `json:"segments,omitempty"`
	Usage    *TranscriptionUsage    `json:"usage,omitempty"`
	Type     string                 `json:"type,omitempty"`
}

type TranscriptionUsage struct {
	PromptAudioSeconds float64 `json:"prompt_audio_seconds"`
	PromptTokens       int     `json:"prompt_tokens"`
	TotalTokens        int     `json:"total_tokens"`
	CompletionTokens   int     `json:"completion_tokens"`
	RequestCount       int     `json:"request_count,omitempty"`
	NumCachedTokens    int     `json:"num_cached_tokens,omitempty"`
}

type TranscriptionSegment struct {
	Text      string  `json:"text"`
	Start     float64 `json:"start"`
	End       float64 `json:"end"`
	SpeakerID *string `json:"speaker_id,omitempty"`
	Type      string  `json:"type,omitempty"`
}

type DiarizationSegment struct {
	Speaker string  `json:"speaker"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Text    string  `json:"text"`
}
