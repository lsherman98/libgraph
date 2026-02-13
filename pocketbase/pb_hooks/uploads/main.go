package uploads

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		filename := upload.GetString("file")
		uploadID := upload.Id
		uploadType := upload.GetString("type")

		slog.Info("[uploads] OnRecordAfterCreateSuccess triggered",
			"uploadID", uploadID,
			"filename", filename,
			"type", uploadType,
			"isAudio", mistral.IsAudioFile(filename),
		)

		// Branch: audio files go through Mistral transcription
		if mistral.IsAudioFile(filename) {
			slog.Info("[uploads] routing to audio transcription (Mistral)", "uploadID", uploadID)
			return handleAudioUpload(app, e, upload)
		}

		// Otherwise, use LlamaIndex document parsing
		slog.Info("[uploads] routing to document parsing (LlamaIndex)", "uploadID", uploadID)
		return handleDocumentUpload(app, e, upload)
	})

	return nil
}

// handleAudioUpload transcribes audio files using the Mistral API.
func handleAudioUpload(app *pocketbase.PocketBase, e *core.RecordEvent, upload *core.Record) error {
	uploadID := upload.Id
	title := upload.GetString("title")
	filename := upload.GetString("file")

	slog.Info("[uploads] handleAudioUpload started",
		"uploadID", uploadID,
		"title", title,
		"filename", filename,
	)

	mistralClient, err := mistral.New(app)
	if err != nil {
		slog.Error("[uploads] failed to create Mistral client", "uploadID", uploadID, "error", err)
		upload.Set("status", "FAILED")
		app.Save(upload)
		return err
	}

	slog.Info("[uploads] Mistral client created, setting status to PROCESSING", "uploadID", uploadID)
	upload.Set("status", "PROCESSING")
	if err := app.Save(upload); err != nil {
		slog.Error("[uploads] failed to update upload status to PROCESSING", "uploadID", uploadID, "error", err)
	}

	routine.FireAndForget(func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[uploads] PANIC in transcription goroutine", "uploadID", uploadID, "panic", r)
				upload.Set("status", "FAILED")
				app.Save(upload)
			}
		}()

		slog.Info("[uploads] transcription goroutine started", "uploadID", uploadID)

		res, err := mistralClient.Transcribe(upload)
		if err != nil {
			slog.Error("[uploads] Mistral transcription failed", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}

		slog.Info("[uploads] transcription API returned successfully",
			"uploadID", uploadID,
			"textLength", len(res.Text),
			"segmentCount", len(res.Segments),
		)

		// Group segments by speaker into diarization segments
		segments := mistral.GroupSegmentsBySpeaker(res.Segments)
		slog.Info("[uploads] diarization segments grouped",
			"uploadID", uploadID,
			"segmentCount", len(segments),
			"hasDiarization", len(segments) > 0,
		)

		// Generate speaker-labeled markdown
		var markdown string
		if len(segments) > 0 {
			markdown = mistral.FormatTranscriptMarkdown(segments)
		} else {
			markdown = mistral.FormatPlainTranscriptMarkdown(res.Text)
		}
		slog.Info("[uploads] transcript markdown generated", "uploadID", uploadID, "markdownLength", len(markdown))

		// Save a page record with the markdown file (same as document flow)
		pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
		if err != nil {
			slog.Error("[uploads] failed to find pages collection", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}

		newPage := core.NewRecord(pagesCollection)
		newPage.Set("upload", upload.Id)
		newPage.Set("page", 1)

		f, err := filesystem.NewFileFromBytes([]byte(markdown), fmt.Sprintf("%s_transcript.md", title))
		if err != nil {
			slog.Error("[uploads] failed to create file from transcript", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}
		newPage.Set("markdown", f)

		if err = app.Save(newPage); err != nil {
			slog.Error("[uploads] failed to save transcript page", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}
		slog.Info("[uploads] transcript page saved", "uploadID", uploadID, "pageID", newPage.Id)

		// Store diarization data as JSON on the upload record
		if len(segments) > 0 {
			diarizationJSON, err := json.Marshal(segments)
			if err != nil {
				slog.Error("[uploads] failed to marshal diarization data", "uploadID", uploadID, "error", err)
			} else {
				upload.Set("diarization", json.RawMessage(diarizationJSON))
				slog.Info("[uploads] diarization data stored on upload", "uploadID", uploadID, "diarizationSize", len(diarizationJSON))
			}
		}

		upload.Set("status", "SUCCESS")
		upload.Set("num_pages", 1)
		if err := app.Save(upload); err != nil {
			slog.Error("[uploads] failed to update upload status to SUCCESS", "uploadID", uploadID, "error", err)
		} else {
			slog.Info("[uploads] upload status set to SUCCESS", "uploadID", uploadID)
		}

		// Create document chunks for full-text search
		chunksCollection, chunkErr := app.FindCollectionByNameOrId(collections.DocumentChunks)
		if chunkErr != nil {
			slog.Error("[uploads] failed to find document_chunks collection", "uploadID", uploadID, "error", chunkErr)
			return
		}

		chunks := chunkMarkdown(markdown)
		slog.Info("[uploads] creating document chunks for full-text search", "uploadID", uploadID, "chunkCount", len(chunks))
		for idx, chunk := range chunks {
			if strings.TrimSpace(chunk) == "" {
				continue
			}
			chunkRecord := core.NewRecord(chunksCollection)
			chunkRecord.Set("upload", upload.Id)
			chunkRecord.Set("page", newPage.Id)
			chunkRecord.Set("page_number", 1)
			chunkRecord.Set("chunk_index", idx)
			chunkRecord.Set("content", stripMarkdown(chunk))
			chunkRecord.Set("user", upload.GetString("user"))

			if saveErr := app.Save(chunkRecord); saveErr != nil {
				slog.Error("[uploads] failed to save transcript chunk", "uploadID", uploadID, "error", saveErr, "chunk", idx)
			}
		}
		slog.Info("[uploads] transcription flow completed successfully", "uploadID", uploadID)
	})

	return e.Next()
}

// handleDocumentUpload processes document files using LlamaIndex parsing.
func handleDocumentUpload(app *pocketbase.PocketBase, e *core.RecordEvent, upload *core.Record) error {
	title := upload.GetString("title")

	llamaClient, err := llama.New(app)
	if err != nil {
		return err
	}

	res, err := llamaClient.Parse(upload)
	if err != nil {
		e.App.Logger().Error("Failed to start parse job:", "error", err)
		upload.Set("status", "FAILED")
		if err := app.Save(upload); err != nil {
			e.App.Logger().Error("Failed to update upload status to FAILED:", "error", err)
		}
		return err
	}

	upload.Set("status", "PROCESSING")
	if err := app.Save(upload); err != nil {
		e.App.Logger().Error("Failed to update upload status:", "error", err)
	}

	jobId := res.ID

	routine.FireAndForget(func() {
		jobRes, err := llamaClient.GetParseJob(jobId)
		if err != nil {
			e.App.Logger().Error("Failed to get parse job status:", "error", err)
		}

		status := jobRes.Job.Status
		for status == "RUNNING" || status == "PENDING" {
			time.Sleep(5 * time.Second)
			jobRes, err = llamaClient.GetParseJob(jobId)
			if err != nil {
				e.App.Logger().Error("Failed to get parse job status:", "error", err)
			}
			status = jobRes.Job.Status
		}

		if status != "SUCCESS" && status != "COMPLETED" {
			e.App.Logger().Error("LlamaIndex Parse failed", "status", status)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}

		pages := jobRes.Markdown.Pages

		pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
		if err != nil {
			e.App.Logger().Error("Failed to find pages collection:", "error", err)
		}

		for _, page := range pages {
			newPage := core.NewRecord(pagesCollection)
			newPage.Set("upload", upload.Id)
			newPage.Set("page", page.PageNumber)

			f, err := filesystem.NewFileFromBytes([]byte(page.Markdown), fmt.Sprintf("%s_page_%d.md", title, page.PageNumber))
			if err != nil {
				e.App.Logger().Error("Failed to create file from markdown bytes:", "error", err)
			}
			newPage.Set("markdown", f)

			if err = app.Save(newPage); err != nil {
				e.App.Logger().Error("Failed to save new page record:", "error", err)
			}
		}

		upload.Set("status", "SUCCESS")
		upload.Set("num_pages", len(pages))
		if err := app.Save(upload); err != nil {
			e.App.Logger().Error("Failed to update upload status to SUCCESS:", "error", err)
		}

		// Create document chunks for full-text search
		chunksCollection, chunkErr := app.FindCollectionByNameOrId(collections.DocumentChunks)
		if chunkErr != nil {
			e.App.Logger().Error("Failed to find document_chunks collection:", "error", chunkErr)
		} else {
			for i, page := range pages {
				pageRecords, findErr := app.FindRecordsByFilter(
					collections.Pages,
					"upload = {:uploadId} && page = {:pageNum}",
					"",
					1,
					0,
					map[string]any{"uploadId": upload.Id, "pageNum": page.PageNumber},
				)
				if findErr != nil || len(pageRecords) == 0 {
					e.App.Logger().Error("Failed to find page record for chunking:", "error", findErr, "pageIndex", i)
					continue
				}
				pageRec := pageRecords[0]

				chunks := chunkMarkdown(page.Markdown)

				for idx, chunk := range chunks {
					if strings.TrimSpace(chunk) == "" {
						continue
					}
					chunkRecord := core.NewRecord(chunksCollection)
					chunkRecord.Set("upload", upload.Id)
					chunkRecord.Set("page", pageRec.Id)
					chunkRecord.Set("page_number", page.PageNumber)
					chunkRecord.Set("chunk_index", idx)
					chunkRecord.Set("content", stripMarkdown(chunk))
					chunkRecord.Set("user", upload.GetString("user"))

					if saveErr := app.Save(chunkRecord); saveErr != nil {
						e.App.Logger().Error("Failed to save document chunk:", "error", saveErr, "page", page.PageNumber, "chunk", idx)
					}
				}
			}
		}

		// LlamaIndex Pipeline Integration
		uploadRes, err := llamaClient.UploadFileFromURL(upload)
		if err != nil {
			e.App.Logger().Error("Failed to upload file to Llama Cloud:", "error", err)
			return
		}

		metadata := map[string]interface{}{
			"upload_id":      upload.Id,
			"title":          title,
			"user_id":        upload.GetString("user"),
			"topic_id":       upload.GetString("topic"),
			"type":           upload.GetString("type"),
			"publication_id": upload.GetString("publication"),
		}

		_, err = llamaClient.AddFilesToPipeline(uploadRes.ID, metadata)
		if err != nil {
			e.App.Logger().Error("Failed to add file to pipeline:", "error", err)
			return
		}

		upload.Set("llama_file_id", uploadRes.ID)
		if err := app.Save(upload); err != nil {
			e.App.Logger().Error("Failed to save llama_file_id on upload:", "error", err)
		}
	})

	return e.Next()
}

// chunkMarkdown splits markdown into chunks by double newlines (paragraph-level).
// Each chunk is a logical paragraph or block.
func chunkMarkdown(markdown string) []string {
	const maxChunkSize = 4500 // stay under the 5000-char DB limit after stripping

	// Split on double newlines (paragraph boundaries)
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
		// Split oversized chunks on sentence boundaries
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
			// If a single sentence is still too long, hard-split it
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

// splitSentences splits text into sentences on ". ", "? ", "! " boundaries.
func splitSentences(text string) []string {
	re := regexp.MustCompile(`([.!?])\s+`)
	// Replace with the punctuation + a null byte as a split marker
	marked := re.ReplaceAllString(text, "${1}\x00")
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

// stripMarkdown removes common markdown syntax to produce plain text for indexing.
func stripMarkdown(md string) string {
	// Remove images
	re := regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	text := re.ReplaceAllString(md, "$1")

	// Remove links but keep text
	re = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	text = re.ReplaceAllString(text, "$1")

	// Remove HTML tags
	re = regexp.MustCompile(`<[^>]+>`)
	text = re.ReplaceAllString(text, "")

	// Remove heading markers
	re = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	text = re.ReplaceAllString(text, "")

	// Remove bold/italic markers
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "__", "")
	text = strings.ReplaceAll(text, "*", "")
	text = strings.ReplaceAll(text, "_", "")

	// Remove blockquote markers
	re = regexp.MustCompile(`(?m)^>\s*`)
	text = re.ReplaceAllString(text, "")

	// Remove list markers
	re = regexp.MustCompile(`(?m)^[\s]*[-*+]\s+`)
	text = re.ReplaceAllString(text, "")
	re = regexp.MustCompile(`(?m)^[\s]*\d+\.\s+`)
	text = re.ReplaceAllString(text, "")

	// Remove code blocks
	re = regexp.MustCompile("```[\\s\\S]*?```")
	text = re.ReplaceAllString(text, "")

	// Remove inline code
	re = regexp.MustCompile("`([^`]+)`")
	text = re.ReplaceAllString(text, "$1")

	// Remove horizontal rules
	re = regexp.MustCompile(`(?m)^[-*_]{3,}\s*$`)
	text = re.ReplaceAllString(text, "")

	// Collapse whitespace
	re = regexp.MustCompile(`\s+`)
	text = re.ReplaceAllString(text, " ")

	return strings.TrimSpace(text)
}
