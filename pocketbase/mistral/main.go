package mistral

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	baseURL            = "https://api.mistral.ai"
	transcriptionModel = "voxtral-mini-latest"
)

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

func IsAudioFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return audioExtensions[ext]
}

type Client struct {
	HTTPClient *http.Client
	APIKey     string
	App        *pocketbase.PocketBase
}

func New(app *pocketbase.PocketBase) (*Client, error) {
	apiKey := os.Getenv("MISTRAL_API_KEY")
	if apiKey == "" {
		return nil, errors.New("MISTRAL_API_KEY environment variable is required")
	}

	return &Client{
		HTTPClient: http.DefaultClient,
		APIKey:     apiKey,
		App:        app,
	}, nil
}

func (c *Client) Transcribe(upload *core.Record) (*TranscriptionResponse, error) {
	filename := upload.GetString("file")
	if filename == "" {
		return nil, errors.New("upload record has no file")
	}

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

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(fileBytes); err != nil {
		return nil, fmt.Errorf("failed to write file bytes: %w", err)
	}

	if err := writer.WriteField("model", transcriptionModel); err != nil {
		return nil, fmt.Errorf("failed to write model field: %w", err)
	}

	if err := writer.WriteField("diarize", "true"); err != nil {
		return nil, fmt.Errorf("failed to write diarize field: %w", err)
	}

	if err := writer.WriteField("timestamp_granularities", "segment"); err != nil {
		return nil, fmt.Errorf("failed to write timestamp_granularities field: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/audio/transcriptions", &body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("transcription request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mistral transcription API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result TranscriptionResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to decode transcription response: %w", err)
	}

	return &result, nil
}

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

func FormatTranscriptMarkdown(segments []DiarizationSegment) string {
	if len(segments) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("# Transcript\n\n")

	for _, seg := range segments {
		minutes := int(seg.Start) / 60
		seconds := int(seg.Start) % 60
		fmt.Fprintf(&sb, "**%s** _%d:%02d_\n\n", seg.Speaker, minutes, seconds)
		sb.WriteString(seg.Text + "\n\n")
	}

	return sb.String()
}

func FormatPlainTranscriptMarkdown(text string) string {
	var sb strings.Builder
	sb.WriteString("# Transcript\n\n")
	sb.WriteString(text + "\n")
	return sb.String()
}
