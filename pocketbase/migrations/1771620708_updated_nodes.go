package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_3598433047")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_GNG0evKlIm` + "`" + ` ON ` + "`" + `nodes` + "`" + ` (` + "`" + `record_id` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_Agoksp9XfO` + "`" + ` ON ` + "`" + `nodes` + "`" + ` (\n  ` + "`" + `type` + "`" + `,\n  ` + "`" + `user` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_3598433047")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": []
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
