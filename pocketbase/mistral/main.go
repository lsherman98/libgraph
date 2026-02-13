package mistral

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	baseURL            = "https://api.mistral.ai"
	transcriptionModel = "voxtral-mini-latest"
)

// audioExtensions lists file extensions considered audio files.
var audioExtensions = map[string]bool{
	".mp3":  true,
	".wav":  true,
	".m4a":  true,
	".ogg":  true,
	".flac": true,
	".aac":  true,
	".wma":  true,
	".webm": true,
	".mp4":  true,
}

// IsAudioFile returns true if the filename has an audio extension.
func IsAudioFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return audioExtensions[ext]
}

// Client wraps the Mistral API.
type Client struct {
	HTTPClient *http.Client
	APIKey     string
	App        *pocketbase.PocketBase
}

// New creates a new Mistral client, reading the API key from environment.
func New(app *pocketbase.PocketBase) (*Client, error) {
	apiKey := os.Getenv("MISTRAL_API_KEY")
	if apiKey == "" {
		slog.Error("[mistral] MISTRAL_API_KEY environment variable is not set")
		return nil, errors.New("MISTRAL_API_KEY environment variable is required")
	}

	slog.Info("[mistral] client initialized successfully")
	return &Client{
		HTTPClient: http.DefaultClient,
		APIKey:     apiKey,
		App:        app,
	}, nil
}

// Transcribe sends an audio file to the Mistral transcription API with diarization enabled.
// It reads the file bytes from PocketBase's filesystem and posts them as multipart form data.
func (c *Client) Transcribe(upload *core.Record) (*TranscriptionResponse, error) {
	start := time.Now()
	uploadID := upload.Id
	slog.Info("[mistral] starting transcription", "uploadID", uploadID)

	// Get the file content from PocketBase storage
	filename := upload.GetString("file")
	if filename == "" {
		slog.Error("[mistral] upload record has no file", "uploadID", uploadID)
		return nil, errors.New("upload record has no file")
	}
	slog.Info("[mistral] processing file", "uploadID", uploadID, "filename", filename)

	fsys, err := c.App.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("failed to create filesystem: %w", err)
	}
	defer fsys.Close()

	filePath := upload.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get file from storage: %w", err)
	}
	defer blob.Close()

	fileBytes, err := io.ReadAll(blob)
	if err != nil {
		return nil, fmt.Errorf("failed to read file bytes: %w", err)
	}

	// Build multipart form
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// Add the file
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(fileBytes); err != nil {
		return nil, fmt.Errorf("failed to write file bytes: %w", err)
	}

	// Add model
	if err := writer.WriteField("model", transcriptionModel); err != nil {
		return nil, fmt.Errorf("failed to write model field: %w", err)
	}

	// Enable diarization
	if err := writer.WriteField("diarize", "true"); err != nil {
		return nil, fmt.Errorf("failed to write diarize field: %w", err)
	}

	// Request segment-level timestamps for diarization (speaker_id is on segments, not words)
	if err := writer.WriteField("timestamp_granularities", "segment"); err != nil {
		return nil, fmt.Errorf("failed to write timestamp_granularities field: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Build request
	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/audio/transcriptions", &body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Execute
	slog.Info("[mistral] sending transcription request to API", "uploadID", uploadID, "model", transcriptionModel)
	apiStart := time.Now()
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		slog.Error("[mistral] transcription request failed", "uploadID", uploadID, "error", err)
		return nil, fmt.Errorf("transcription request failed: %w", err)
	}
	defer resp.Body.Close()
	apiDuration := time.Since(apiStart)
	slog.Info("[mistral] received API response", "uploadID", uploadID, "status", resp.StatusCode, "apiDuration", apiDuration)

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Log the raw response for debugging
	slog.Info("[mistral] raw API response body", "uploadID", uploadID, "status", resp.StatusCode, "bodyLength", len(respBody), "body", string(respBody))

	if resp.StatusCode != http.StatusOK {
		slog.Error("[mistral] API returned non-OK status", "uploadID", uploadID, "status", resp.StatusCode, "body", string(respBody))
		return nil, fmt.Errorf("mistral transcription API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result TranscriptionResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		slog.Error("[mistral] failed to decode response", "uploadID", uploadID, "error", err)
		return nil, fmt.Errorf("failed to decode transcription response: %w", err)
	}

	totalDuration := time.Since(start)
	segmentCount := len(result.Segments)
	var audioDuration float64
	if result.Usage != nil {
		audioDuration = result.Usage.PromptAudioSeconds
	}
	slog.Info("[mistral] transcription completed",
		"uploadID", uploadID,
		"audioDuration", audioDuration,
		"segmentCount", segmentCount,
		"textLength", len(result.Text),
		"apiDuration", apiDuration,
		"totalDuration", totalDuration,
	)

	return &result, nil
}

// GroupSegmentsBySpeaker takes segment-level results with speaker_id labels and groups
// consecutive segments by the same speaker into DiarizationSegments.
func GroupSegmentsBySpeaker(segs []TranscriptionSegment) []DiarizationSegment {
	if len(segs) == 0 {
		return nil
	}

	var segments []DiarizationSegment
	currentSpeaker := ""
	var current *DiarizationSegment

	for _, s := range segs {
		speaker := "unknown"
		if s.SpeakerID != nil {
			speaker = *s.SpeakerID
		}

		if current == nil || speaker != currentSpeaker {
			// Flush previous segment
			if current != nil {
				current.Text = strings.TrimSpace(current.Text)
				segments = append(segments, *current)
			}
			currentSpeaker = speaker
			current = &DiarizationSegment{
				Speaker: speaker,
				Start:   s.Start,
				End:     s.End,
				Text:    s.Text,
			}
		} else {
			current.End = s.End
			current.Text += " " + s.Text
		}
	}

	if current != nil {
		current.Text = strings.TrimSpace(current.Text)
		segments = append(segments, *current)
	}

	return segments
}

// FormatTranscriptMarkdown converts diarization segments into speaker-labeled markdown.
func FormatTranscriptMarkdown(segments []DiarizationSegment) string {
	if len(segments) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("# Transcript\n\n")

	for _, seg := range segments {
		minutes := int(seg.Start) / 60
		seconds := int(seg.Start) % 60
		sb.WriteString(fmt.Sprintf("**%s** _%d:%02d_\n\n", seg.Speaker, minutes, seconds))
		sb.WriteString(seg.Text + "\n\n")
	}

	return sb.String()
}

// FormatPlainTranscriptMarkdown formats a plain (non-diarized) transcription as markdown.
func FormatPlainTranscriptMarkdown(text string) string {
	var sb strings.Builder
	sb.WriteString("# Transcript\n\n")
	sb.WriteString(text + "\n")
	return sb.String()
}
