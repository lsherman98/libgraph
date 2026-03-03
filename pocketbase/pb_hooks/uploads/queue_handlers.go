package uploads

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/parser"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

type uploadJobPayload struct {
	UploadID string `json:"upload_id"`
}

type chunkGeneratePayload struct {
	UploadID   string `json:"upload_id"`
	PageID     string `json:"page_id"`
	PageNumber int    `json:"page_number"`
	UserID     string `json:"user_id"`
}

const chunkEmbedEnqueueBatchSize = 250

func registerQueueHandlers(app *pocketbase.PocketBase) {
	processing.RegisterHandler(processing.JobTypeUploadParseOrTranscribe, handleUploadParseOrTranscribeJob)
	processing.RegisterHandler(processing.JobTypeChunkGenerate, handleChunkGenerateJob)
}

func handleUploadParseOrTranscribeJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := uploadJobPayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}
	if strings.TrimSpace(payload.UploadID) == "" {
		return fmt.Errorf("payload upload_id is required")
	}

	upload, err := app.FindRecordById(collections.Uploads, payload.UploadID)
	if err != nil {
		return err
	}

	upload.Set("status", "PROCESSING")
	if err := app.Save(upload); err != nil {
		return err
	}

	pages, err := app.FindRecordsByFilter(
		collections.Pages,
		"upload = {:uploadId}",
		"+page",
		0,
		0,
		dbx.Params{"uploadId": upload.Id},
	)
	if err != nil {
		return err
	}

	if len(pages) == 0 {
		if mistral.IsAudioFile(upload.GetString("file")) {
			pages, err = parseAudioUploadIntoPages(app, upload)
		} else {
			pages, err = parseDocumentUploadIntoPages(app, upload)
		}
		if err != nil {
			upload.Set("status", "FAILED")
			_ = app.Save(upload)
			return err
		}
	}

	for _, page := range pages {
		if err := enqueueChunkGenerateForPage(app, upload, page); err != nil {
			return err
		}
	}

	if err := enqueueSummarizeJobsForUpload(app, upload, pages); err != nil {
		return err
	}

	upload.Set("num_pages", len(pages))
	upload.Set("status", "PROCESSING")
	return app.Save(upload)
}

func enqueueSummarizeJobsForUpload(app *pocketbase.PocketBase, upload *core.Record, pages []*core.Record) error {
	if upload.GetBool("is_summary") || len(pages) == 0 {
		return nil
	}

	uploadType := strings.ToLower(strings.TrimSpace(upload.GetString("type")))
	if uploadType != "book" {
		anchorPage := pages[0]
		return enqueuePageSummarizeForPage(app, upload, anchorPage, true)
	}

	for _, page := range pages {
		if err := enqueuePageSummarizeForPage(app, upload, page, false); err != nil {
			return err
		}
	}

	return nil
}

func parseAudioUploadIntoPages(app *pocketbase.PocketBase, upload *core.Record) ([]*core.Record, error) {
	title := upload.GetString("title")

	mistralClient, err := mistral.New(app)
	if err != nil {
		return nil, err
	}

	res, err := mistralClient.Transcribe(upload)
	if err != nil {
		return nil, err
	}

	segments := mistral.GroupSegmentsBySpeaker(res.Segments)
	var markdown string
	if len(segments) > 0 {
		markdown = mistral.FormatTranscriptMarkdown(segments)
	} else {
		markdown = mistral.FormatPlainTranscriptMarkdown(res.Text)
	}

	page, err := createPageRecord(app, upload, 1, fmt.Sprintf("%s_transcript.md", title), markdown)
	if err != nil {
		return nil, err
	}

	return []*core.Record{page}, nil
}

func parseDocumentUploadIntoPages(app *pocketbase.PocketBase, upload *core.Record) ([]*core.Record, error) {
	title := upload.GetString("title")
	docParser := parser.New(app)
	pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
	if err != nil {
		return nil, err
	}

	persistedPages := make([]*core.Record, 0)

	onPage := func(page parser.Page) error {
		newPage := core.NewRecord(pagesCollection)
		newPage.Set("upload", upload.Id)
		newPage.Set("page", page.PageNumber)
		newPage.Set("user", upload.GetString("user"))

		f, err := filesystem.NewFileFromBytes([]byte(page.Markdown), fmt.Sprintf("%s_page_%d.md", title, page.PageNumber))
		if err != nil {
			return err
		}
		newPage.Set("markdown", f)
		if err = app.Save(newPage); err != nil {
			return err
		}

		persistedPages = append(persistedPages, newPage)
		return nil
	}

	if _, err := docParser.ParseUpload(upload, onPage); err != nil {
		return nil, err
	}

	return persistedPages, nil
}

func createPageRecord(app *pocketbase.PocketBase, upload *core.Record, pageNumber int, filename string, markdown string) (*core.Record, error) {
	pagesCollection, err := app.FindCollectionByNameOrId(collections.Pages)
	if err != nil {
		return nil, err
	}

	newPage := core.NewRecord(pagesCollection)
	newPage.Set("upload", upload.Id)
	newPage.Set("page", pageNumber)
	newPage.Set("user", upload.GetString("user"))

	f, err := filesystem.NewFileFromBytes([]byte(markdown), filename)
	if err != nil {
		return nil, err
	}

	newPage.Set("markdown", f)
	if err := app.Save(newPage); err != nil {
		return nil, err
	}
	return newPage, nil
}

func enqueueChunkGenerateForPage(app *pocketbase.PocketBase, upload *core.Record, page *core.Record) error {
	pageNumber := page.GetInt("page")
	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkGenerate,
		DedupeKey: fmt.Sprintf("chunk.generate:%s:%s", upload.Id, page.Id),
		Payload: map[string]any{
			"upload_id":   upload.Id,
			"page_id":     page.Id,
			"page_number": pageNumber,
			"user_id":     upload.GetString("user"),
		},
		Priority:    70,
		MaxAttempts: 5,
		UserID:      upload.GetString("user"),
		UploadID:    upload.Id,
		PageID:      page.Id,
	})
}

func enqueuePageSummarizeForPage(app *pocketbase.PocketBase, upload *core.Record, page *core.Record, fullDocument bool) error {
	if upload.GetBool("is_summary") {
		return nil
	}

	userID := strings.TrimSpace(page.GetString("user"))
	if userID == "" {
		userID = strings.TrimSpace(upload.GetString("user"))
	}
	if userID == "" {
		return fmt.Errorf("upload/page user is required for page summary enqueue")
	}

	pageID := strings.TrimSpace(page.Id)
	if pageID == "" {
		return fmt.Errorf("page id is required for page summary enqueue")
	}

	dedupeKey := fmt.Sprintf("page.summarize:%s:%s", userID, pageID)
	if fullDocument {
		dedupeKey = fmt.Sprintf("upload.summarize.full:%s:%s", userID, upload.Id)
	}

	payload := map[string]any{
		"page_id": pageID,
		"user_id": userID,
	}
	if fullDocument {
		payload["full_document"] = true
		payload["upload_id"] = upload.Id
	}

	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:     processing.JobTypePageSummarize,
		DedupeKey:   dedupeKey,
		Payload:     payload,
		Priority:    80,
		MaxAttempts: 5,
		UserID:      userID,
		UploadID:    upload.Id,
		PageID:      pageID,
	})
}

func handleChunkGenerateJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := chunkGeneratePayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}
	if payload.PageID == "" || payload.UploadID == "" {
		return fmt.Errorf("payload page_id and upload_id are required")
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, payload.UploadID)
	if err != nil {
		return err
	}

	if uploadRecord.GetBool("is_summary") {
		app.Logger().Info("[uploads] skipping chunk generation for summary upload", "upload_id", payload.UploadID, "page_id", payload.PageID)
		return nil
	}

	pageRecord, err := app.FindRecordById(collections.Pages, payload.PageID)
	if err != nil {
		return err
	}

	markdown, err := readPageMarkdown(app, pageRecord)
	if err != nil {
		return err
	}

	chunksCollection, err := app.FindCollectionByNameOrId(collections.DocumentChunks)
	if err != nil {
		return err
	}

	chunks := chunkMarkdown(markdown)
	chunkIndex := 1

	for _, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			continue
		}

		content := stripMarkdown(trimmed)
		if content == "" {
			continue
		}

		chunkRecord := core.NewRecord(chunksCollection)
		chunkRecord.Set("upload", payload.UploadID)
		chunkRecord.Set("page", payload.PageID)
		chunkRecord.Set("page_number", payload.PageNumber)
		chunkRecord.Set("chunk_index", chunkIndex)
		chunkRecord.Set("content", content)
		chunkRecord.Set("user", payload.UserID)

		err := app.Save(chunkRecord)
		if err != nil {
			if !strings.Contains(err.Error(), "UNIQUE constraint failed") {
				return err
			}

			chunkRecord, err = app.FindFirstRecordByFilter(
				collections.DocumentChunks,
				"upload = {:uploadId} && page = {:pageId} && chunk_index = {:chunkIndex}",
				dbx.Params{"uploadId": payload.UploadID, "pageId": payload.PageID, "chunkIndex": chunkIndex},
			)
			if err != nil {
				return err
			}

			if chunkRecord.GetString("content") != content {
				chunkRecord.Set("content", content)
				if saveErr := app.Save(chunkRecord); saveErr != nil {
					return saveErr
				}
			}
		}

		chunkIndex++
	}

	if hasPendingChunkGenerateJobs(app, payload.UploadID, job.Id) {
		return nil
	}

	return enqueueUploadChunkEmbeds(app, payload.UploadID, payload.UserID)
}

func hasPendingChunkGenerateJobs(app *pocketbase.PocketBase, uploadID string, currentJobID string) bool {
	records, err := app.FindRecordsByFilter(
		collections.ProcessingJobs,
		"upload = {:uploadId} && job_type = {:jobType} && (status = 'queued' || status = 'running') && id != {:jobId}",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID, "jobType": processing.JobTypeChunkGenerate, "jobId": currentJobID},
	)
	if err != nil {
		app.Logger().Warn("[uploads] failed to check pending chunk.generate jobs", "upload_id", uploadID, "error", err)
		return true
	}

	return len(records) > 0
}

func enqueueUploadChunkEmbeds(app *pocketbase.PocketBase, uploadID string, userID string) error {
	chunkRecords, err := app.FindRecordsByFilter(
		collections.DocumentChunks,
		"upload = {:uploadId} && (vector_id = 0 || vector_id = null)",
		"page_number,chunk_index,created",
		0,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil {
		return err
	}

	if len(chunkRecords) == 0 {
		return nil
	}

	type embedChunkRef struct {
		chunkID string
		hash    string
	}
	embedChunkRefs := make([]embedChunkRef, 0, len(chunkRecords))
	for _, chunkRecord := range chunkRecords {
		content := strings.TrimSpace(chunkRecord.GetString("content"))
		if content == "" {
			continue
		}

		hash := sha1.Sum([]byte(content))
		embedChunkRefs = append(embedChunkRefs, embedChunkRef{
			chunkID: chunkRecord.Id,
			hash:    hex.EncodeToString(hash[:]),
		})
	}

	for start := 0; start < len(embedChunkRefs); start += chunkEmbedEnqueueBatchSize {
		end := start + chunkEmbedEnqueueBatchSize
		if end > len(embedChunkRefs) {
			end = len(embedChunkRefs)
		}

		batch := embedChunkRefs[start:end]
		chunkIDs := make([]string, 0, len(batch))
		hashInput := strings.Builder{}
		for _, ref := range batch {
			chunkIDs = append(chunkIDs, ref.chunkID)
			hashInput.WriteString(ref.chunkID)
			hashInput.WriteString(":")
			hashInput.WriteString(ref.hash)
			hashInput.WriteString("|")
		}

		batchHash := sha1.Sum([]byte(hashInput.String()))
		batchNumber := start/chunkEmbedEnqueueBatchSize + 1
		totalBatches := (len(embedChunkRefs) + chunkEmbedEnqueueBatchSize - 1) / chunkEmbedEnqueueBatchSize
		dedupe := fmt.Sprintf("chunk.embed.batch:%s:%d:%s", uploadID, batchNumber, hex.EncodeToString(batchHash[:]))

		app.Logger().Info("[uploads] enqueue upload chunk embed batch",
			"upload_id", uploadID,
			"batch", batchNumber,
			"total_batches", totalBatches,
			"batch_size", len(chunkIDs),
		)

		if err := processing.Enqueue(app, processing.EnqueueRequest{
			JobType:   processing.JobTypeChunkEmbedSubmit,
			DedupeKey: dedupe,
			Payload: map[string]any{
				"chunk_ids": chunkIDs,
			},
			Priority:    100,
			MaxAttempts: 5,
			UserID:      userID,
			UploadID:    uploadID,
		}); err != nil {
			return err
		}
	}

	return nil
}
