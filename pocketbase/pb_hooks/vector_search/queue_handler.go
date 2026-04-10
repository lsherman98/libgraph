package vector_search

import (
	"context"
	"fmt"
	"time"

	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/pocketbase/core"
)

func HandleEmbedJob(app core.App, job *core.Record) error {
	payload := EmbedPayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return err
	}

	chunks, err := loadChunkRecords(app, payload.ChunkIDs)
	if err != nil {
		return err
	}
	if len(chunks) == 0 {
		return nil
	}

	return startEmbeddingOperation(app, job, chunks)
}

func startEmbeddingOperation(app core.App, job *core.Record, chunkRecords []*core.Record) error {
	chunks := buildChunks(app, chunkRecords)

	if batchEnabled {
		return runBatchEmbed(app, job, chunks)
	}

	return runBulkEmbed(app, job, chunks)
}

func runBatchEmbed(app core.App, job *core.Record, chunks []Chunk) error {
	model := fmt.Sprintf("models/%s", getEmbeddingModel())
	requests := make([]EmbedContentRequest, len(chunks))

	for i, c := range chunks {
		requests[i] = EmbedContentRequest{
			Request: EmbedRequestPayload{
				Model:    model,
				Content:  Content{Parts: []Part{{Text: c.Content}}},
				TaskType: "RETRIEVAL_DOCUMENT",
				Title:    c.Title,
			},
			Metadata: map[string]any{
				"chunk_id": c.Record.Id,
			},
		}
	}

	batchEmbed, err := postBatchEmbed(context.Background(), requests, getEmbeddingModel())
	if err != nil {
		return err
	}

	embeddingJob, err := createEmbeddingJob(app, job, batchEmbed.Name)
	if err != nil {
		return err
	}

	return enqueuePollJob(app, embeddingJob)
}

func runBulkEmbed(app core.App, job *core.Record, chunks []Chunk) error {
	opID := fmt.Sprintf("sync:%s", job.Id)
	embeddingJob, err := createEmbeddingJob(app, job, opID)
	if err != nil {
		return err
	}

	if err := processBulkChunks(app, chunks); err != nil {
		embeddingJob.Set("status", vars.EmbeddingStatusFailed)
		embeddingJob.Set("error_message", err.Error())
		if err := app.Save(embeddingJob); err != nil {
			return err
		}
		return err
	}

	now := time.Now().UTC()
	embeddingJob.Set("status", vars.EmbeddingStatusSucceeded)
	embeddingJob.Set("finished_at", now)
	if err := app.Save(embeddingJob); err != nil {
		return err
	}

	return nil
}

func processBulkChunks(app core.App, chunks []Chunk) error {
	for start := 0; start < len(chunks); start += bulkSize {
		end := min(start+bulkSize, len(chunks))
		batch := chunks[start:end]

		parts := make([]Part, len(batch))
		for i, chunk := range batch {
			parts[i] = Part{Text: chunk.Content}
		}

		vectors, err := handleBulkEmbed(context.Background(), parts)
		if err != nil {
			return err
		}

		for i := range vectors {
			if err := storeChunkEmbedding(app, batch[i].Record, vectors[i]); err != nil {
				return err
			}
		}

		if len(vectors) < len(batch) {
			return fmt.Errorf("sync bulk embed returned fewer embeddings than requested: got %d, expected %d", len(vectors), len(batch))
		}
	}

	return nil
}

func persistEmbeddingBatchResult(app core.App, chunkRecords []*core.Record, result *BatchEmbedResult) (processed int, failed int, err error) {
	responses := result.Output.getBatchResponses()
	if len(responses) == 0 {
		return 0, len(chunkRecords), fmt.Errorf("batch result has no inline responses")
	}

	processable := min(len(responses), len(chunkRecords))
	for i := range processable {
		resp := responses[i]
		record := chunkRecords[i]

		if resp.Error != nil {
			failed++
			continue
		}
		if resp.Embedding == nil || len(resp.Embedding.Values) == 0 {
			failed++
			continue
		}
		if storeErr := storeChunkEmbedding(app, record, resp.Embedding.Values); storeErr != nil {
			failed++
			continue
		}
		processed++
	}

	if len(responses) < len(chunkRecords) {
		failed += len(chunkRecords) - len(responses)
	}

	return processed, failed, nil
}
