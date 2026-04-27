package vector_search

import (
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func ensureEmbeddingsTable(app *pocketbase.PocketBase) error {
	stmt := fmt.Sprintf(
		"CREATE VIRTUAL TABLE IF NOT EXISTS %s USING vec0(id INTEGER PRIMARY KEY AUTOINCREMENT, embedding float[%d]);",
		embeddingsTable, embeddingDims,
	)
	if _, err := app.DB().NewQuery(stmt).Execute(); err != nil {
		return err
	}

	if _, err := app.DB().NewQuery("CREATE INDEX IF NOT EXISTS idx_document_chunks_vector_id ON document_chunks(vector_id);").Execute(); err != nil {
		return err
	}

	return nil
}

func deleteEmbeddingForRecord(app *pocketbase.PocketBase, record *core.Record) error {
	vectorID := record.GetInt("vector_id")

	if vectorID == 0 {
		return nil
	}

	stmt := fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)
	_, err := app.DB().NewQuery(stmt).Bind(dbx.Params{
		"id": vectorID,
	}).Execute()

	return err
}

func createEmbeddingJob(app core.App, job *core.Record, providerOperationID string) (*core.Record, error) {
	existing, _ := app.FindFirstRecordByFilter(
		collections.EmbeddingJobs,
		"batch_id = {:batchId}",
		dbx.Params{"batchId": providerOperationID},
	)
	if existing != nil {
		existing.Set("status", "submitted")
		existing.Set("error_message", "")
		if err := app.Save(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	embeddingJobs, _ := app.FindCollectionByNameOrId(collections.EmbeddingJobs)
	embeddingJob := core.NewRecord(embeddingJobs)
	embeddingJob.Set("job", job.Id)
	embeddingJob.Set("upload", job.GetString("upload"))
	embeddingJob.Set("page", job.GetString("page"))
	embeddingJob.Set("user", job.GetString("user"))
	embeddingJob.Set("batch_id", providerOperationID)
	embeddingJob.Set("status", "submitted")
	if err := app.Save(embeddingJob); err != nil {
		raceExisting, findErr := app.FindFirstRecordByFilter(
			collections.EmbeddingJobs,
			"batch_id = {:batchId}",
			dbx.Params{"batchId": providerOperationID},
		)
		if findErr == nil && raceExisting != nil {
			raceExisting.Set("status", "submitted")
			raceExisting.Set("error_message", "")
			if saveErr := app.Save(raceExisting); saveErr != nil {
				return nil, saveErr
			}
			return raceExisting, nil
		}
		return nil, err
	}

	return embeddingJob, nil
}

func loadChunkRecords(app core.App, chunkIDs []string) ([]*core.Record, error) {
	chunks := make([]*core.Record, 0, len(chunkIDs))
	for _, id := range chunkIDs {
		chunk, err := app.FindRecordById(collections.DocumentChunks, id)
		if err != nil {
			return nil, err
		}

		chunks = append(chunks, chunk)
	}

	return chunks, nil
}

func recoverChunkIDsForEmbeddingJob(app core.App, embeddingJob *core.Record) []string {
	submitJobID := embeddingJob.GetString("job")
	if submitJobID == "" {
		return nil
	}

	submitJob, err := app.FindRecordById(collections.Queue, submitJobID)
	if err != nil {
		return nil
	}

	payload := EmbedPayload{}
	if err := submitJob.UnmarshalJSONField("payload", &payload); err != nil {
		return nil
	}

	return payload.ChunkIDs
}
