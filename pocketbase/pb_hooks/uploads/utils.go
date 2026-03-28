package uploads

import (
	"fmt"
	"io"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func RecoverStuckUploads(app *pocketbase.PocketBase) {
	stuckUploads, err := app.FindRecordsByFilter(
		collections.Uploads,
		"status = 'PROCESSING'",
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
