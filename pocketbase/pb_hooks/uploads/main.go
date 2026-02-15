package uploads

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordCreateRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		upload := e.Record
		filename := upload.GetString("file")

		token, err := e.Auth.NewFileToken()
		if err != nil {
			e.App.Logger().Error("Failed to create file token:", "error", err)
			return err
		}

		if mistral.IsAudioFile(filename) {
			handleAudioUpload(app, e, upload, token)
			return e.Next()
		}

		handleDocumentUpload(app, e, upload, token)
		return e.Next()
	})

	return nil
}

func handleAudioUpload(app *pocketbase.PocketBase, e *core.RecordRequestEvent, upload *core.Record, token string) error {
	uploadID := upload.Id
	title := upload.GetString("title")

	mistralClient, err := mistral.New(app)
	if err != nil {
		upload.Set("status", "FAILED")
		app.Save(upload)
		return err
	}

	upload.Set("status", "PROCESSING")
	if err := app.Save(upload); err != nil {
		app.Logger().Error("failed to update upload status:", "error", err)
	}

	routine.FireAndForget(func() {
		res, err := mistralClient.Transcribe(upload)
		if err != nil {
			e.App.Logger().Error("Mistral transcription failed", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			e.App.Save(upload)
			return
		}

		segments := mistral.GroupSegmentsBySpeaker(res.Segments)

		var markdown string
		if len(segments) > 0 {
			markdown = mistral.FormatTranscriptMarkdown(segments)
		} else {
			markdown = mistral.FormatPlainTranscriptMarkdown(res.Text)
		}

		pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
		if err != nil {
			upload.Set("status", "FAILED")
			e.App.Save(upload)
			return
		}

		newPage := core.NewRecord(pagesCollection)
		newPage.Set("upload", upload.Id)
		newPage.Set("page", 1)
		newPage.Set("user", upload.GetString("user"))

		f, err := filesystem.NewFileFromBytes([]byte(markdown), fmt.Sprintf("%s_transcript.md", title))
		if err != nil {
			upload.Set("status", "FAILED")
			e.App.Save(upload)
			return
		}
		newPage.Set("markdown", f)
		if err = e.App.Save(newPage); err != nil {
			upload.Set("status", "FAILED")
			e.App.Save(upload)
			return
		}

		upload.Set("status", "SUCCESS")
		upload.Set("num_pages", 1)
		if err := e.App.Save(upload); err != nil {
			e.App.Logger().Error("failed to update upload status to SUCCESS", "uploadID", uploadID, "error", err)
		}

		chunksCollection, chunkErr := app.FindCollectionByNameOrId(collections.DocumentChunks)
		if chunkErr != nil {
			return
		}

		chunks := chunkMarkdown(markdown)
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
			if saveErr := e.App.Save(chunkRecord); saveErr != nil {
				e.App.Logger().Error("failed to save transcript chunk", "uploadID", uploadID, "error", saveErr, "chunk", idx)
			}
		}

		llamaClient, llamaErr := llama.New(app)
		if llamaErr != nil {
			e.App.Logger().Error("failed to create LlamaIndex client for audio transcript", "uploadID", uploadID, "error", llamaErr)
		} else {
			transcriptFilename := fmt.Sprintf("%s_transcript.md", title)
			uploadRes, uploadErr := llamaClient.UploadFileContent(transcriptFilename, []byte(markdown), upload.Id)
			if uploadErr != nil {
				e.App.Logger().Error("failed to upload transcript to LlamaIndex Cloud", "uploadID", uploadID, "error", uploadErr)
			} else {
				metadata := map[string]any{
					"upload_id":      upload.Id,
					"title":          title,
					"user_id":        upload.GetString("user"),
					"topic_id":       upload.GetString("topic"),
					"type":           upload.GetString("type"),
					"publication_id": upload.GetString("publication"),
				}

				_, pipelineErr := llamaClient.AddFilesToPipeline(uploadRes.ID, metadata)
				if pipelineErr != nil {
					app.Logger().Error("failed to add transcript to LlamaIndex pipeline", "uploadID", uploadID, "error", pipelineErr)
				} else {
					upload.Set("llama_file_id", uploadRes.ID)
					if saveErr := app.Save(upload); saveErr != nil {
						app.Logger().Error("failed to save llama_file_id on upload", "uploadID", uploadID, "error", saveErr)
					}
				}
			}
		}
	})

	return e.Next()
}

func handleDocumentUpload(app *pocketbase.PocketBase, e *core.RecordRequestEvent, upload *core.Record, token string) error {
	title := upload.GetString("title")

	llamaClient, err := llama.New(app)
	if err != nil {
		return err
	}

	res, err := llamaClient.Parse(upload, token)
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
			newPage.Set("user", upload.GetString("user"))

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

		chunksCollection, chunkErr := app.FindCollectionByNameOrId(collections.DocumentChunks)
		if chunkErr != nil {
			e.App.Logger().Error("Failed to find document_chunks collection:", "error", chunkErr)
		} else {
			for i, page := range pages {
				pageRecord, err := app.FindFirstRecordByFilter(
					collections.Pages,
					"upload = {:uploadId} && page = {:pageNum}",
					dbx.Params{"uploadId": upload.Id, "pageNum": page.PageNumber},
				)
				if err != nil {
					e.App.Logger().Error("Failed to find page record for chunking:", "error", err, "pageIndex", i)
					continue
				}

				chunks := chunkMarkdown(page.Markdown)

				for idx, chunk := range chunks {
					if strings.TrimSpace(chunk) == "" {
						continue
					}
					chunkRecord := core.NewRecord(chunksCollection)
					chunkRecord.Set("upload", upload.Id)
					chunkRecord.Set("page", pageRecord.Id)
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

		uploadRes, err := llamaClient.UploadFileFromURL(upload, token)
		if err != nil {
			e.App.Logger().Error("Failed to upload file to Llama Cloud:", "error", err)
			return
		}

		metadata := map[string]any{
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
	re := regexp.MustCompile(`([.!?])\s+`)
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

func stripMarkdown(md string) string {
	re := regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	text := re.ReplaceAllString(md, "$1")

	re = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	text = re.ReplaceAllString(text, "$1")

	re = regexp.MustCompile(`<[^>]+>`)
	text = re.ReplaceAllString(text, "")

	re = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	text = re.ReplaceAllString(text, "")

	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "__", "")
	text = strings.ReplaceAll(text, "*", "")
	text = strings.ReplaceAll(text, "_", "")

	re = regexp.MustCompile(`(?m)^>\s*`)
	text = re.ReplaceAllString(text, "")

	re = regexp.MustCompile(`(?m)^[\s]*[-*+]\s+`)
	text = re.ReplaceAllString(text, "")
	re = regexp.MustCompile(`(?m)^[\s]*\d+\.\s+`)
	text = re.ReplaceAllString(text, "")

	re = regexp.MustCompile("```[\\s\\S]*?```")
	text = re.ReplaceAllString(text, "")

	re = regexp.MustCompile("`([^`]+)`")
	text = re.ReplaceAllString(text, "$1")

	re = regexp.MustCompile(`(?m)^[-*_]{3,}\s*$`)
	text = re.ReplaceAllString(text, "")

	re = regexp.MustCompile(`\s+`)
	text = re.ReplaceAllString(text, " ")

	return strings.TrimSpace(text)
}
