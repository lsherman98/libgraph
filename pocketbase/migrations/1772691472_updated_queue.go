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
				"CREATE UNIQUE INDEX ` + "`" + `idx_BBuFBrEqm2` + "`" + ` ON ` + "`" + `queue` + "`" + ` (` + "`" + `dedupe_key` + "`" + `)"
			]
		}`), &collection); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("number1655102503")

		// remove field
		collection.Fields.RemoveById("number3217549156")

		// remove field
		collection.Fields.RemoveById("number3470954935")

		// remove field
		collection.Fields.RemoveById("date164390390")

		// remove field
		collection.Fields.RemoveById("date35549773")

		// remove field
		collection.Fields.RemoveById("text3188542320")

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"hidden": false,
			"id": "select185737576",
			"maxSelect": 1,
			"name": "job_type",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"chunk.generate",
				"page.summarize",
				"chunk.embed",
				"upload.parse",
				"upload.transcribe"
			]
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"hidden": false,
			"id": "select2063623452",
			"maxSelect": 1,
			"name": "status",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"queued",
				"running",
				"failed",
				"cancelled",
				"success"
			]
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_2956699289",
			"hidden": false,
			"id": "relation2766269861",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "embedding_job",
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
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_BBuFBrEqm2` + "`" + ` ON ` + "`" + `queue` + "`" + ` (` + "`" + `dedupe_key` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_lOrIp1i0yh` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `scheduled_at` + "`" + `,\n  ` + "`" + `priority` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_MErOmtfYbr` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `lease_until` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_uD4l8ixESv` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `upload` + "`" + `,\n  ` + "`" + `job_type` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)"
			]
		}`), &collection); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"hidden": false,
			"id": "number1655102503",
			"max": null,
			"min": null,
			"name": "priority",
			"onlyInt": false,
			"presentable": false,
			"required": true,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
			"hidden": false,
			"id": "number3217549156",
			"max": null,
			"min": null,
			"name": "attempts",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"hidden": false,
			"id": "number3470954935",
			"max": null,
			"min": null,
			"name": "max_attempts",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"hidden": false,
			"id": "date164390390",
			"max": "",
			"min": "",
			"name": "scheduled_at",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"hidden": false,
			"id": "date35549773",
			"max": "",
			"min": "",
			"name": "lease_until",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(15, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text3188542320",
			"max": 0,
			"min": 0,
			"name": "trace_id",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"hidden": false,
			"id": "select185737576",
			"maxSelect": 1,
			"name": "job_type",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"upload.parse_or_transcribe",
				"chunk.generate",
				"page.summarize",
				"chunk.embed",
				"chunk.embed.submit",
				"chunk.embed.poll"
			]
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"hidden": false,
			"id": "select2063623452",
			"maxSelect": 1,
			"name": "status",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"queued",
				"running",
				"succeeded",
				"failed",
				"deadletter",
				"cancelled"
			]
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(20, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_2956699289",
			"hidden": false,
			"id": "relation2766269861",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "embedding_operation",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
