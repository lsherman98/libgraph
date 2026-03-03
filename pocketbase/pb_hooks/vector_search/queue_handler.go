package vector_search

import (
	"context"
	"fmt"
	"strings"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type chunkEmbedPayload struct {
	ChunkID  string   `json:"chunk_id,omitempty"`
	ChunkIDs []string `json:"chunk_ids,omitempty"`
}

func registerQueueHandlers(app *pocketbase.PocketBase) {
	processing.RegisterHandler(processing.JobTypeChunkEmbed, handleChunkEmbedJob)
}

func handleChunkEmbedJob(app *pocketbase.PocketBase, job *core.Record) error {
	payload := chunkEmbedPayload{}
	if err := job.UnmarshalJSONField("payload_json", &payload); err != nil {
		return fmt.Errorf("invalid payload_json: %w", err)
	}

	chunkIDs := make([]string, 0, len(payload.ChunkIDs)+1)
	seen := make(map[string]struct{}, len(payload.ChunkIDs)+1)

	if id := strings.TrimSpace(payload.ChunkID); id != "" {
		seen[id] = struct{}{}
		chunkIDs = append(chunkIDs, id)
	}

	for _, raw := range payload.ChunkIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		chunkIDs = append(chunkIDs, id)
	}

	if len(chunkIDs) == 0 {
		return fmt.Errorf("payload chunk_id or chunk_ids is required")
	}

	return EmbedChunksByID(app, chunkIDs)
}

func EmbedChunkByID(app *pocketbase.PocketBase, chunkID string) error {
	return EmbedChunksByID(app, []string{chunkID})
}

func EmbedChunksByID(app *pocketbase.PocketBase, chunkIDs []string) error {
	if len(chunkIDs) == 0 {
		return fmt.Errorf("at least one chunk id is required")
	}

	records := make([]*core.Record, 0, len(chunkIDs))
	for _, chunkID := range chunkIDs {
		record, err := app.FindRecordById(collections.DocumentChunks, chunkID)
		if err != nil {
			return err
		}
		records = append(records, record)
	}

	chunks := collectChunkRecords(app, records)
	if len(chunks) == 0 {
		return nil
	}

	processed, failed, halted := processBatchEmbeddings(context.Background(), app, chunks, fmt.Sprintf("queue-chunk-embed-batch-%d", len(chunkIDs)))
	if halted {
		return errRateLimited
	}
	if failed > 0 || processed == 0 {
		return fmt.Errorf("embedding failed for chunk batch: processed=%d failed=%d", processed, failed)
	}

	return nil
}
