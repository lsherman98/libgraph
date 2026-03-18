package uploads

import (
	"fmt"
	"io"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// RecoverStuckUploads re-enqueues uploads left in PROCESSING state so the
// durable queue can resume work after restart.
func RecoverStuckUploads(app *pocketbase.PocketBase) {
	stuckUploads, err := app.FindRecordsByFilter(
		collections.Uploads,
		"status = 'PROCESSING'",
		"",
		0, // no limit – recover all
		0,
	)
	if err != nil {
		app.Logger().Error("[recovery] failed to query stuck uploads", "error", err)
		return
	}

	if len(stuckUploads) == 0 {
		app.Logger().Info("[recovery] no stuck uploads found to re-enqueue")
		return
	}

	app.Logger().Info("[recovery] found stuck uploads, re-enqueueing", "count", len(stuckUploads))

	for _, upload := range stuckUploads {
		uploadID := upload.Id
		if err := processing.Enqueue(app, processing.EnqueueRequest{
			JobType:   processing.JobTypeUploadParseOrTranscribe,
			DedupeKey: "upload.parse_or_transcribe:" + uploadID,
			Payload: map[string]any{
				"upload_id": uploadID,
			},
			Priority:    50,
			MaxAttempts: 5,
			UserID:      upload.GetString("user"),
			UploadID:    uploadID,
		}); err != nil {
			app.Logger().Error("[recovery] failed to enqueue stuck upload", "uploadID", uploadID, "error", err)
			continue
		}

		app.Logger().Info("[recovery] re-enqueued stuck upload", "uploadID", uploadID)
	}
}

// readPageMarkdown reads the markdown content from a page record's stored file.
func readPageMarkdown(app *pocketbase.PocketBase, pageRecord *core.Record) (string, error) {
	filename := pageRecord.GetString("markdown")
	if filename == "" {
		return "", fmt.Errorf("page has no markdown file")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", fmt.Errorf("failed to create filesystem: %w", err)
	}
	defer fsys.Close()

	filePath := pageRecord.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read markdown from storage: %w", err)
	}
	defer blob.Close()

	content, err := io.ReadAll(blob)
	if err != nil {
		return "", fmt.Errorf("failed to read markdown bytes: %w", err)
	}

	return string(content), nil
}
