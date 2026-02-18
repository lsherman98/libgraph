package chat

import (
	"encoding/json"
	"net/http"

	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/chat", func(e *core.RequestEvent) error {
			body := ChatRequest{}
			if err := e.BindBody(&body); err != nil {
				app.Logger().Error("[chat] failed to bind request body", "error", err)
				return e.BadRequestError("invalid request body", err)
			}

			app.Logger().Info("[chat] incoming request",
				"mode", body.Mode,
				"message", body.Message,
				"chatID", body.ChatID,
				"hasFilters", body.Filters != nil,
				"hasLLMParams", body.LLMParameters != nil,
				"hasRetrievalParams", body.RetrievalParameters != nil,
			)

			if body.Message == "" {
				return e.BadRequestError("message is required", nil)
			}

			userID := e.Auth.Id

			if body.Mode == "" {
				body.Mode = "chat"
			}

			llamaClient, err := llama.New(app)
			if err != nil {
				return e.InternalServerError("failed to initialize client", err)
			}

			var searchFilters *llama.SearchFilters
			if body.Filters != nil {
				app.Logger().Info("[chat] building search filters",
					"tags", body.Filters.Tags,
					"people", body.Filters.People,
					"publications", body.Filters.Publications,
					"topics", body.Filters.Topics,
					"uploads", body.Filters.Uploads,
					"collections", body.Filters.Collections,
					"types", body.Filters.Types,
					"condition", body.Filters.Condition,
				)
				searchFilters = buildSearchFilters(app, body.Filters)
			}

			if searchFilters != nil {
				filtersJSON, _ := json.Marshal(searchFilters)
				app.Logger().Info("[chat] resolved search filters", "filters", string(filtersJSON))
			} else {
				app.Logger().Info("[chat] no search filters applied")
			}

			chatID := body.ChatID
			if chatID == "" {
				title := body.Message
				if len(title) > 80 {
					title = title[:80] + "…"
				}

				if body.Mode == "search" {
					title = "Search: " + title
				}

				chatsCollection, err := app.FindCollectionByNameOrId("chats")
				if err != nil {
					return e.InternalServerError("failed to find chats collection", err)
				}

				chatRecord := core.NewRecord(chatsCollection)
				chatRecord.Set("title", title)
				chatRecord.Set("user", userID)
				chatRecord.Set("type", body.Mode)
				if err := app.Save(chatRecord); err != nil {
					return e.InternalServerError("failed to create chat", err)
				}

				chatID = chatRecord.Id
			}

			history, err := loadChatHistory(app, chatID)
			if err != nil {
				app.Logger().Error("failed to load chat history", "error", err)
				return e.InternalServerError("failed to load chat history", err)
			}

			messages := make([]llama.Message, 0, len(history)+1)
			for _, msg := range history {
				messages = append(messages, llama.Message{
					ClassName: "base_component",
					Role:      msg.Role,
					Content:   msg.Content,
				})
			}

			messages = append(messages, llama.Message{
				ClassName: "base_component",
				Role:      "user",
				Content:   body.Message,
			})

			userMsgID, err := saveMessage(app, chatID, userID, "user", body.Message, nil)
			if err != nil {
				return e.InternalServerError("failed to save user message", err)
			}

			if body.Mode == "search" {
				retrievalParams := buildRetrievalParams(body.RetrievalParameters, searchFilters)
				retrieveReq := retrieveRequestFromParams(body.Message, retrievalParams)

				resp, err := llamaClient.Retrieve(retrieveReq)
				if err != nil {
					app.Logger().Error("[chat/search] retrieve request failed", "error", err)
					return e.InternalServerError("search request failed", err)
				}

				sources := sourcesFromNodes(resp.Nodes)

				assistantMsgID, err := saveMessage(app, chatID, userID, "assistant", "", sources)
				if err != nil {
					return e.InternalServerError("failed to save assistant message", err)
				}

				return e.JSON(http.StatusOK, ChatResponse{
					ChatID:             chatID,
					Sources:            sources,
					UserMessageID:      userMsgID,
					AssistantMessageID: assistantMsgID,
				})
			}

			modelName := "GPT_4O_MINI"
			temperature := 0.1
			useCitation := true
			llmParams := llama.LLMParameters{
				ClassName:   "base_component",
				ModelName:   modelName,
				Temperature: temperature,
				UseCitation: useCitation,
			}

			if body.LLMParameters != nil {
				lp := body.LLMParameters
				if lp.ModelName != "" {
					llmParams.ModelName = lp.ModelName
				}
				if lp.SystemPrompt != "" {
					llmParams.SystemPrompt = lp.SystemPrompt
				}
				if lp.Temperature != nil {
					llmParams.Temperature = *lp.Temperature
				}
				if lp.UseChainOfThoughtReasoning != nil {
					llmParams.UseChainOfThoughtReasoning = *lp.UseChainOfThoughtReasoning
				}
				if lp.UseCitation != nil {
					llmParams.UseCitation = *lp.UseCitation
				}
			}

			retrievalParams := buildRetrievalParams(body.RetrievalParameters, searchFilters)

			chatReq := &llama.ChatRequestBody{
				ClassName: "base_component",
				Data: llama.ChatData{
					ClassName:           "base_component",
					LLMParameters:       llmParams,
					RetrievalParameters: retrievalParams,
				},
				Messages: messages,
			}

			resp, err := llamaClient.Chat(chatReq)
			if err != nil {
				app.Logger().Error("Chat request failed:", "error", err)
				return e.InternalServerError("chat request failed", err)
			}

			sources := sourcesFromNodes(resp.Nodes)

			assistantMsgID, err := saveMessage(app, chatID, userID, "assistant", resp.Response, sources)
			if err != nil {
				return e.InternalServerError("failed to save assistant message", err)
			}

			return e.JSON(http.StatusOK, ChatResponse{
				ChatID:             chatID,
				Message:            resp.Response,
				Sources:            sources,
				UserMessageID:      userMsgID,
				AssistantMessageID: assistantMsgID,
			})
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	return nil
}

func loadChatHistory(app *pocketbase.PocketBase, chatID string) ([]ChatMessage, error) {
	records, err := app.FindRecordsByFilter(
		"messages",
		"chat = {:chatId}",
		"created",
		0,
		0,
		dbx.Params{"chatId": chatID},
	)
	if err != nil {
		return nil, err
	}

	messages := make([]ChatMessage, 0, len(records))
	for _, r := range records {
		messages = append(messages, ChatMessage{
			Role:    r.GetString("role"),
			Content: r.GetString("content"),
		})
	}
	return messages, nil
}

func saveMessage(app *pocketbase.PocketBase, chatID, userID, role, content string, sources []ChatSource) (string, error) {
	messagesCollection, err := app.FindCollectionByNameOrId("messages")
	if err != nil {
		return "", err
	}

	record := core.NewRecord(messagesCollection)
	record.Set("chat", chatID)
	record.Set("user", userID)
	record.Set("role", role)
	record.Set("content", content)

	if sources != nil {
		sourcesJSON, err := json.Marshal(sources)
		if err != nil {
			return "", err
		}
		record.Set("sources", string(sourcesJSON))
	}

	if err := app.Save(record); err != nil {
		return "", err
	}

	return record.Id, nil
}

func buildRetrievalParams(rp *RetrievalParamsInput, searchFilters *llama.SearchFilters) llama.RetrievalParameters {
	denseSimilarityTopK := 10
	enableReranking := true
	rerankTopN := 5

	params := llama.RetrievalParameters{
		ClassName:           "base_component",
		DenseSimilarityTopK: &denseSimilarityTopK,
		EnableReranking:     &enableReranking,
		RerankTopN:          &rerankTopN,
		RetrievalMode:       "chunks",
		SearchFilters:       searchFilters,
	}

	if rp != nil {
		if rp.Alpha != nil {
			params.Alpha = rp.Alpha
		}
		if rp.DenseSimilarityCutoff != nil {
			params.DenseSimilarityCutoff = rp.DenseSimilarityCutoff
		}
		if rp.DenseSimilarityTopK != nil {
			params.DenseSimilarityTopK = rp.DenseSimilarityTopK
		}
		if rp.EnableReranking != nil {
			params.EnableReranking = rp.EnableReranking
		}
		if rp.FilesTopK != nil {
			params.FilesTopK = rp.FilesTopK
		}
		if rp.RerankTopN != nil {
			params.RerankTopN = rp.RerankTopN
		}
		if rp.RetrievalMode != "" {
			params.RetrievalMode = rp.RetrievalMode
		}
		if rp.RetrievePageFigureNodes != nil {
			params.RetrievePageFigureNodes = rp.RetrievePageFigureNodes
		}
		if rp.RetrievePageScreenshotNodes != nil {
			params.RetrievePageScreenshotNodes = rp.RetrievePageScreenshotNodes
		}
		if rp.SparseSimilarityTopK != nil {
			params.SparseSimilarityTopK = rp.SparseSimilarityTopK
		}
	}

	return params
}

func retrieveRequestFromParams(query string, params llama.RetrievalParameters) *llama.RetrieveRequestBody {
	return &llama.RetrieveRequestBody{
		ClassName:                   params.ClassName,
		Query:                       query,
		Alpha:                       params.Alpha,
		DenseSimilarityCutoff:       params.DenseSimilarityCutoff,
		DenseSimilarityTopK:         params.DenseSimilarityTopK,
		EnableReranking:             params.EnableReranking,
		FilesTopK:                   params.FilesTopK,
		RerankTopN:                  params.RerankTopN,
		RetrievalMode:               params.RetrievalMode,
		RetrievePageFigureNodes:     params.RetrievePageFigureNodes,
		RetrievePageScreenshotNodes: params.RetrievePageScreenshotNodes,
		SearchFilters:               params.SearchFilters,
		SparseSimilarityTopK:        params.SparseSimilarityTopK,
	}
}

func mapSourceMetadata(m *llama.NodeMetadata, source *ChatSource) {
	if m == nil {
		return
	}
	source.UploadID = m.UploadID
	source.ExternalFileID = m.ExternalFileID
	source.Title = m.Title
	source.StartCharIdx = m.StartCharIdx
	source.EndCharIdx = m.EndCharIdx
	if m.PageNumber != nil && m.PageNumber.Set {
		source.PageNumber = m.PageNumber.Value
	} else if m.PageLabel != nil && m.PageLabel.Set {
		source.PageNumber = m.PageLabel.Value
	} else if m.PageNum != nil && m.PageNum.Set {
		source.PageNumber = m.PageNum.Value
	}
}

func sourcesFromNodes(nodes []llama.NodeInfo) []ChatSource {
	sources := make([]ChatSource, 0, len(nodes))
	for _, node := range nodes {
		source := ChatSource{
			Score:  node.Score,
			Text:   node.Text,
			NodeID: node.ID,
		}
		mapSourceMetadata(node.Metadata, &source)
		sources = append(sources, source)
	}
	return sources
}

func buildSearchFilters(app *pocketbase.PocketBase, filters *MetadataFilters) *llama.SearchFilters {
	var filterList []llama.SearchFilter

	if len(filters.Collections) > 0 {
		for _, collectionId := range filters.Collections {
			record, err := app.FindRecordById("collections", collectionId)
			if err != nil {
				app.Logger().Error("Failed to resolve collection", "id", collectionId, "error", err)
				continue
			}
			uploadIds := record.GetStringSlice("uploads")
			for _, uid := range uploadIds {
				filters.Uploads = append(filters.Uploads, uid)
			}
		}
	}

	for _, tag := range filters.Tags {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "tag_id",
			Operator: "==",
			Value:    tag,
		})
	}

	for _, person := range filters.People {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "person_id",
			Operator: "==",
			Value:    person,
		})
	}

	for _, pub := range filters.Publications {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "publication_id",
			Operator: "==",
			Value:    pub,
		})
	}

	for _, t := range filters.Types {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "type",
			Operator: "==",
			Value:    t,
		})
	}

	for _, topic := range filters.Topics {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "topic_id",
			Operator: "==",
			Value:    topic,
		})
	}

	for _, upload := range filters.Uploads {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "upload_id",
			Operator: "==",
			Value:    upload,
		})
	}

	if len(filterList) == 0 {
		return nil
	}

	condition := "or"
	if filters.Condition == "and" {
		condition = "and"
	}

	return &llama.SearchFilters{
		Condition: condition,
		Filters:   filterList,
	}
}
