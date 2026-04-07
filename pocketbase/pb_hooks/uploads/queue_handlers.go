package uploads

import (
	"crypto/sha1"
	"encoding/hex"
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
	if err := validateDurationLimit(upload); err != nil {
		return nil, err
	}

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
	transcript := upload.GetString("transcript_file")
	if transcript == "" {
		return "", nil
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()

	transcriptPath := upload.BaseFilesPath() + "/" + transcript
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

	ext := strings.ToLower(filepath.Ext(transcript))
	if ext == ".md" || ext == ".markdown" {
		return text, nil
	}

	return mistral.FormatPlainTranscriptMarkdown(text), nil
}

func getPagesFromDocument(app core.App, upload *core.Record) ([]*core.Record, error) {
	title := upload.GetString("title")
	docParser := parser.New(app)
	pagesCollection, _ := app.FindCollectionByNameOrId(collections.Pages)

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
		newPage.Set("markdown", f.Name)
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

func createPageRecord(app core.App, upload *core.Record, pageNumber int, filename string, markdown string) (*core.Record, error) {
	pagesCollection, _ := app.FindCollectionByNameOrId(collections.Pages)

	newPage := core.NewRecord(pagesCollection)
	newPage.Set("upload", upload.Id)
	newPage.Set("page", pageNumber)
	newPage.Set("user", upload.GetString("user"))

	f, err := filesystem.NewFileFromBytes([]byte(markdown), filename)
	if err != nil {
		return nil, err
	}

	newPage.Set("markdown", f.Name)
	newPage.Set("markdown", f)
	if err := app.Save(newPage); err != nil {
		return nil, err
	}
	return newPage, nil
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

		record := core.NewRecord(chunksCollection)
		record.Set("upload", job.GetString("upload"))
		record.Set("page", job.GetString("page"))
		record.Set("page_number", payload.PageNumber)
		record.Set("chunk_index", chunkIndex)
		record.Set("content", content)
		record.Set("user", job.GetString("user"))
		err := app.Save(record)
		if err != nil {
			return err
		}

		chunkIndex++
	}

	if hasPendingChunkJobs(app, job.GetString("upload"), job.Id) {
		return nil
	}

	return enqueueEmbedJob(app, job.GetString("upload"), job.GetString("user"))
}

func hasPendingChunkJobs(app core.App, uploadID string, currentJobID string) bool {
	records, err := app.FindRecordsByFilter(
		collections.Queue,
		"upload = {:uploadId} && job_type = {:jobType} && (status = 'queued' || status = 'running') && id != {:jobId}",
		"",
		1,
		0,
		dbx.Params{"uploadId": uploadID, "jobType": processing.JobTypeChunkGenerate, "jobId": currentJobID},
	)
	if err != nil {
		return false
	}

	return len(records) > 0
}

func enqueueEmbedJob(app core.App, uploadID string, userID string) error {
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
