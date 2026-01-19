package main

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/uploads"

	// _ "github.com/lsherman98/pb-template/pocketbase/migrations"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func main() {
	app := pocketbase.New()

	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	// if err := api.Init(app); err != nil {
	// 	log.Fatal("Failed to initialize API hooks: ", err)
	// }

	// if err := crons.Init(app); err != nil {
	// 	log.Fatal("Failed to initialize cron jobs: ", err)
	// }

	// if err := stripe.Init(app); err != nil {
	// 	log.Fatal("Failed to initialize Stripe hooks: ", err)
	// }

	if err := uploads.Init(app); err != nil {
		log.Fatal("Failed to initialize Uploads hooks: ", err)
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), true))
		return se.Next()
	})

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
