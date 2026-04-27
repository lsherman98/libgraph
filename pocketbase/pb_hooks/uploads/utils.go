package uploads

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func findCustomTranscriptFile(e *core.RecordRequestEvent) (*filesystem.File, error) {
	files, err := e.FindUploadedFiles("transcript_file")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return nil, nil
		}

		if strings.Contains(strings.ToLower(err.Error()), "invalid transcript_file") {
			return nil, nil
		}

		return nil, err
	}

	if len(files) == 0 {
		return nil, nil
	}

	return files[0], nil
}

func attachCustomTranscriptFile(app core.App, upload *core.Record, transcriptFile *filesystem.File) error {
	if transcriptFile == nil {
		return nil
	}

	if err := validateCustomTranscriptFile(upload, transcriptFile); err != nil {
		return err
	}

	linkedTranscripts, err := findLinkedTranscripts(app, upload, 1)
	if err != nil {
		return err
	}
	if len(linkedTranscripts) > 0 {
		return nil
	}

	uploadsCollection, err := app.FindCollectionByNameOrId(collections.Uploads)
	if err != nil {
		return err
	}

	title := strings.TrimSpace(strings.TrimSuffix(transcriptFile.Name, filepath.Ext(transcriptFile.Name)))
	if title == "" {
		title = strings.TrimSpace(upload.GetString("title"))
	}
	if title == "" {
		title = "transcript"
	}
	if !strings.HasSuffix(strings.ToLower(title), " transcript") {
		title += " Transcript"
	}

	transcriptRecord := core.NewRecord(uploadsCollection)
	transcriptRecord.Set("title", title)
	transcriptRecord.Set("type", "transcript")
	transcriptRecord.Set("status", vars.UploadStatusPending)
	transcriptRecord.Set("user", upload.GetString("user"))
	transcriptRecord.Set("file", transcriptFile)
	transcriptRecord.Set("uploads", []string{upload.Id})

	if err := app.Save(transcriptRecord); err != nil {
		return err
	}

	existing := upload.GetStringSlice("uploads")
	existing = append(existing, transcriptRecord.Id)
	upload.Set("uploads", uniqueStringValues(existing))

	return nil
}

func validateCustomTranscriptFile(upload *core.Record, transcriptFile *filesystem.File) error {
	uploadFile := upload.GetString("file")
	if !mistral.IsAudioFile(uploadFile) {
		return fmt.Errorf("transcript_file can only be attached to audio uploads")
	}

	if transcriptFile == nil || transcriptFile.Name == "" {
		return fmt.Errorf("transcript_file is empty")
	}

	ext := strings.ToLower(filepath.Ext(transcriptFile.Name))
	if !transcriptExt[ext] {
		return fmt.Errorf("transcript_file must be a .txt, .md, or .markdown file")
	}

	return nil
}

func uniqueStringValues(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))

	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}

		seen[value] = struct{}{}
		result = append(result, value)
	}

	return result
}

func formatCommandError(err error, output []byte, fallback string) error {
	details := strings.TrimSpace(string(output))
	if details == "" {
		return fmt.Errorf("%s: %w", fallback, err)
	}

	return fmt.Errorf("%s: %w: %s", fallback, err, truncateUploadCommandOutput(details, 1000))
}

func truncateUploadCommandOutput(s string, maxLen int) string {
	if maxLen <= 0 || len(s) <= maxLen {
		return s
	}

	if maxLen <= 3 {
		return s[:maxLen]
	}

	return s[:maxLen-3] + "..."
}

func RecoverStuckUploads(app *pocketbase.PocketBase) {
	recoverableUploads, err := app.FindRecordsByFilter(
		collections.Uploads,
		"status = 'pending' || status = 'processing'",
		"",
		0,
		0,
	)
	if err != nil {
		return
	}

	if len(recoverableUploads) == 0 {
		return
	}

	for _, upload := range recoverableUploads {
		switch upload.GetString("status") {
		case vars.UploadStatusPending:
			if err := scheduleUploadProcessing(app, upload); err != nil {
				continue
			}
		case vars.UploadStatusProcessing:
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

func getFileBytes(app core.App, record *core.Record, filename string) ([]byte, error) {
	if filename == "" {
		return nil, fmt.Errorf("file is empty")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, err
	}
	defer fsys.Close()

	filePath := record.BaseFilesPath() + "/" + filename
	reader, err := fsys.GetReader(filePath)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	fileBytes, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	if len(fileBytes) == 0 {
		return nil, fmt.Errorf("source file is empty")
	}

	return fileBytes, nil
}

func getAudioDurationFromBytes(fileBytes []byte, filename string) (float64, error) {
	if len(fileBytes) == 0 {
		return 0, fmt.Errorf("source audio file is empty")
	}

	tempDir, err := os.MkdirTemp("", "libgraph-audio-duration-*")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(tempDir)

	inputExt := strings.ToLower(filepath.Ext(filename))
	if inputExt == "" {
		inputExt = ".tmp"
	}
	inputPath := filepath.Join(tempDir, "input"+inputExt)
	if err := os.WriteFile(inputPath, fileBytes, 0o600); err != nil {
		return 0, err
	}

	return getAudioDuration(inputPath)
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
		return 0, formatCommandError(err, output, "ffprobe failed")
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

func validateDurationLimit(app core.App, upload *core.Record) error {
	uploadFile := upload.GetString("file")
	if uploadFile == "" || !mistral.IsAudioFile(uploadFile) {
		return nil
	}

	linkedTranscripts, err := findLinkedTranscripts(app, upload, 1)
	if err != nil {
		return err
	}
	if len(linkedTranscripts) > 0 {
		return nil
	}

	fileBytes, err := getFileBytes(app, upload, uploadFile)
	if err != nil {
		return err
	}

	durationSeconds, err := getAudioDurationFromBytes(fileBytes, uploadFile)
	if err != nil {
		return err
	}

	if durationSeconds > maxTranscriptionDuration {
		return fmt.Errorf("audio duration %.0f minutes exceeds the 60 minute transcription limit", durationSeconds/60)
	}

	return nil
}

func findLinkedTranscripts(app core.App, upload *core.Record, limit int) ([]*core.Record, error) {
	uploadID := upload.Id
	params := dbx.Params{"uploadId": uploadID, "type": "transcript"}

	byUploads, uploadsErr := app.FindRecordsByFilter(
		collections.Uploads,
		"uploads ?~ {:uploadId} && type = {:type} && file != ''",
		"-created",
		limit,
		0,
		params,
	)
	if uploadsErr == nil && len(byUploads) > 0 {
		return byUploads, nil
	}

	byUpload, uploadErr := app.FindRecordsByFilter(
		collections.Uploads,
		"upload = {:uploadId} && type = {:type} && file != ''",
		"-created",
		limit,
		0,
		params,
	)
	if uploadErr == nil {
		if len(byUpload) > 0 {
			return byUpload, nil
		}
		if uploadsErr == nil {
			return byUploads, nil
		}
		return byUpload, nil
	}

	if uploadsErr != nil {
		return nil, uploadsErr
	}

	referencedIDs := upload.GetStringSlice("uploads")
	if len(referencedIDs) > 0 {
		referencedMatches := make([]*core.Record, 0, limit)
		for _, id := range referencedIDs {
			if id == "" {
				continue
			}

			record, err := app.FindRecordById(collections.Uploads, id)
			if err != nil {
				continue
			}

			if record.GetString("type") != "transcript" || record.GetString("file") == "" {
				continue
			}

			referencedMatches = append(referencedMatches, record)
			if len(referencedMatches) >= limit {
				return referencedMatches, nil
			}
		}

		if len(referencedMatches) > 0 {
			return referencedMatches, nil
		}
	}

	return byUploads, nil
}
func validateDuplicateUpload(app core.App, upload *core.Record) error {
	if upload.GetString("type") == vars.UploadTypeSummary {
		return nil
	}

	userID := upload.GetString("user")
	title := upload.GetString("title")
	authorID := upload.GetString("author")
	if userID == "" || title == "" {
		return nil
	}

	params := dbx.Params{
		"user":  userID,
		"title": title,
		"id":    upload.Id,
	}

	filter := "user = {:user} && title = {:title} && id != {:id}"
	if authorID == "" {
		filter += " && (author = '' || author = null)"
	} else {
		params["author"] = authorID
		filter += " && author = {:author}"
	}

	duplicate, err := app.FindRecordsByFilter(
		collections.Uploads,
		filter,
		"",
		1,
		0,
		params,
	)
	if err != nil {
		return err
	}

	if len(duplicate) > 0 {
		return fmt.Errorf("duplicate upload already exists for this user, author, and title")
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

// ffmpegMu ensures only one ffmpeg conversion runs at a time to avoid excessive CPU usage.
var ffmpegMu sync.Mutex

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

	inputBytes, err := getFileBytes(app, upload, source)
	if err != nil {
		return false, err
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

	ffmpegMu.Lock()
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
	output, err := cmd.CombinedOutput()
	ffmpegMu.Unlock()
	if err != nil {
		return false, formatCommandError(err, output, "ffmpeg audio optimization failed")
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

	return true, nil
}

func isOptimized(filename string) bool {
	base := strings.ToLower(filepath.Base(filename))
	return strings.HasSuffix(base, ".ogg") || strings.HasSuffix(base, ".opus")
}
