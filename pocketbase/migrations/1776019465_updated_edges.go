package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1961669470")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_19Ztvt6cUB` + "`" + ` ON ` + "`" + `edges` + "`" + ` (` + "`" + `source` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_z12qw6IEaZ` + "`" + ` ON ` + "`" + `edges` + "`" + ` (` + "`" + `target` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_SWhcRdMtMB` + "`" + ` ON ` + "`" + `edges` + "`" + ` (\n  ` + "`" + `user` + "`" + `,\n  ` + "`" + `type` + "`" + `\n)",
				"CREATE UNIQUE INDEX ` + "`" + `idx_gE3cK1NYmJ` + "`" + ` ON ` + "`" + `edges` + "`" + ` (\n  ` + "`" + `source` + "`" + `,\n  ` + "`" + `target` + "`" + `,\n  ` + "`" + `type` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1961669470")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_19Ztvt6cUB` + "`" + ` ON ` + "`" + `edges` + "`" + ` (` + "`" + `source` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_z12qw6IEaZ` + "`" + ` ON ` + "`" + `edges` + "`" + ` (` + "`" + `target` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_SWhcRdMtMB` + "`" + ` ON ` + "`" + `edges` + "`" + ` (\n  ` + "`" + `user` + "`" + `,\n  ` + "`" + `type` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
