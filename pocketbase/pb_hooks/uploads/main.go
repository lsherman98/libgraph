package uploads

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/routine"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
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

			if status != "SUCCESS" && status != "COMPLETED" { // LlamaIndex returns "SUCCESS" in v2 parse sometimes, but enum says COMPLETED. Checking both or just reliance on enum.
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
					// Find the saved page record to get its ID
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

			// Persist the LlamaIndex file ID so we can delete the document from the pipeline later
			upload.Set("llama_file_id", uploadRes.ID)
			if err := app.Save(upload); err != nil {
				e.App.Logger().Error("Failed to save llama_file_id on upload:", "error", err)
			}
		})

		return e.Next()
	})

	return nil
}

// chunkMarkdown splits markdown into chunks by double newlines (paragraph-level).
// Each chunk is a logical paragraph or block.
func chunkMarkdown(markdown string) []string {
	// Split on double newlines (paragraph boundaries)
	parts := strings.Split(markdown, "\n\n")
	chunks := []string{}
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			chunks = append(chunks, trimmed)
		}
	}
	return chunks
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
