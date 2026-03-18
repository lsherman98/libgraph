package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2956699289")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("number257550243")

		// remove field
		collection.Fields.RemoveById("number3295815537")

		// remove field
		collection.Fields.RemoveById("number328251847")

		// remove field
		collection.Fields.RemoveById("number3217549156")

		// remove field
		collection.Fields.RemoveById("number3470954935")

		// remove field
		collection.Fields.RemoveById("date729074881")

		// remove field
		collection.Fields.RemoveById("date35549773")

		// remove field
		collection.Fields.RemoveById("text1797306934")

		// remove field
		collection.Fields.RemoveById("date830654268")

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2956699289")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"hidden": false,
			"id": "number257550243",
			"max": null,
			"min": null,
			"name": "total_chunks",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"hidden": false,
			"id": "number3295815537",
			"max": null,
			"min": null,
			"name": "succeeded_chunks",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"hidden": false,
			"id": "number328251847",
			"max": null,
			"min": null,
			"name": "failed_chunks",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`{
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
		if err := collection.Fields.AddMarshaledJSONAt(11, []byte(`{
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
		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"hidden": false,
			"id": "date729074881",
			"max": "",
			"min": "",
			"name": "next_poll_at",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(13, []byte(`{
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
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text1797306934",
			"max": 0,
			"min": 0,
			"name": "worker_id",
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
		if err := collection.Fields.AddMarshaledJSONAt(16, []byte(`{
			"hidden": false,
			"id": "date830654268",
			"max": "",
			"min": "",
			"name": "submitted_at",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
