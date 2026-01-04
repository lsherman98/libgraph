package crons

import (
	"github.com/pocketbase/pocketbase"
)

func Init(app *pocketbase.PocketBase) error {
	app.Cron().MustAdd("CronJob", "* * * * *", func() {

	})

	return nil
}
