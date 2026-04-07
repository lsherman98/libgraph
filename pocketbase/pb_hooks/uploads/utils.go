package uploads

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func RecoverStuckUploads(app *pocketbase.PocketBase) {
	stuckUploads, err := app.FindRecordsByFilter(
		collections.Uploads,
		"status = 'processing'",
		"",
		0,
		0,
	)
	if err != nil {
		return
	}

	if len(stuckUploads) == 0 {
		return
	}

	for _, upload := range stuckUploads {
		id := upload.Id
		if err := processing.Enqueue(app, processing.EnqueueRequest{
			JobType:   processing.JobTypeUploadParseOrTranscribe,
			DedupeKey: "upload.parse_or_transcribe:" + id,
			UserID:    upload.GetString("user"),
			UploadID:  id,
		}); err != nil {
			continue
		}
	}
}

func readPageMarkdown(app core.App, page *core.Record) (string, error) {
	filename := page.GetString("markdown")
	if filename == "" {
		return "", fmt.Errorf("page has no markdown file")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()

	filePath := page.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return "", err
	}
	defer blob.Close()

	content, err := io.ReadAll(blob)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

func splitSentences(text string) []string {
	marked := reSentence.ReplaceAllString(text, "${1}\x00")
	parts := strings.Split(marked, "\x00")
	result := []string{}
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}

func chunkMarkdown(markdown string) []string {
	parts := strings.Split(markdown, "\n\n")
	chunks := []string{}
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}

		if len(trimmed) <= maxChunkSize {
			chunks = append(chunks, trimmed)
			continue
		}

		sentences := splitSentences(trimmed)
		current := ""
		for _, s := range sentences {
			if current == "" {
				current = s
			} else if len(current)+1+len(s) <= maxChunkSize {
				current += " " + s
			} else {
				chunks = append(chunks, current)
				current = s
			}
		}

		if current != "" {
			for len(current) > maxChunkSize {
				chunks = append(chunks, current[:maxChunkSize])
				current = current[maxChunkSize:]
			}
			if current != "" {
				chunks = append(chunks, current)
			}
		}
	}

	return chunks
}

func getAudioDuration(filePath string) (float64, error) {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0, err
	}

	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filePath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return 0, err
	}

	durationValue := strings.TrimSpace(string(output))
	if durationValue == "" {
		return 0, fmt.Errorf("ffprobe returned empty duration")
	}

	durationSeconds, err := strconv.ParseFloat(durationValue, 64)
	if err != nil {
		return 0, err
	}

	if durationSeconds <= 0 {
		return 0, fmt.Errorf("audio duration must be greater than 0 seconds")
	}

	return durationSeconds, nil
}

func validateDurationLimit(upload *core.Record) error {
	uploadFile := upload.GetString("file")
	if uploadFile == "" || !mistral.IsAudioFile(uploadFile) {
		return nil
	}

	filePath := upload.BaseFilesPath() + "/" + uploadFile
	durationSeconds, err := getAudioDuration(filePath)
	if err != nil {
		return err
	}

	if durationSeconds > maxTranscriptionDuration {
		return fmt.Errorf("audio duration %.0f minutes exceeds the 60 minute transcription limit", durationSeconds/60)
	}

	return nil
}

func validateTranscript(upload *core.Record) error {
	transcript := upload.GetString("transcript_file")
	if transcript == "" {
		return nil
	}

	uploadFile := upload.GetString("file")
	if !mistral.IsAudioFile(uploadFile) {
		return fmt.Errorf("transcript_file can only be attached to audio uploads")
	}

	ext := strings.ToLower(filepath.Ext(transcript))
	if !transcriptExt[ext] {
		return fmt.Errorf("transcript_file must be a .txt, .md, or .markdown file")
	}

	return nil
}

func scheduleUploadProcessing(app core.App, uploadRecord *core.Record) error {
	uploadID := uploadRecord.Id
	if uploadID == "" || uploadRecord.GetString("type") == vars.UploadTypeSummary {
		return nil
	}

	uploadRecord.Set("status", vars.UploadStatusProcessing)
	if err := app.Save(uploadRecord); err != nil {
		return err
	}

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeUploadParseOrTranscribe,
		DedupeKey: "upload.parse_or_transcribe:" + uploadID,
		UserID:    uploadRecord.GetString("user"),
		UploadID:  uploadID,
	})
}

func optimizeAudioUpload(app core.App, upload *core.Record) (bool, error) {
	source := upload.GetString("file")
	if source == "" {
		return false, fmt.Errorf("upload file is empty")
	}

	if !mistral.IsAudioFile(source) {
		return false, nil
	}

	if isOptimized(source) {
		return false, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return false, err
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return false, err
	}
	defer fsys.Close()

	sourcePath := upload.BaseFilesPath() + "/" + source
	reader, err := fsys.GetReader(sourcePath)
	if err != nil {
		return false, err
	}
	defer reader.Close()

	inputBytes, err := io.ReadAll(reader)
	if err != nil {
		return false, err
	}

	if len(inputBytes) == 0 {
		return false, fmt.Errorf("source audio file is empty")
	}

	tempDir, err := os.MkdirTemp("", "libgraph-audio-opt-*")
	if err != nil {
		return false, err
	}
	defer os.RemoveAll(tempDir)

	inputExt := strings.ToLower(filepath.Ext(source))
	if inputExt == "" {
		inputExt = ".tmp"
	}
	inputPath := filepath.Join(tempDir, "input"+inputExt)
	outputPath := filepath.Join(tempDir, "output.ogg")

	if err := os.WriteFile(inputPath, inputBytes, 0o600); err != nil {
		return false, err
	}

	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-i", inputPath,
		"-vn",
		"-ac", "1",
		"-ar", "24000",
		"-c:a", "libopus",
		"-b:a", "48k",
		outputPath,
	)
	if _, err := cmd.CombinedOutput(); err != nil {
		return false, err
	}

	optimizedBytes, err := os.ReadFile(outputPath)
	if err != nil {
		return false, err
	}

	if len(optimizedBytes) == 0 {
		return false, fmt.Errorf("optimized audio output is empty")
	}

	if len(optimizedBytes) >= len(inputBytes) {
		return false, nil
	}

	baseName := strings.TrimSuffix(filepath.Base(source), filepath.Ext(source))
	optimizedName := baseName + ".ogg"
	optimizedFile, err := filesystem.NewFileFromBytes(optimizedBytes, optimizedName)
	if err != nil {
		return false, err
	}

	upload.Set("file", optimizedFile)
	if err := app.Save(upload); err != nil {
		return false, err
	}

	if err := scheduleUploadProcessing(app, upload); err != nil {
		return false, err
	}

	return true, nil
}

func isOptimized(filename string) bool {
	base := strings.ToLower(filepath.Base(filename))
	return strings.HasSuffix(base, ".ogg")
}
