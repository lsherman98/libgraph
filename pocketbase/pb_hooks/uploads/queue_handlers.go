package uploads

import (
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/mistral"
	"github.com/lsherman98/libgraph/pocketbase/parser"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func HandleUploadJob(app core.App, job *core.Record) error {
	upload, err := app.FindRecordById(collections.Uploads, job.GetString("upload"))
	if err != nil {
		return err
	}

	if upload.GetString("type") == vars.UploadTypeSummary {
		return nil
	}

	upload.Set("status", vars.UploadStatusProcessing)
	if err := app.Save(upload); err != nil {
		return err
	}

	if mistral.IsAudioFile(upload.GetString("file")) {
		optimized, err := optimizeAudioUpload(app, upload)
		if err != nil {
			upload.Set("status", vars.UploadStatusFailed)
			if saveErr := app.Save(upload); saveErr != nil {
				return saveErr
			}

			return err
		}

		if optimized {
			upload, err = app.FindRecordById(collections.Uploads, job.GetString("upload"))
			if err != nil {
				return err
			}
		}
	}

	var pages []*core.Record
	if mistral.IsAudioFile(upload.GetString("file")) {
		pages, err = getPagesFromAudio(app, upload)
	} else {
		pages, err = getPagesFromDocument(app, upload)
	}
	if err != nil {
		upload.Set("status", vars.UploadStatusFailed)
		if err := app.Save(upload); err != nil {
			return err
		}

		return err
	}

	for _, page := range pages {
		if err := enqueueChunkJob(app, upload, page); err != nil {
			return err
		}
	}

	upload.Set("num_pages", len(pages))
	upload.Set("status", vars.UploadStatusProcessing)
	return app.Save(upload)
}

func getPagesFromAudio(app core.App, upload *core.Record) ([]*core.Record, error) {
	title := upload.GetString("title")
	md, err := getTranscriptMarkdown(app, upload)
	if err != nil {
		return nil, err
	}

	if md != "" {
		page, err := createPageRecord(app, upload, 1, fmt.Sprintf("%s_transcript.md", title), md)
		if err != nil {
			return nil, err
		}

		return []*core.Record{page}, nil
	}

	if err := validateDurationLimit(app, upload); err != nil {
		return nil, err
	}

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

func getTranscriptMarkdown(app core.App, upload *core.Record) (string, error) {
	linkedTranscripts, err := findLinkedTranscripts(app, upload, 1)
	if err != nil {
		return "", err
	}
	if len(linkedTranscripts) == 0 {
		return "", nil
	}
	linkedTranscript := linkedTranscripts[0]

	linkedTranscriptFile := linkedTranscript.GetString("file")
	if linkedTranscriptFile == "" {
		return "", nil
	}

	return readTranscriptMarkdown(app, linkedTranscript, linkedTranscriptFile)
}

func readTranscriptMarkdown(app core.App, sourceUpload *core.Record, transcriptFilename string) (string, error) {
	if transcriptFilename == "" {
		return "", nil
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()

	transcriptPath := sourceUpload.BaseFilesPath() + "/" + transcriptFilename
	blob, err := fsys.GetReader(transcriptPath)
	if err != nil {
		return "", err
	}
	defer blob.Close()

	bytes, err := io.ReadAll(blob)
	if err != nil {
		return "", err
	}

	text := string(bytes)
	if text == "" {
		return "", fmt.Errorf("transcript file is empty")
	}

	ext := strings.ToLower(filepath.Ext(transcriptFilename))
	if ext == ".md" || ext == ".markdown" {
		return text, nil
	}

	return mistral.FormatPlainTranscriptMarkdown(text), nil
}

func getPagesFromDocument(app core.App, upload *core.Record) ([]*core.Record, error) {
	title := upload.GetString("title")
	docParser := parser.New(app)

	persistedPages := make([]*core.Record, 0)

	onPage := func(page parser.Page) error {
		persistedPage, err := createPageRecord(app, upload, page.PageNumber, fmt.Sprintf("%s_page_%d.md", title, page.PageNumber), page.Markdown)
		if err != nil {
			return err
		}

		persistedPages = append(persistedPages, persistedPage)
		return nil
	}

	if _, err := docParser.ParseUpload(upload, onPage); err != nil {
		return nil, err
	}

	return persistedPages, nil
}

func createPageRecord(app core.App, upload *core.Record, pageNumber int, filename string, markdown string) (*core.Record, error) {
	pageRecord, err := findPageRecord(app, upload.Id, pageNumber)
	if err != nil {
		return nil, err
	}
	if pageRecord == nil {
		pagesCollection, _ := app.FindCollectionByNameOrId(collections.Pages)
		pageRecord = core.NewRecord(pagesCollection)
	}

	pageRecord.Set("upload", upload.Id)
	pageRecord.Set("page", pageNumber)
	pageRecord.Set("user", upload.GetString("user"))

	f, err := filesystem.NewFileFromBytes([]byte(markdown), filename)
	if err != nil {
		return nil, err
	}

	pageRecord.Set("markdown", f.Name)
	pageRecord.Set("markdown", f)
	if err := app.Save(pageRecord); err != nil {
		return nil, err
	}
	return pageRecord, nil
}

func findPageRecord(app core.App, uploadID string, pageNumber int) (*core.Record, error) {
	page, err := app.FindFirstRecordByFilter(
		collections.Pages,
		"upload = {:uploadId} && page = {:pageNumber}",
		dbx.Params{"uploadId": uploadID, "pageNumber": pageNumber},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return page, nil
}

func enqueueChunkJob(app core.App, upload *core.Record, page *core.Record) error {
	pageNumber := page.GetInt("page")
	return processing.Enqueue(app, processing.EnqueueRequest{
		JobType:   processing.JobTypeChunkGenerate,
		DedupeKey: fmt.Sprintf("chunk.generate:%s:%s", upload.Id, page.Id),
		Payload: map[string]any{
			"page_number": pageNumber,
		},
		UserID:   upload.GetString("user"),
		UploadID: upload.Id,
		PageID:   page.Id,
	})
}

func HandleChunkJob(app core.App, job *core.Record) error {
	payload := ChunkPayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return fmt.Errorf("invalid payload: %w", err)
	}

	upload, err := app.FindRecordById(collections.Uploads, job.GetString("upload"))
	if err != nil {
		return err
	}

	if upload.GetString("type") == vars.UploadTypeSummary {
		return nil
	}

	page, err := app.FindRecordById(collections.Pages, job.GetString("page"))
	if err != nil {
		return err
	}

	markdown, err := readPageMarkdown(app, page)
	if err != nil {
		return err
	}

	chunksCollection, _ := app.FindCollectionByNameOrId(collections.DocumentChunks)
	existingChunks, err := app.FindRecordsByFilter(
		collections.DocumentChunks,
		"upload = {:uploadId} && page = {:pageId}",
		"chunk_index",
		0,
		0,
		dbx.Params{"uploadId": job.GetString("upload"), "pageId": job.GetString("page")},
	)
	if err != nil {
		return err
	}

	existingByIndex := make(map[int]*core.Record, len(existingChunks))
	for _, existing := range existingChunks {
		existingByIndex[existing.GetInt("chunk_index")] = existing
	}

	chunks := chunkMarkdown(markdown)
	chunkIndex := 1
	seenChunkIndexes := make(map[int]bool, len(chunks))

	for _, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			continue
		}

		content := stripMarkdown(trimmed)
		if content == "" {
			continue
		}

		record := existingByIndex[chunkIndex]
		if record == nil {
			record = core.NewRecord(chunksCollection)
		}
		record.Set("upload", job.GetString("upload"))
		record.Set("page", job.GetString("page"))
		record.Set("page_number", payload.PageNumber)
		record.Set("chunk_index", chunkIndex)
		record.Set("content", content)
		record.Set("user", job.GetString("user"))
		if err := app.Save(record); err != nil {
			return err
		}

		seenChunkIndexes[chunkIndex] = true
		chunkIndex++
	}

	for _, existing := range existingChunks {
		if seenChunkIndexes[existing.GetInt("chunk_index")] {
			continue
		}
		if err := app.Delete(existing); err != nil {
			return err
		}
	}

	return nil
}

func HandleChunkJobSuccess(app core.App, job *core.Record) error {
	return enqueueEmbedJob(app, job.GetString("upload"), job.GetString("user"))
}

func enqueueEmbedJob(app core.App, uploadID string, userID string) error {
	// Only enqueue embed jobs once all chunk.generate jobs for this upload are done.
	// This is called after the current chunk job has already been marked success.
	// Only block on queued/running jobs — failed/cancelled jobs should not prevent embed job creation.
	activeChunkJobs, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && job_type = {:jobType} && (status = {:queued} || status = {:running})",
		"",
		0,
		0,
		dbx.Params{"uploadId": uploadID, "jobType": processing.JobTypeChunkGenerate, "queued": vars.QueueStatusQueued, "running": vars.QueueStatusRunning},
	)
	if err != nil {
		return err
	}
	if len(activeChunkJobs) > 0 {
		return nil
	}

	chunks, err := app.FindRecordsByFilter(
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

	embedChunkRefs := make([]EmbedChunk, 0, len(chunks))
	for _, chunk := range chunks {
		content := chunk.GetString("content")
		hash := sha1.Sum([]byte(content))
		embedChunkRefs = append(embedChunkRefs, EmbedChunk{
			ChunkID: chunk.Id,
			Hash:    hex.EncodeToString(hash[:]),
		})
	}

	for start := 0; start < len(embedChunkRefs); start += embedBatchSize {
		end := start + embedBatchSize
		if end > len(embedChunkRefs) {
			end = len(embedChunkRefs)
		}

		batch := embedChunkRefs[start:end]
		chunkIDs := make([]string, 0, len(batch))
		hashInput := strings.Builder{}
		for _, ref := range batch {
			chunkIDs = append(chunkIDs, ref.ChunkID)
			hashInput.WriteString(ref.ChunkID)
			hashInput.WriteString(":")
			hashInput.WriteString(ref.Hash)
			hashInput.WriteString("|")
		}

		batchHash := sha1.Sum([]byte(hashInput.String()))
		batchNumber := start/embedBatchSize + 1
		dedupe := fmt.Sprintf("chunk.embed.batch:%s:%d:%s", uploadID, batchNumber, hex.EncodeToString(batchHash[:]))

		if err := processing.Enqueue(app, processing.EnqueueRequest{
			JobType:   processing.JobTypeChunkEmbedSubmit,
			DedupeKey: dedupe,
			Payload: map[string]any{
				"chunk_ids": chunkIDs,
			},
			UserID:   userID,
			UploadID: uploadID,
		}); err != nil {
			return err
		}
	}

	return nil
}
