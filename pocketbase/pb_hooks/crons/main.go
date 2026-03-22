package crons

import (
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/pocketbase/pocketbase"
)

func Init(app *pocketbase.PocketBase) error {
	app.Cron().MustAdd("recoverHangingProcessingUploads", "*/5 * * * *", func() {
		processing.RecoverHangingProcessingUploads(app)
	})

	return nil
}
