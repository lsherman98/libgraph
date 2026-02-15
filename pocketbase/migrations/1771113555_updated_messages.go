package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2605467279")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"cascadeDelete": false,
			"collectionId": "_pb_users_auth_",
			"hidden": false,
			"id": "relation2375276105",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "user",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"hidden": false,
			"id": "select1466534506",
			"maxSelect": 1,
			"name": "role",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"user",
				"assistant"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2605467279")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation2375276105")

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"hidden": false,
			"id": "select1466534506",
			"maxSelect": 1,
			"name": "role",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"user",
				"assistant"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
