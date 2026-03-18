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
				"CREATE UNIQUE INDEX ` + "`" + `idx_BBuFBrEqm2` + "`" + ` ON ` + "`" + `queue` + "`" + ` (` + "`" + `dedupe_key` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_lOrIp1i0yh` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `scheduled_at` + "`" + `,\n  ` + "`" + `priority` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_MErOmtfYbr` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `lease_until` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_uD4l8ixESv` + "`" + ` ON ` + "`" + `queue` + "`" + ` (\n  ` + "`" + `upload` + "`" + `,\n  ` + "`" + `job_type` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)"
			],
			"name": "queue"
		}`), &collection); err != nil {
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
				"CREATE UNIQUE INDEX ` + "`" + `idx_BBuFBrEqm2` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (` + "`" + `dedupe_key` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_lOrIp1i0yh` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `scheduled_at` + "`" + `,\n  ` + "`" + `priority` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_MErOmtfYbr` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `lease_until` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)",
				"CREATE INDEX ` + "`" + `idx_uD4l8ixESv` + "`" + ` ON ` + "`" + `processing_jobs` + "`" + ` (\n  ` + "`" + `upload` + "`" + `,\n  ` + "`" + `job_type` + "`" + `,\n  ` + "`" + `status` + "`" + `\n)"
			],
			"name": "processing_jobs"
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
