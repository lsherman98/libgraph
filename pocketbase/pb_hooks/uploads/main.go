package uploads

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/parser"
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
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordCreateRequest(collections.Uploads).BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		upload := e.Record
		filename := upload.GetString("file")

		if mistral.IsAudioFile(filename) {
			return handleAudioUpload(app, e, upload)
		}

		return handleDocumentUpload(app, e, upload)
	})

	return nil
}

func handleAudioUpload(app *pocketbase.PocketBase, e *core.RecordRequestEvent, upload *core.Record) error {
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
		app.Logger().Error("failed to update upload status", "error", err)
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
			e.App.Logger().Error("failed to find pages collection", "error", err)
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
			e.App.Logger().Error("failed to find document_chunks collection", "uploadID", uploadID, "error", chunkErr)
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

	})

	return nil
}

func handleDocumentUpload(app *pocketbase.PocketBase, e *core.RecordRequestEvent, upload *core.Record) error {
	title := upload.GetString("title")
	uploadID := upload.Id

	docParser := parser.New(app)

	upload.Set("status", "PROCESSING")
	if err := app.Save(upload); err != nil {
		e.App.Logger().Error("failed to update upload status", "error", err)
	}

	routine.FireAndForget(func() {
		pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
		if err != nil {
			e.App.Logger().Error("failed to find pages collection", "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}

		onPage := func(page parser.Page) error {
			newPage := core.NewRecord(pagesCollection)
			newPage.Set("upload", upload.Id)
			newPage.Set("page", page.PageNumber)
			newPage.Set("user", upload.GetString("user"))

			f, err := filesystem.NewFileFromBytes([]byte(page.Markdown), fmt.Sprintf("%s_page_%d.md", title, page.PageNumber))
			if err != nil {
				e.App.Logger().Error("failed to create file from markdown bytes", "error", err, "page", page.PageNumber)
				return err
			}
			newPage.Set("markdown", f)
			if err = app.Save(newPage); err != nil {
				e.App.Logger().Error("failed to save new page record", "error", err, "page", page.PageNumber)
				return err
			}

			return nil
		}

		result, err := docParser.ParseUpload(upload, onPage)
		if err != nil {
			e.App.Logger().Error("Document parsing failed", "uploadID", uploadID, "error", err)
			upload.Set("status", "FAILED")
			app.Save(upload)
			return
		}

		upload.Set("status", "SUCCESS")
		upload.Set("num_pages", len(result.Pages))
		if err := app.Save(upload); err != nil {
			e.App.Logger().Error("failed to update upload status", "error", err)
		}

		chunksCollection, chunkErr := app.FindCollectionByNameOrId(collections.DocumentChunks)
		if chunkErr != nil {
			e.App.Logger().Error("failed to find document_chunks collection", "error", chunkErr)
		} else {
			for _, page := range result.Pages {
				pageRecord, err := app.FindFirstRecordByFilter(
					collections.Pages,
					"upload = {:uploadId} && page = {:pageNum}",
					dbx.Params{"uploadId": upload.Id, "pageNum": page.PageNumber},
				)
				if err != nil {
					e.App.Logger().Error("failed to find page record for chunking", "error", err, "page", page.PageNumber)
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
						e.App.Logger().Error("failed to save document chunk", "error", saveErr, "page", page.PageNumber, "chunk", idx)
					}
				}
			}
		}

	})

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
