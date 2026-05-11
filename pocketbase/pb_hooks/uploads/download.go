package uploads

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerDownloadRoutes(app *pocketbase.PocketBase, se *core.ServeEvent) error {
	se.Router.GET("/api/uploads/{uploadId}/download/markdown", func(e *core.RequestEvent) error {
		uploadID := e.Request.PathValue("uploadId")
		if uploadID == "" {
			return e.BadRequestError("upload id is required", nil)
		}

		userID := e.Auth.Id

		upload, err := e.App.FindRecordById(collections.Uploads, uploadID)
		if err != nil {
			return e.NotFoundError("upload not found", err)
		}

		if upload.GetString("user") != userID {
			return e.NotFoundError("upload not found", nil)
		}

		if mistral.IsAudioFile(upload.GetString("file")) {
			format := e.Request.URL.Query().Get("format")
			if format == "audio" {
				return downloadAudioFile(e, app, upload)
			}

			uploadID, err = findOrGetTranscriptUpload(e.App, upload)
			if err != nil {
				return e.BadRequestError("transcript not available", err)
			}

			upload, err = e.App.FindRecordById(collections.Uploads, uploadID)
			if err != nil {
				return e.NotFoundError("transcript not found", err)
			}
		}

		pages, err := e.App.FindRecordsByFilter(
			collections.Pages,
			"upload = {:uploadId}",
			"+page",
			0,
			0,
			dbx.Params{"uploadId": uploadID},
		)
		if err != nil {
			return e.InternalServerError("failed to fetch pages", err)
		}

		if len(pages) == 0 {
			return e.BadRequestError("no pages found for this upload", nil)
		}

		var buf bytes.Buffer
		title := upload.GetString("title")
		if title != "" {
			buf.WriteString("# " + title + "\n\n")
		}

		for _, page := range pages {
			pageNum := page.GetInt("page")
			markdownFile := page.GetString("markdown")

			if markdownFile != "" {
				content, err := getPageMarkdownContent(e.App, page, markdownFile)
				if err != nil {
					e.App.Logger().Warn(fmt.Sprintf("Warning: failed to fetch markdown for page %d: %v", pageNum, err))
					continue
				}

				if content != "" {
					fmt.Fprintf(&buf, "## Page %d\n\n", pageNum)
					buf.WriteString(content)
					buf.WriteString("\n\n")
				}
			}
		}

		markdown := buf.String()
		filename := sanitizeFilename(title) + ".md"

		e.Response.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		e.Response.Header().Set("Content-Length", fmt.Sprintf("%d", len(markdown)))

		_, err = e.Response.Write([]byte(markdown))
		return err
	}).Bind(apis.RequireAuth())

	return nil
}

func getPageMarkdownContent(app core.App, page *core.Record, markdownFile string) (string, error) {
	fs, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fs.Close()

	filePath := page.BaseFilesPath() + "/" + markdownFile

	file, err := fs.GetReader(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

func downloadAudioFile(e *core.RequestEvent, app core.App, upload *core.Record) error {
	audioFile := upload.GetString("file")
	if audioFile == "" {
		return e.BadRequestError("no audio file found", nil)
	}

	fs, err := app.NewFilesystem()
	if err != nil {
		return e.InternalServerError("failed to get filesystem", err)
	}
	defer fs.Close()

	filePath := upload.BaseFilesPath() + "/" + audioFile

	file, err := fs.GetReader(filePath)
	if err != nil {
		return e.InternalServerError("failed to get audio file", err)
	}
	defer file.Close()

	e.Response.Header().Set("Content-Type", "audio/mpeg")
	e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, audioFile))

	_, err = io.Copy(e.Response, file)
	return err
}

func findOrGetTranscriptUpload(app core.App, upload *core.Record) (string, error) {
	uploadID := upload.Id

	transcripts, err := findLinkedTranscripts(app, upload, 1)
	if err == nil && len(transcripts) > 0 {
		return transcripts[0].Id, nil
	}

	return uploadID, nil
}

func sanitizeFilename(filename string) string {
	replacer := strings.NewReplacer(
		"/", "-",
		"\\", "-",
		":", "-",
		"*", "-",
		"?", "-",
		"\"", "-",
		"<", "-",
		">", "-",
		"|", "-",
	)

	result := replacer.Replace(filename)
	result = strings.Join(strings.Fields(result), " ")

	if result == "" {
		result = "document"
	}

	return result
}
