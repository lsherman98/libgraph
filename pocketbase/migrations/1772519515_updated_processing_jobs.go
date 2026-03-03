package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_85348442")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_BBuFBrEqm2` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (` + "`" + `dedupe_key` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_lOrIp1i0yh` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `scheduled_at` + "`" + `,\n  ` + "`" + `priority` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_MErOmtfYbr` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `lease_until` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_uD4l8ixESv` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `upload` + "`" + `,\n  ` + "`" + `job_type` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(17, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_121766130",
			"hidden": false,
			"id": "relation398321183",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "upload",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(18, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_3446931122",
			"hidden": false,
			"id": "relation336246304",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "page",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(19, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_392403009",
			"hidden": false,
			"id": "relation2500227374",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "chunk",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_85348442")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": []
		}`), &collection); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation398321183")

		// remove field
		collection.Fields.RemoveById("relation336246304")

		// remove field
		collection.Fields.RemoveById("relation2500227374")

		return app.Save(collection)
	})
}
