package crons

import (
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/pocketbase/pocketbase"
)

func Init(app *pocketbase.PocketBase) error {
	app.Cron().MustAdd("recoverEmbeddingPollJobs", "*/5 * * * *", func() {
		vector_search.EnqueuePendingPollJobs(app, 200)
	})

	app.Cron().MustAdd("cleanupOrphanedEmbeddings", "0 2 * * *", func() {
		stmt := fmt.Sprintf(
			"DELETE FROM %s WHERE id NOT IN (SELECT vector_id FROM document_chunks WHERE vector_id IS NOT NULL AND vector_id != 0)",
			collections.DocumentChunksEmbeddings,
		)
		app.DB().NewQuery(stmt).Execute()
	})

	return nil
}
