package uploads

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/routine"
)

var (
	reImage       = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	reLink        = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	reHTML        = regexp.MustCompile(`<[^>]+>`)
	reHeading     = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	reBlockquote  = regexp.MustCompile(`(?m)^>\s*`)
	reListBullet  = regexp.MustCompile(`(?m)^[\s]*[-*+]\s+`)
	reListOrdered = regexp.MustCompile(`(?m)^[\s]*\d+\.\s+`)
	reCodeBlock   = regexp.MustCompile("```[\\s\\S]*?```")
	reInlineCode  = regexp.MustCompile("`([^`]+)`")
	reHR          = regexp.MustCompile(`(?m)^[-*_]{3,}\s*$`)
	reWhitespace  = regexp.MustCompile(`\s+`)
	reSentence    = regexp.MustCompile(`([.!?])\s+`)
	transcriptExt = map[string]bool{
		".txt":      true,
		".md":       true,
		".markdown": true,
	}
)

const (
	maxTranscriptionAudioDurationSeconds = 60 * 60
)

func Init(app *pocketbase.PocketBase) error {
	registerQueueHandlers(app)

	app.OnRecordCreateRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		upload := e.Record

		if err := validateTranscriptAttachment(upload); err != nil {
			return err
		}

		if err := e.Next(); err != nil {
			return err
		}

		uploadID := strings.TrimSpace(upload.Id)
		if uploadID == "" {
			return nil
		}

		routine.FireAndForget(func() {
			uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return
			}

			if uploadRecord.GetString("type") == vars.UploadTypeSummary {
				return
			}

			uploadRecord.Set("status", vars.UploadStatusProcessing)
			app.Save(uploadRecord)

			err = processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypeUploadParseOrTranscribe,
				DedupeKey: "upload.parse_or_transcribe:" + uploadID,
				Payload: map[string]any{
					"upload_id": uploadID,
				},
				UserID:   uploadRecord.GetString("user"),
				UploadID: uploadID,
			})
			if err != nil {
				uploadRecord.Set("status", vars.UploadStatusFailed)
				app.Save(uploadRecord)
			}
		})

		return nil
	})

	app.OnRecordDeleteRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		upload := e.Record
		uploadID := strings.TrimSpace(upload.Id)
		if uploadID == "" {
			return e.Next()
		}

		summaries, err := app.FindRecordsByFilter(
			collections.Summaries,
			"source_upload = {:uploadId}",
			"",
			0,
			0,
			dbx.Params{"uploadId": uploadID},
		)
		if err != nil {
			return err
		}

		deletedSummaryUploads := map[string]struct{}{}
		for _, summaryRecord := range summaries {
			summaryUploadID := strings.TrimSpace(summaryRecord.GetString("summary_upload"))
			if summaryUploadID == "" || summaryUploadID == uploadID {
				continue
			}
			if _, alreadyDeleted := deletedSummaryUploads[summaryUploadID]; alreadyDeleted {
				continue
			}

			summaryUploadRecord, err := app.FindRecordById(collections.Uploads, summaryUploadID)
			if err != nil {
				continue
			}

			if err := app.Delete(summaryUploadRecord); err != nil {
				return err
			}

			deletedSummaryUploads[summaryUploadID] = struct{}{}
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		newFile := record.GetString("file")
		if newFile == "" {
			return e.Next()
		}

		oldFile := ""
		if original := record.Original(); original != nil {
			oldFile = original.GetString("file")
		}

		if newFile == oldFile {
			return e.Next()
		}

		if !mistral.IsAudioFile(newFile) || isOptimizedAudioFilename(newFile) {
			return e.Next()
		}

		uploadID := strings.TrimSpace(record.Id)
		if uploadID == "" {
			return e.Next()
		}

		routine.FireAndForget(func() {
			uploadRecord, err := app.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return
			}

			_, err = optimizeAudioUploadFile(app, uploadRecord)
			if err != nil {
				return
			}
		})

		return e.Next()
	})

	return nil
}

func isOptimizedAudioFilename(filename string) bool {
	name := strings.TrimSpace(filename)
	base := strings.ToLower(filepath.Base(name))
	return strings.HasSuffix(base, ".ogg")
}

func optimizeAudioUploadFile(app *pocketbase.PocketBase, upload *core.Record) (bool, error) {
	sourceFile := upload.GetString("file")
	if sourceFile == "" {
		return false, fmt.Errorf("upload file is empty")
	}

	if !mistral.IsAudioFile(sourceFile) {
		return false, nil
	}

	if isOptimizedAudioFilename(sourceFile) {
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

	sourcePath := upload.BaseFilesPath() + "/" + sourceFile
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

	inputExt := strings.ToLower(filepath.Ext(sourceFile))
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

	baseName := strings.TrimSuffix(filepath.Base(sourceFile), filepath.Ext(sourceFile))
	optimizedName := baseName + ".ogg"
	optimizedFile, err := filesystem.NewFileFromBytes(optimizedBytes, optimizedName)
	if err != nil {
		return false, err
	}

	upload.Set("file", optimizedFile)
	if err := app.Save(upload); err != nil {
		return false, err
	}

	if err := scheduleUploadReprocessing(app, upload); err != nil {
		app.Logger().Warn("failed to enqueue reprocessing after audio optimization", "uploadId", upload.Id, "error", err)
	}

	return true, nil
}

func scheduleUploadReprocessing(app *pocketbase.PocketBase, uploadRecord *core.Record) error {
	uploadID := strings.TrimSpace(uploadRecord.Id)
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
		Payload: map[string]any{
			"upload_id": uploadID,
		},
		UserID:   uploadRecord.GetString("user"),
		UploadID: uploadID,
	})
}

func validateTranscriptAttachment(upload *core.Record) error {
	transcriptFile := strings.TrimSpace(upload.GetString("transcript_file"))
	if transcriptFile == "" {
		return nil
	}

	uploadFile := strings.TrimSpace(upload.GetString("file"))
	if !mistral.IsAudioFile(uploadFile) {
		return fmt.Errorf("transcript_file can only be attached to audio uploads")
	}

	transcriptExtension := strings.ToLower(filepath.Ext(transcriptFile))
	if !transcriptExt[transcriptExtension] {
		return fmt.Errorf("transcript_file must be a .txt, .md, or .markdown file")
	}

	return nil
}

func validateAudioDurationLimit(upload *core.Record) error {
	uploadFile := strings.TrimSpace(upload.GetString("file"))
	if uploadFile == "" || !mistral.IsAudioFile(uploadFile) {
		return nil
	}

	filePath := upload.BaseFilesPath() + "/" + uploadFile
	durationSeconds, err := probeAudioDurationSeconds(filePath)
	if err != nil {
		return err
	}

	if durationSeconds > maxTranscriptionAudioDurationSeconds {
		return fmt.Errorf("audio duration %.0f minutes exceeds the 60 minute transcription limit", durationSeconds/60)
	}

	return nil
}

func probeAudioDurationSeconds(filePath string) (float64, error) {
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

func chunkMarkdown(markdown string) []string {
	const maxChunkSize = 4500

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

func stripMarkdown(md string) string {
	text := reImage.ReplaceAllString(md, "$1")
	text = reLink.ReplaceAllString(text, "$1")
	text = reHTML.ReplaceAllString(text, "")
	text = reHeading.ReplaceAllString(text, "")

	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "__", "")
	text = strings.ReplaceAll(text, "*", "")
	text = strings.ReplaceAll(text, "_", "")

	text = reBlockquote.ReplaceAllString(text, "")
	text = reListBullet.ReplaceAllString(text, "")
	text = reListOrdered.ReplaceAllString(text, "")
	text = reCodeBlock.ReplaceAllString(text, "")
	text = reInlineCode.ReplaceAllString(text, "$1")
	text = reHR.ReplaceAllString(text, "")
	text = reWhitespace.ReplaceAllString(text, " ")

	return strings.TrimSpace(text)
}
