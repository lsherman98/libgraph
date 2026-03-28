package mistral

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	baseURL            = "https://api.mistral.ai"
	transcriptionModel = "voxtral-mini-latest"
	requestInterval    = 3 * time.Second
	maxRetryAttempts   = 3
	retryBaseDelay     = 1 * time.Second
)

var (
	mistralRequestMu     sync.Mutex
	nextMistralRequestAt time.Time
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
	App        core.App
}

func New(app core.App) (*Client, error) {
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
		return nil, err
	}
	defer fsys.Close()

	filePath := upload.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return nil, err
	}
	defer blob.Close()

	fileBytes, err := io.ReadAll(blob)
	if err != nil {
		return nil, err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, err
	}

	if _, err := part.Write(fileBytes); err != nil {
		return nil, err
	}

	if err := writer.WriteField("model", transcriptionModel); err != nil {
		return nil, err
	}

	if err := writer.WriteField("diarize", "true"); err != nil {
		return nil, err
	}

	if err := writer.WriteField("timestamp_granularities", "segment"); err != nil {
		return nil, err
	}

	if err := writer.Close(); err != nil {
		return nil, err
	}

	payload := append([]byte(nil), body.Bytes()...)
	contentType := writer.FormDataContentType()

	var lastErr error

	for attempt := 1; attempt <= maxRetryAttempts; attempt++ {
		waitForNextMistralRequestSlot()

		req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/audio/transcriptions", bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		req.Header.Set("x-api-key", c.APIKey)
		req.Header.Set("Content-Type", contentType)

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if attempt < maxRetryAttempts && isRetryableError(err) {
				time.Sleep(backoffForAttempt(attempt))
				continue
			}
			return nil, err
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			if attempt < maxRetryAttempts {
				time.Sleep(backoffForAttempt(attempt))
				continue
			}
			return nil, lastErr
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = err
			if attempt < maxRetryAttempts && isRetryableStatus(resp.StatusCode) {
				time.Sleep(backoffForAttempt(attempt))
				continue
			}
			return nil, lastErr
		}

		var result TranscriptionResponse
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("failed to decode transcription response: %w", err)
		}

		return &result, nil
	}

	if lastErr != nil {
		return nil, lastErr
	}

	return nil, errors.New("transcription request exhausted retries")
}

func waitForNextMistralRequestSlot() {
	mistralRequestMu.Lock()
	defer mistralRequestMu.Unlock()

	now := time.Now()
	if now.Before(nextMistralRequestAt) {
		time.Sleep(time.Until(nextMistralRequestAt))
	}

	nextMistralRequestAt = time.Now().Add(requestInterval)
}

func isRetryableStatus(statusCode int) bool {
	return statusCode == http.StatusTooManyRequests || statusCode >= http.StatusInternalServerError
}

func isRetryableError(err error) bool {
	var netErr net.Error
	if errors.As(err, &netErr) {
		return netErr.Timeout() || netErr.Temporary()
	}

	return errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF)
}

func backoffForAttempt(attempt int) time.Duration {
	return time.Duration(attempt) * retryBaseDelay
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
