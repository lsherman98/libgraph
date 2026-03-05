package uploads

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/proxyhooks"
	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
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

const optimizedAudioSuffix = "_optimized"

func Init(app *pocketbase.PocketBase) error {
	registerQueueHandlers(app)
	phooks := proxyhooks.Get(app)

	phooks.OnUploadsCreateRequest.BindFunc(func(e *pbgen.UploadsRequestEvent) error {
		upload := e.PRecord

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
			uploadRecord, findErr := app.FindRecordById(collections.Uploads, uploadID)
			if findErr != nil {
				app.Logger().Error("[uploads] failed to reload upload for async enqueue", "uploadId", uploadID, "error", findErr)
				return
			}

			uploadProxy, wrapErr := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
			if wrapErr != nil {
				app.Logger().Error("[uploads] failed to wrap upload proxy for async enqueue", "uploadId", uploadID, "error", wrapErr)
				return
			}

			if uploadProxy.Type() == pbgen.Summary {
				return
			}

			uploadProxy.SetStatus(pbgen.PROCESSING)
			if saveErr := app.Save(uploadProxy); saveErr != nil {
				app.Logger().Error("[uploads] failed to set upload status=PROCESSING", "uploadId", uploadID, "error", saveErr)
			}

			enqueueErr := processing.Enqueue(app, processing.EnqueueRequest{
				JobType:   processing.JobTypeUploadParseOrTranscribe,
				DedupeKey: "upload.parse_or_transcribe:" + uploadID,
				Payload: map[string]any{
					"upload_id": uploadID,
				},
				Priority:    50,
				MaxAttempts: 5,
				UserID:      uploadProxy.Record.GetString("user"),
				UploadID:    uploadID,
			})
			if enqueueErr != nil {
				uploadProxy.SetStatus(pbgen.FAILED)
				if saveErr := app.Save(uploadProxy); saveErr != nil {
					app.Logger().Error("[uploads] failed to set upload status=FAILED after enqueue failure", "uploadId", uploadID, "error", saveErr)
				}
				app.Logger().Error("[uploads] failed to enqueue upload processing", "uploadId", uploadID, "error", enqueueErr)
			}
		})

		return nil
	})

	phooks.OnUploadsDeleteRequest.BindFunc(func(e *pbgen.UploadsRequestEvent) error {
		upload := e.PRecord.Record
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

			summaryUploadRecord, findErr := app.FindRecordById(collections.Uploads, summaryUploadID)
			if findErr != nil {
				app.Logger().Warn("[uploads] failed to find linked summary upload during source upload delete", "sourceUploadId", uploadID, "summaryUploadId", summaryUploadID, "error", findErr)
				continue
			}

			if deleteErr := app.Delete(summaryUploadRecord); deleteErr != nil {
				return deleteErr
			}

			deletedSummaryUploads[summaryUploadID] = struct{}{}
		}

		return e.Next()
	})

	phooks.OnUploadsAfterUpdateSuccess.BindFunc(func(e *pbgen.UploadsEvent) error {
		record := e.PRecord.Record
		newFile := strings.TrimSpace(record.GetString("file"))
		if newFile == "" {
			return e.Next()
		}

		oldFile := ""
		if original := record.Original(); original != nil {
			oldFile = strings.TrimSpace(original.GetString("file"))
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
			uploadRecord, findErr := app.FindRecordById(collections.Uploads, uploadID)
			if findErr != nil {
				app.Logger().Error("[uploads] failed to reload upload for audio optimization", "uploadId", uploadID, "error", findErr)
				return
			}

			uploadProxy, wrapErr := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
			if wrapErr != nil {
				app.Logger().Error("[uploads] failed to wrap upload for audio optimization", "uploadId", uploadID, "error", wrapErr)
				return
			}

			optimized, optimizeErr := optimizeAudioUploadFile(app, uploadProxy)
			if optimizeErr != nil {
				app.Logger().Warn("[uploads] audio optimization failed; continuing with original file", "uploadId", uploadID, "error", optimizeErr)
				return
			}

			if optimized {
				app.Logger().Info("[uploads] optimized updated audio file", "uploadId", uploadID, "file", uploadProxy.File())
			}
		})

		return e.Next()
	})

	return nil
}

func isOptimizedAudioFilename(filename string) bool {
	name := strings.TrimSpace(filename)
	if name == "" {
		return false
	}

	base := strings.ToLower(filepath.Base(name))
	return strings.HasSuffix(base, optimizedAudioSuffix+".ogg")
}

func optimizeAudioUploadFile(app *pocketbase.PocketBase, upload *pbgen.Uploads) (bool, error) {
	sourceFile := strings.TrimSpace(upload.File())
	if sourceFile == "" {
		return false, fmt.Errorf("upload file is empty")
	}

	if !mistral.IsAudioFile(sourceFile) {
		return false, nil
	}

	if isOptimizedAudioFilename(sourceFile) {
		return false, nil
	}

	if _, lookErr := exec.LookPath("ffmpeg"); lookErr != nil {
		return false, fmt.Errorf("ffmpeg is required for audio optimization: %w", lookErr)
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return false, fmt.Errorf("failed to create filesystem: %w", err)
	}
	defer fsys.Close()

	sourcePath := upload.BaseFilesPath() + "/" + sourceFile
	reader, err := fsys.GetReader(sourcePath)
	if err != nil {
		return false, fmt.Errorf("failed to read source audio from storage: %w", err)
	}
	defer reader.Close()

	inputBytes, err := io.ReadAll(reader)
	if err != nil {
		return false, fmt.Errorf("failed to read source audio bytes: %w", err)
	}

	if len(inputBytes) == 0 {
		return false, fmt.Errorf("source audio file is empty")
	}

	tempDir, err := os.MkdirTemp("", "libgraph-audio-opt-*")
	if err != nil {
		return false, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	inputExt := strings.ToLower(filepath.Ext(sourceFile))
	if inputExt == "" {
		inputExt = ".tmp"
	}
	inputPath := filepath.Join(tempDir, "input"+inputExt)
	outputPath := filepath.Join(tempDir, "output.ogg")

	if err := os.WriteFile(inputPath, inputBytes, 0o600); err != nil {
		return false, fmt.Errorf("failed to write temp input file: %w", err)
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
	if output, cmdErr := cmd.CombinedOutput(); cmdErr != nil {
		return false, fmt.Errorf("ffmpeg optimization failed: %w (%s)", cmdErr, strings.TrimSpace(string(output)))
	}

	optimizedBytes, err := os.ReadFile(outputPath)
	if err != nil {
		return false, fmt.Errorf("failed to read optimized output file: %w", err)
	}

	if len(optimizedBytes) == 0 {
		return false, fmt.Errorf("optimized audio output is empty")
	}

	if len(optimizedBytes) >= len(inputBytes) {
		return false, nil
	}

	baseName := strings.TrimSuffix(filepath.Base(sourceFile), filepath.Ext(sourceFile))
	optimizedName := baseName + optimizedAudioSuffix + ".ogg"
	optimizedFile, err := filesystem.NewFileFromBytes(optimizedBytes, optimizedName)
	if err != nil {
		return false, fmt.Errorf("failed to create optimized file object: %w", err)
	}

	upload.SetFile(optimizedFile.Name)
	upload.Set("file", optimizedFile)
	if err := app.Save(upload); err != nil {
		return false, fmt.Errorf("failed to save optimized upload file: %w", err)
	}

	if err := scheduleUploadReprocessing(app, upload.Record); err != nil {
		app.Logger().Warn("[uploads] failed to enqueue reprocessing after audio optimization", "uploadId", upload.Id, "error", err)
	}

	return true, nil
}

func scheduleUploadReprocessing(app *pocketbase.PocketBase, uploadRecord *core.Record) error {
	uploadProxy, err := pbgen.WrapRecord[pbgen.Uploads](uploadRecord)
	if err != nil {
		return err
	}

	uploadID := strings.TrimSpace(uploadProxy.Id)
	if uploadID == "" || uploadProxy.Type() == pbgen.Summary {
		return nil
	}

	uploadProxy.SetStatus(pbgen.PROCESSING)
	if err := app.Save(uploadProxy); err != nil {
		return err
	}

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeUploadParseOrTranscribe,
		DedupeKey: "upload.parse_or_transcribe:" + uploadID,
		Payload: map[string]any{
			"upload_id": uploadID,
		},
		Priority:    50,
		MaxAttempts: 5,
		UserID:      uploadProxy.Record.GetString("user"),
		UploadID:    uploadID,
	})
}

func validateTranscriptAttachment(upload *pbgen.Uploads) error {
	transcriptFile := strings.TrimSpace(upload.Record.GetString("transcript_file"))
	if transcriptFile == "" {
		return nil
	}

	uploadFile := strings.TrimSpace(upload.File())
	if !mistral.IsAudioFile(uploadFile) {
		return fmt.Errorf("transcript_file can only be attached to audio uploads")
	}

	transcriptExtension := strings.ToLower(filepath.Ext(transcriptFile))
	if !transcriptExt[transcriptExtension] {
		return fmt.Errorf("transcript_file must be a .txt, .md, or .markdown file")
	}

	return nil
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
