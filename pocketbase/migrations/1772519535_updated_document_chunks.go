package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_392403009")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_bBz36OAvhm` + "`" + ` ON ` + "`" + `document_chunks` + "`" + ` (` + "`" + `upload` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_rtS6XzVwLV` + "`" + ` ON ` + "`" + `document_chunks` + "`" + ` (` + "`" + `page` + "`" + `)",
				"CREATE UNIQUE INDEX ` + "`" + `idx_9R1CP46XMq` + "`" + ` ON ` + "`" + `document_chunks` + "`" + ` (\n  ` + "`" + `upload` + "`" + `,\n  ` + "`" + `page` + "`" + `,\n  ` + "`" + `chunk_index` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_392403009")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_bBz36OAvhm` + "`" + ` ON ` + "`" + `document_chunks` + "`" + ` (` + "`" + `upload` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_rtS6XzVwLV` + "`" + ` ON ` + "`" + `document_chunks` + "`" + ` (` + "`" + `page` + "`" + `)"
			]
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
