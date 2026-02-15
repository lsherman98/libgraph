package main

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/chat"
	fts "github.com/lsherman98/libgraph/pocketbase/pb_hooks/full_text_search"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/graph"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/uploads"

	// _ "github.com/lsherman98/libgraph/pocketbase/migrations"
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

	if err := graph.Init(app); err != nil {
		log.Fatal("Failed to initialize Graph hooks: ", err)
	}

	if err := chat.Init(app); err != nil {
		log.Fatal("Failed to initialize Chat hooks: ", err)
	}

	if err := fts.Init(app, "document_chunks", "uploads"); err != nil {
		log.Fatal("Failed to initialize Full Text Search: ", err)
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
