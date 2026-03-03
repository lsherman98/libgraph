package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_85348442")
		if err != nil {
			return err
		}

		// add field
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

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_85348442")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation2766269861")

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
				"page.persist",
				"chunk.generate",
				"upload.summarize",
				"page.summarize",
				"chunk.embed"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
