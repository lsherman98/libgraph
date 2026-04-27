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

func Search(app core.App, query string, uploadIDs []string, k int, applyUploadFilter bool, userID string) ([]SearchResult, error) {
	if query == "" {
		return nil, fmt.Errorf("vector_search: query cannot be empty")
	}

	if userID == "" {
		return nil, fmt.Errorf("vector_search: userID is required")
	}

	if applyUploadFilter && len(uploadIDs) == 0 {
		return []SearchResult{}, nil
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
		"userID":    userID,
	}

	var stmt strings.Builder

	placeholders := make([]string, 0, len(uploadIDs))
	if len(uploadIDs) > 0 {
		for i, uid := range uploadIDs {
			key := fmt.Sprintf("uid%d", i)
			placeholders = append(placeholders, "{:"+key+"}")
			params[key] = uid
		}
	}

	// Calculate distance manually by joining document_chunks to vec0 table.
	// This ensures we only load embeddings for the filtered user/uploads,
	// avoiding a full-table scan on the vector table which can be slow for millions of rows.
	stmt.WriteString("SELECT dc.id, vec_distance_cosine(v.embedding, {:embedding}) as distance, dc.content, dc.upload, dc.page_number, dc.chunk_index, u.title ")
	stmt.WriteString("FROM document_chunks dc ")
	stmt.WriteString("JOIN uploads u ON dc.upload = u.id ")
	fmt.Fprintf(&stmt, "JOIN %s v ON v.id = dc.vector_id ", embeddingsTable)
	stmt.WriteString("WHERE u.user = {:userID} AND dc.vector_id IS NOT NULL AND dc.vector_id != 0 AND u.type != 'transcript'")
	if len(uploadIDs) > 0 {
		stmt.WriteString(" AND dc.upload IN (" + strings.Join(placeholders, ", ") + ")")
	}
	fmt.Fprintf(&stmt, " ORDER BY distance ASC LIMIT %d;", k)

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
