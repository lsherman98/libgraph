package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_121766130")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"hidden": false,
			"id": "bool3625246891",
			"name": "is_summary",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_121766130")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("bool3625246891")

		return app.Save(collection)
	})
}
