package full_text_search

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// https://www.sqlite.org/fts5.html#external_content_tables
func Init(app *pocketbase.PocketBase, collections ...string) error {
	app.OnCollectionAfterDeleteSuccess().BindFunc(func(e *core.CollectionEvent) error {
		target := e.Collection.Name
		for _, col := range collections {
			if col == target {
				if err := deleteCollection(app, target); err != nil {
					app.Logger().Error("failed to clean up FTS table after collection delete", "collection", target, "error", err)
				}
			}
		}
		return e.Next()
	})

	app.OnCollectionAfterUpdateSuccess().BindFunc(func(e *core.CollectionEvent) error {
		target := e.Collection.Name
		for _, col := range collections {
			if col == target {
				if err := deleteCollection(app, target); err != nil {
					app.Logger().Error("failed to delete FTS table on collection update", "collection", target, "error", err)
					return err
				}
				if err := createCollectionFts(app, target); err != nil {
					app.Logger().Error("failed to create FTS table on collection update", "collection", target, "error", err)
					return err
				}
			}
		}
		return e.Next()
	})

	app.OnCollectionDeleteRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
		target := e.Collection.Name
		for _, col := range collections {
			if col == target {
				if err := deleteCollection(app, target); err != nil {
					app.Logger().Error("failed to delete FTS table on collection delete request", "collection", target, "error", err)
					return err
				}
			}
		}
		return e.Next()
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		for _, target := range collections {
			if err := createCollectionFts(app, target); err != nil {
				app.Logger().Error("failed to create FTS table on serve", "collection", target, "error", err)
				return err
			}
		}

		se.Router.GET("/api/collections/{collectionIdOrName}/records/full-text-search", func(e *core.RequestEvent) error {
			target := e.Request.PathValue("collectionIdOrName")

			if _, err := app.FindCollectionByNameOrId(target); err != nil {
				return e.BadRequestError("collection not found", err)
			}
			tbl := target
			q := e.Request.URL.Query().Get("search")
			if q == "" {
				return e.NoContent(204)
			}

			uploadFilter := e.Request.URL.Query().Get("upload")

			processedQuery := processSearchQuery(q)

			var query strings.Builder
			params := dbx.Params{"q": processedQuery}
			query.WriteString("SELECT * ")
			query.WriteString("FROM " + tbl + "_fts ")
			query.WriteString("WHERE " + tbl + "_fts MATCH {:q} ")
			if uploadFilter != "" {
				query.WriteString("AND upload = {:upload} ")
				params["upload"] = uploadFilter
			}
			query.WriteString("ORDER BY CAST(page_number AS INTEGER) ASC, CAST(chunk_index AS INTEGER) ASC;")

			results := []dbx.NullStringMap{}
			err := app.DB().
				NewQuery(query.String()).
				Bind(params).
				All(&results)
			if err != nil {
				app.Logger().Error("FTS search query failed", "table", tbl, "error", err)
				return e.InternalServerError("search failed", err)
			}

			e.Response.Header().Set("Content-Type", "application/json")
			items := []map[string]any{}
			for _, result := range results {
				m := make(map[string]any)
				for key := range result {
					val := result[key]
					value, err := val.Value()
					if err != nil || !val.Valid {
						m[key] = nil
					} else {
						m[key] = value
					}
				}
				items = append(items, m)
			}

			e.JSON(200, items)
			return nil
		})

		return se.Next()
	})

	return nil
}

func createCollectionFts(app *pocketbase.PocketBase, target string) error {
	collection, err := app.FindCollectionByNameOrId(target)
	if err != nil {
		return fmt.Errorf("failed to find collection %s: %w", target, err)
	}

	fields := collectionFields(collection, "id", target)
	exists, _ := checkIfTableExists(app, target+"_fts")

	if exists {
		if err := deleteCollection(app, target); err != nil {
			return fmt.Errorf("failed to delete existing FTS table for %s: %w", target, err)
		}
	}

	tbl := "`" + target + "`"
	var stmt strings.Builder
	stmt.WriteString("CREATE VIRTUAL TABLE " + target + "_fts USING FTS5 (")
	stmt.WriteString("  " + strings.Join(fields, ", ") + ",")
	stmt.WriteString("  content=" + target + ",")
	stmt.WriteString(");")
	if _, err := app.DB().NewQuery(stmt.String()).Execute(); err != nil {
		return fmt.Errorf("failed to create FTS table for %s: %w", target, err)
	}

	stmt.Reset()
	stmt.WriteString("CREATE TRIGGER  " + target + "_fts_insert AFTER INSERT ON " + tbl + " BEGIN ")
	stmt.WriteString("  INSERT INTO " + target + "_fts(" + strings.Join(fields, ", ") + ")")
	stmt.WriteString("  VALUES (" + strings.Join(surround(fields, "new.", ""), ", ") + ");")
	stmt.WriteString("END;")
	if _, err := app.DB().NewQuery(stmt.String()).Execute(); err != nil {
		return fmt.Errorf("failed to create FTS insert trigger for %s: %w", target, err)
	}

	stmt.Reset()
	stmt.WriteString("CREATE TRIGGER  " + target + "_fts_update AFTER UPDATE ON " + tbl + " BEGIN ")
	stmt.WriteString("  INSERT INTO " + target + "_fts(" + target + "_fts, " + strings.Join(fields, ", ") + ")")
	stmt.WriteString("  VALUES ('delete', " + strings.Join(surround(fields, "old.", ""), ", ") + ");")
	stmt.WriteString("  INSERT INTO " + target + "_fts(" + strings.Join(fields, ", ") + ")")
	stmt.WriteString("  VALUES (" + strings.Join(surround(fields, "new.", ""), ", ") + ");")
	stmt.WriteString("END;")
	if _, err := app.DB().NewQuery(stmt.String()).Execute(); err != nil {
		return fmt.Errorf("failed to create FTS update trigger for %s: %w", target, err)
	}

	stmt.Reset()
	stmt.WriteString("CREATE TRIGGER  " + target + "_fts_delete AFTER DELETE ON " + tbl + " BEGIN ")
	stmt.WriteString("  INSERT INTO " + target + "_fts(" + target + "_fts, " + strings.Join(fields, ", ") + ")")
	stmt.WriteString("  VALUES ('delete', " + strings.Join(surround(fields, "old.", ""), ", ") + ");")
	stmt.WriteString("END;")
	if _, err := app.DB().NewQuery(stmt.String()).Execute(); err != nil {
		return fmt.Errorf("failed to create FTS delete trigger for %s: %w", target, err)
	}

	err = syncCollection(app, target)
	if err != nil {
		return fmt.Errorf("failed to sync FTS for %s: %w", target, err)
	}

	return nil
}

func deleteCollection(app *pocketbase.PocketBase, target string) error {
	triggers := []string{
		target + "_fts_insert",
		target + "_fts_update",
		target + "_fts_delete",
	}

	for _, trigger := range triggers {
		if _, err := app.DB().
			NewQuery("DROP TRIGGER IF EXISTS " + trigger + ";").
			Execute(); err != nil {
			app.Logger().Error("Failed to drop trigger", "trigger", trigger, "error", err)
		}
	}

	if _, err := app.DB().
		NewQuery("DELETE FROM " + target + "_fts;").
		Execute(); err != nil {
		app.Logger().Error("Failed to delete FTS table data", "table", target+"_fts", "error", err)
	}

	if _, err := app.DB().
		NewQuery("DROP TABLE IF EXISTS " + target + "_fts;").
		Execute(); err != nil {
		app.Logger().Error("Failed to drop FTS table", "table", target+"_fts", "error", err)
		return err
	}

	return nil
}

func checkIfTableExists(app *pocketbase.PocketBase, target string) (bool, error) {
	type Meta struct {
		Name string `db:"name" json:"name"`
	}

	meta := &Meta{}

	stmt := "SELECT name FROM sqlite_master WHERE type='table' AND name = {:table_name};"
	if err := app.DB().NewQuery(stmt).Bind(dbx.Params{"table_name": target}).One(&meta); err != nil {
		return false, nil // Table doesn't exist
	}

	return meta != nil, nil
}

func syncCollection(app *pocketbase.PocketBase, target string) error {
	stmt := "INSERT INTO " + target + "_fts(" + target + "_fts) VALUES('rebuild');"
	if _, err := app.DB().NewQuery(stmt).Execute(); err != nil {
		return fmt.Errorf("FTS rebuild failed for %s: %w", target, err)
	}
	return nil
}

func processSearchQuery(query string) string {
	if query == "" {
		return query
	}

	query = strings.TrimSpace(query)
	terms := strings.Fields(query)
	processedTerms := make([]string, len(terms))
	for i, term := range terms {
		term = strings.ReplaceAll(term, `"`, `""`) // Escape quotes
		processedTerms[i] = `"` + term + `"*`
	}

	return strings.Join(processedTerms, " AND ")
}

func collectionFields(collection *core.Collection, id string, collectionName string) []string {
	fields := []string{}
	if id != "" {
		fields = append(fields, id)
	}

	allowedFieldsMap := map[string]map[string]bool{
		"document_chunks": {
			"content":     true,
			"upload":      true,
			"page_number": true,
			"chunk_index": true,
			"page":        true,
		},
		"uploads": {
			"title": true,
			"file":  true,
			"type":  true,
		},
	}

	if allowed, ok := allowedFieldsMap[collectionName]; ok {
		for _, field := range collection.Fields {
			name := field.GetName()
			if name == id {
				continue
			}
			if allowed[name] {
				fields = append(fields, name)
			}
		}
	} else {
		for _, field := range collection.Fields {
			name := field.GetName()
			if name == id {
				continue
			}
			fields = append(fields, name)
		}
	}

	return fields
}

func surround(items []string, prefix string, suffix string) []string {
	results := []string{}
	for i := 0; i < len(items); i++ {
		item := items[i]
		results = append(results, prefix+item+suffix)
	}
	return results
}
