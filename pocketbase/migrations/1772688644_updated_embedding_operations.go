package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2956699289")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_2E5iVYGGjs` + "`" + ` ON ` + "`" + `embedding_jobs` + "`" + ` (` + "`" + `provider_operation_id` + "`" + `)"
			],
			"name": "embedding_jobs"
		}`), &collection); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation336246304")

		// remove field
		collection.Fields.RemoveById("text2462348188")

		// remove field
		collection.Fields.RemoveById("text3616895705")

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(19, []byte(`{
			"hidden": false,
			"id": "bool4161491668",
			"name": "batch",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_85348442",
			"hidden": false,
			"id": "relation1048988677",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "job",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2956699289")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_2E5iVYGGjs` + "`" + ` ON ` + "`" + `embedding_operations` + "`" + ` (` + "`" + `provider_operation_id` + "`" + `)"
			],
			"name": "embedding_operations"
		}`), &collection); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
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
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text2462348188",
			"max": 0,
			"min": 0,
			"name": "provider",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text3616895705",
			"max": 0,
			"min": 0,
			"name": "model",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("bool4161491668")

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_85348442",
			"hidden": false,
			"id": "relation1048988677",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "processing_job",
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
