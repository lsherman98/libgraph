package uploads

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		// upload := e.Record

		return nil
	})

	return nil
}
