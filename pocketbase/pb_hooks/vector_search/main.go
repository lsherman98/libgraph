package vector_search

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
)

const embeddingDims = 3072
const embeddingsTable = "document_chunks_embeddings"

var client *genai.Client

func Init(app *pocketbase.PocketBase) error {
	var err error
	client, err = createGoogleAiClient()
	if err != nil {
		return fmt.Errorf("vector_search: failed to create Google AI client: %w", err)
	}

	registerQueueHandlers(app)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := ensureEmbeddingsTable(app); err != nil {
			return fmt.Errorf("vector_search: failed to create embeddings table: %w", err)
		}

		se.Router.GET("/api/vector-search/status", func(e *core.RequestEvent) error {
			stats := getEmbeddingStats(app)
			return e.JSON(http.StatusOK, stats)
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	app.OnRecordAfterUpdateSuccess("document_chunks").BindFunc(func(e *core.RecordEvent) error {
		oldContent := e.Record.Original().GetString("content")
		newContent := e.Record.GetString("content")
		if oldContent == newContent {
			return e.Next()
		}

		app.Logger().Info("[vector_search] chunk content updated; scheduling embedding reset",
			"chunk_id", e.Record.Id,
		)

		routine.FireAndForget(func() {
			if err := deleteEmbeddingForRecord(app, e.Record.Original()); err != nil {
				app.Logger().Error("[vector_search] failed to delete old embedding on update", "id", e.Record.Id, "error", err)
			}

			updateStmt := "UPDATE document_chunks SET vector_id = 0 WHERE id = {:chunkId}"
			if _, err := app.DB().NewQuery(updateStmt).Bind(dbx.Params{"chunkId": e.Record.Id}).Execute(); err != nil {
				app.Logger().Error("[vector_search] failed to reset vector_id on update", "id", e.Record.Id, "error", err)
			} else {
				app.Logger().Info("[vector_search] reset vector_id after content update", "chunk_id", e.Record.Id)
			}
		})
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess("document_chunks").BindFunc(func(e *core.RecordEvent) error {
		if err := deleteEmbeddingForRecord(app, e.Record); err != nil {
			app.Logger().Error("[vector_search] failed to delete embedding on delete", "id", e.Record.Id, "error", err)
		}
		return e.Next()
	})

	app.Cron().MustAdd("recoverEmbeddingPollJobs", "*/1 * * * *", func() {
		enqueuePendingEmbeddingPollJobs(app, 200)
	})

	app.Cron().MustAdd("cleanupOrphanedEmbeddings", "0 2 * * *", func() {
		stmt := fmt.Sprintf(
			"DELETE FROM %s WHERE id NOT IN (SELECT vector_id FROM document_chunks WHERE vector_id IS NOT NULL AND vector_id != 0)",
			embeddingsTable,
		)
		result, err := app.DB().NewQuery(stmt).Execute()
		if err != nil {
			app.Logger().Error("[vector_search] failed to cleanup orphaned embeddings", "error", err)
			return
		}

		rowsDeleted, rowsErr := result.RowsAffected()
		if rowsErr != nil {
			app.Logger().Warn("[vector_search] cleaned up orphaned embeddings but failed to determine deleted count", "error", rowsErr)
			return
		}

		app.Logger().Info("[vector_search] cleaned up orphaned embeddings", "deleted_count", rowsDeleted)
	})

	return nil
}

func getEmbeddingStats(app *pocketbase.PocketBase) map[string]any {
	stats := map[string]any{}

	var embResult dbx.NullStringMap
	if err := app.DB().NewQuery(fmt.Sprintf("SELECT COUNT(*) as cnt FROM %s", embeddingsTable)).One(&embResult); err != nil {
		stats["embeddings_count_error"] = err.Error()
	} else if v, err := embResult["cnt"].Value(); err == nil && v != nil {
		stats["embeddings_count"] = fmt.Sprint(v)
	}

	var totalResult dbx.NullStringMap
	if err := app.DB().NewQuery("SELECT COUNT(*) as cnt FROM document_chunks").One(&totalResult); err != nil {
		stats["total_chunks_error"] = err.Error()
	} else if v, err := totalResult["cnt"].Value(); err == nil && v != nil {
		stats["total_chunks"] = fmt.Sprint(v)
	}

	var linkedResult dbx.NullStringMap
	if err := app.DB().NewQuery("SELECT COUNT(*) as cnt FROM document_chunks WHERE vector_id IS NOT NULL AND vector_id != 0").One(&linkedResult); err != nil {
		stats["linked_chunks_error"] = err.Error()
	} else if v, err := linkedResult["cnt"].Value(); err == nil && v != nil {
		stats["chunks_with_embeddings"] = fmt.Sprint(v)
	}

	var missingResult dbx.NullStringMap
	if err := app.DB().NewQuery("SELECT COUNT(*) as cnt FROM document_chunks WHERE vector_id = 0 OR vector_id IS NULL").One(&missingResult); err != nil {
		stats["missing_chunks_error"] = err.Error()
	} else if v, err := missingResult["cnt"].Value(); err == nil && v != nil {
		stats["chunks_missing_embeddings"] = fmt.Sprint(v)
	}

	return stats
}

func Search(app *pocketbase.PocketBase, query string, uploadIDs []string, k int) ([]SearchResult, error) {
	if query == "" {
		return nil, fmt.Errorf("vector_search: query cannot be empty")
	}
	if k <= 0 {
		k = 10
	}

	vector, err := googleAiEmbedContent(client, genai.TaskTypeRetrievalQuery, "", genai.Text(query))
	if err != nil {
		return nil, fmt.Errorf("vector_search: failed to embed query: %w", err)
	}

	jsonVec, err := json.Marshal(vector)
	if err != nil {
		return nil, fmt.Errorf("vector_search: failed to marshal vector: %w", err)
	}

	params := dbx.Params{
		"embedding": string(jsonVec),
	}

	var stmt strings.Builder

	if len(uploadIDs) > 0 {
		placeholders := make([]string, len(uploadIDs))
		for i, uid := range uploadIDs {
			key := fmt.Sprintf("uid%d", i)
			placeholders[i] = "{:" + key + "}"
			params[key] = uid
		}

		stmt.WriteString(fmt.Sprintf(
			"SELECT dc.id, dc.content, dc.upload, dc.page_number, dc.chunk_index, u.title, "+
				"vec_distance_cosine((SELECT e.embedding FROM %s e WHERE e.id = dc.vector_id), {:embedding}) as distance ",
			embeddingsTable,
		))
		stmt.WriteString("FROM document_chunks dc ")
		stmt.WriteString("JOIN uploads u ON dc.upload = u.id ")
		stmt.WriteString("WHERE dc.vector_id IS NOT NULL AND dc.vector_id != 0 ")
		stmt.WriteString("AND dc.upload IN (" + strings.Join(placeholders, ", ") + ") ")
		stmt.WriteString(fmt.Sprintf("ORDER BY distance ASC LIMIT %d;", k))

		app.Logger().Info("[vector_search] filtered search",
			"upload_ids", uploadIDs,
			"k", k,
		)
	} else {
		fmt.Fprintf(&stmt, "SELECT dc.id, sub.distance, dc.content, dc.upload, dc.page_number, dc.chunk_index, u.title FROM (SELECT id, distance FROM %s WHERE embedding MATCH {:embedding} AND k = %d) sub ",
			embeddingsTable, k)
		stmt.WriteString("JOIN document_chunks dc ON dc.vector_id = sub.id ")
		stmt.WriteString("JOIN uploads u ON dc.upload = u.id ")
		stmt.WriteString("ORDER BY sub.distance ASC;")
	}

	finalSQL := stmt.String()

	results := []dbx.NullStringMap{}
	err = app.DB().
		NewQuery(finalSQL).
		Bind(params).
		All(&results)
	if err != nil {
		app.Logger().Error("[vector_search] query execution failed",
			"error", err,
			"filtered", len(uploadIDs) > 0,
			"upload_count", len(uploadIDs),
		)
		return nil, fmt.Errorf("vector_search: query failed: %w", err)
	}

	items := make([]SearchResult, 0, len(results))
	for _, row := range results {
		item := SearchResult{}
		if v, err := row["id"].Value(); err == nil && v != nil {
			item.ChunkID = fmt.Sprint(v)
		}
		if v, err := row["distance"].Value(); err == nil && v != nil {
			switch val := v.(type) {
			case float64:
				item.Distance = val
			case string:
				fmt.Sscanf(val, "%f", &item.Distance)
			}
		}
		if v, err := row["content"].Value(); err == nil && v != nil {
			item.Content = fmt.Sprint(v)
		}
		if v, err := row["upload"].Value(); err == nil && v != nil {
			item.UploadID = fmt.Sprint(v)
		}
		if v, err := row["page_number"].Value(); err == nil && v != nil {
			fmt.Sscanf(fmt.Sprint(v), "%d", &item.PageNumber)
		}
		if v, err := row["chunk_index"].Value(); err == nil && v != nil {
			fmt.Sscanf(fmt.Sprint(v), "%d", &item.ChunkIndex)
		}
		if v, err := row["title"].Value(); err == nil && v != nil {
			item.Title = fmt.Sprint(v)
		}
		items = append(items, item)
	}

	return items, nil
}

func ensureEmbeddingsTable(app *pocketbase.PocketBase) error {
	stmt := fmt.Sprintf(
		"CREATE VIRTUAL TABLE IF NOT EXISTS %s USING vec0(id INTEGER PRIMARY KEY AUTOINCREMENT, embedding float[%d]);",
		embeddingsTable, embeddingDims,
	)
	_, err := app.DB().NewQuery(stmt).Execute()
	if err != nil {
		app.Logger().Error("[vector_search] failed to create/verify embeddings table", "error", err)
	}
	return err
}

func deleteEmbeddingForRecord(app *pocketbase.PocketBase, record *core.Record) error {
	vectorID := record.GetInt("vector_id")
	if vectorID == 0 {
		return nil
	}

	stmt := fmt.Sprintf("DELETE FROM %s WHERE id = {:id}", embeddingsTable)
	_, err := app.DB().NewQuery(stmt).Bind(dbx.Params{
		"id": vectorID,
	}).Execute()

	if err != nil {
		app.Logger().Error("[vector_search] failed to delete embedding", "chunk_id", record.Id, "vector_id", vectorID, "error", err)
	}

	return err
}
