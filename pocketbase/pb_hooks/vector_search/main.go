package vector_search

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
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
		return err
	}

	registerQueueHandlers()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := ensureEmbeddingsTable(app); err != nil {
			return err
		}

		return se.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.DocumentChunks).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		oldContent := record.Original().GetString("content")

		newContent := record.GetString("content")

		if oldContent == newContent {
			return e.Next()
		}

		routine.FireAndForget(func() {
			deleteEmbeddingForRecord(app, record.Original())

			updateStmt := "UPDATE document_chunks SET vector_id = 0 WHERE id = {:chunkId}"
			app.DB().NewQuery(updateStmt).Bind(dbx.Params{"chunkId": record.Id}).Execute()
		})
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.DocumentChunks).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		deleteEmbeddingForRecord(app, record)
		return e.Next()
	})

	app.Cron().MustAdd("recoverEmbeddingPollJobs", "*/5 * * * *", func() {
		enqueuePendingEmbeddingPollJobs(app, 200)
	})

	app.Cron().MustAdd("cleanupOrphanedEmbeddings", "0 2 * * *", func() {
		stmt := fmt.Sprintf(
			"DELETE FROM %s WHERE id NOT IN (SELECT vector_id FROM document_chunks WHERE vector_id IS NOT NULL AND vector_id != 0)",
			embeddingsTable,
		)
		app.DB().NewQuery(stmt).Execute()
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
		return nil, err
	}

	jsonVec, err := json.Marshal(vector)
	if err != nil {
		return nil, err
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
		return nil, err
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

	return err
}
