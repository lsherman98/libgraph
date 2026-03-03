package main

import (
	"database/sql"
	"log"
	"os"
	"strings"

	sqlite_vec "github.com/asg017/sqlite-vec-go-bindings/cgo"
	"github.com/joho/godotenv"
	"github.com/lsherman98/libgraph/pocketbase/parser"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/chat"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/crons"
	fts "github.com/lsherman98/libgraph/pocketbase/pb_hooks/full_text_search"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/graph"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/processing"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/uploads"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/mattn/go-sqlite3"

	_ "github.com/lsherman98/libgraph/pocketbase/migrations"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func init() {
	// Register sqlite-vec BEFORE any database connections are opened.
	// sqlite3_auto_extension only affects connections opened after the call,
	// so this must happen before PocketBase opens its DB.
	sqlite_vec.Auto()

	sql.Register("pb_sqlite3",
		&sqlite3.SQLiteDriver{
			ConnectHook: func(conn *sqlite3.SQLiteConn) error {
				_, err := conn.Exec(`
                    PRAGMA busy_timeout       = 10000;
                    PRAGMA journal_mode       = WAL;
                    PRAGMA journal_size_limit = 200000000;
                    PRAGMA synchronous        = NORMAL;
                    PRAGMA foreign_keys       = ON;
                    PRAGMA temp_store         = MEMORY;
                    PRAGMA cache_size         = -16000;
                `, nil)

				return err
			},
		},
	)

	dbx.BuilderFuncMap["pb_sqlite3"] = dbx.BuilderFuncMap["sqlite3"]
}

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DBConnect: func(dbPath string) (*dbx.DB, error) {
			return dbx.Open("pb_sqlite3", dbPath)
		},
	})

	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// if err := api.Init(app); err != nil {
	// 	log.Fatal("Failed to initialize API hooks: ", err)
	// }

	if err := crons.Init(app); err != nil {
		log.Fatal("Failed to initialize cron jobs: ", err)
	}

	// if err := stripe.Init(app); err != nil {
	// 	log.Fatal("Failed to initialize Stripe hooks: ", err)
	// }

	if err := uploads.Init(app); err != nil {
		log.Fatal("Failed to initialize Uploads hooks: ", err)
	}

	if err := processing.Init(app); err != nil {
		log.Fatal("Failed to initialize Processing queue: ", err)
	}

	if err := vector_search.Init(app); err != nil {
		log.Fatal("Failed to initialize Vector Search: ", err)
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

		// Recover uploads that were stuck in PROCESSING state from a previous crash.
		uploads.RecoverStuckUploads(app)

		return se.Next()
	})

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	parser.CleanupTmp()

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
