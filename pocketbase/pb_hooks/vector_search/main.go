package vector_search

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

var client *genai.Client

func Init(app *pocketbase.PocketBase) error {
	var err error
	client, err = newGeminiClient()
	if err != nil {
		return err
	}

	batchEnabled = os.Getenv("BATCH") == "true"

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := ensureEmbeddingsTable(app); err != nil {
			return err
		}

		return se.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.DocumentChunks).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteEmbeddingForRecord(app, e.Record); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	return nil
}

func Search(app core.App, query string, uploadIDs []string, k int) ([]SearchResult, error) {
	if query == "" {
		return nil, fmt.Errorf("vector_search: query cannot be empty")
	}

	vector, err := embedContent(client, genai.TaskTypeRetrievalQuery, "", genai.Text(query))
	if err != nil {
		return nil, err
	}

	json, err := json.Marshal(vector)
	if err != nil {
		return nil, err
	}

	params := dbx.Params{
		"embedding": string(json),
	}

	var stmt strings.Builder

	if len(uploadIDs) > 0 {
		placeholders := make([]string, len(uploadIDs))
		for i, uid := range uploadIDs {
			key := fmt.Sprintf("uid%d", i)
			placeholders[i] = "{:" + key + "}"
			params[key] = uid
		}

		fmt.Fprintf(&stmt, "SELECT dc.id, dc.content, dc.upload, dc.page_number, dc.chunk_index, u.title, "+
			"vec_distance_cosine((SELECT e.embedding FROM %s e WHERE e.id = dc.vector_id), {:embedding}) as distance ",
			embeddingsTable)
		stmt.WriteString("FROM document_chunks dc ")
		stmt.WriteString("JOIN uploads u ON dc.upload = u.id ")
		stmt.WriteString("WHERE dc.vector_id IS NOT NULL AND dc.vector_id != 0 ")
		stmt.WriteString("AND dc.upload IN (" + strings.Join(placeholders, ", ") + ") ")
		fmt.Fprintf(&stmt, "ORDER BY distance ASC LIMIT %d;", k)
	} else {
		fmt.Fprintf(&stmt, "WITH sub(id, distance) AS MATERIALIZED (SELECT id, distance FROM %s WHERE embedding MATCH {:embedding} AND k = %d) ", embeddingsTable, k)
		stmt.WriteString("SELECT dc.id, sub.distance, dc.content, dc.upload, dc.page_number, dc.chunk_index, u.title ")
		stmt.WriteString("FROM sub ")
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
