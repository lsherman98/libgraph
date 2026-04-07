package vector_search

import (
	"errors"
	"fmt"
	"os"

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

func isRateLimited(err error) bool {
	return errors.Is(err, errRateLimited)
}

func isBatchEnabled() bool {
	return os.Getenv("BATCH") == "true"
}
