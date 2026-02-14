package chat

import (
	"net/http"

	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/chat", func(e *core.RequestEvent) error {
			body := ChatRequest{}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("invalid request body", err)
			}

			if body.Message == "" {
				return e.BadRequestError("message is required", nil)
			}

			llamaClient, err := llama.New(app)
			if err != nil {
				return e.InternalServerError("failed to initialize client", err)
			}

			var searchFilters *llama.SearchFilters
			if body.Filters != nil {
				searchFilters = buildSearchFilters(app, body.Filters)
			}

			if body.Mode == "search" {
				retrievalParams := buildRetrievalParams(body.RetrievalParameters, searchFilters)
				retrieveReq := retrieveRequestFromParams(body.Message, retrievalParams)

				resp, err := llamaClient.Retrieve(retrieveReq)
				if err != nil {
					app.Logger().Error("retrieve request failed:", "error", err)
					return e.InternalServerError("search request failed", err)
				}

				return e.JSON(http.StatusOK, ChatResponse{
					Sources: sourcesFromNodes(resp.Nodes),
				})
			}

			messages := make([]llama.Message, 0, len(body.History)+1)
			for _, msg := range body.History {
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

			return e.JSON(http.StatusOK, ChatResponse{
				Sources: sourcesFromNodes(resp.Nodes),
			})
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	return nil
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
	if m.PageNumber != nil {
		source.PageNumber = *m.PageNumber
	} else if m.PageLabel != nil {
		source.PageNumber = *m.PageLabel
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
