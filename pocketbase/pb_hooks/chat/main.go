package chat

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type ChatRequest struct {
	Message             string                `json:"message"`
	Mode                string                `json:"mode,omitempty"` // "chat" or "search"
	Filters             *MetadataFilters      `json:"filters,omitempty"`
	History             []ChatMessage         `json:"history,omitempty"`
	LLMParameters       *LLMParametersInput   `json:"llm_parameters,omitempty"`
	RetrievalParameters *RetrievalParamsInput `json:"retrieval_parameters,omitempty"`
}

type LLMParametersInput struct {
	ModelName                  string   `json:"model_name,omitempty"`
	SystemPrompt               string   `json:"system_prompt,omitempty"`
	Temperature                *float64 `json:"temperature,omitempty"`
	UseChainOfThoughtReasoning *bool    `json:"use_chain_of_thought_reasoning,omitempty"`
	UseCitation                *bool    `json:"use_citation,omitempty"`
}

type RetrievalParamsInput struct {
	Alpha                       *float64 `json:"alpha,omitempty"`
	DenseSimilarityCutoff       *float64 `json:"dense_similarity_cutoff,omitempty"`
	DenseSimilarityTopK         *int     `json:"dense_similarity_top_k,omitempty"`
	EnableReranking             *bool    `json:"enable_reranking,omitempty"`
	FilesTopK                   *int     `json:"files_top_k,omitempty"`
	RerankTopN                  *int     `json:"rerank_top_n,omitempty"`
	RetrievalMode               string   `json:"retrieval_mode,omitempty"`
	RetrievePageFigureNodes     *bool    `json:"retrieve_page_figure_nodes,omitempty"`
	RetrievePageScreenshotNodes *bool    `json:"retrieve_page_screenshot_nodes,omitempty"`
	SparseSimilarityTopK        *int     `json:"sparse_similarity_top_k,omitempty"`
}

type MetadataFilters struct {
	Tags         []string `json:"tags,omitempty"`
	Subjects     []string `json:"subjects,omitempty"`
	Publications []string `json:"publications,omitempty"`
	Types        []string `json:"types,omitempty"`
	Topics       []string `json:"topics,omitempty"`
	Uploads      []string `json:"uploads,omitempty"`
	Collections  []string `json:"collections,omitempty"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	Message string       `json:"message"`
	Sources []ChatSource `json:"sources,omitempty"`
}

type ChatSource struct {
	UploadID       string  `json:"upload_id,omitempty"`
	ExternalFileID string  `json:"external_file_id,omitempty"`
	NodeID         string  `json:"node_id,omitempty"`
	Title          string  `json:"title,omitempty"`
	Score          float64 `json:"score,omitempty"`
	Text           string  `json:"text,omitempty"`
	PageNumber     int     `json:"page_number,omitempty"`
	StartCharIdx   *int    `json:"start_char_idx,omitempty"`
	EndCharIdx     *int    `json:"end_char_idx,omitempty"`
}

func Init(app *pocketbase.PocketBase) error {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/chat", func(e *core.RequestEvent) error {
			// Require authentication
			info, _ := e.RequestInfo()
			if info.Auth == nil {
				return apis.NewUnauthorizedError("Authentication required", nil)
			}

			body, err := io.ReadAll(e.Request.Body)
			if err != nil {
				return apis.NewBadRequestError("Failed to read request body", err)
			}
			defer e.Request.Body.Close()

			var req ChatRequest
			if err := json.Unmarshal(body, &req); err != nil {
				return apis.NewBadRequestError("Invalid request body", err)
			}

			if req.Message == "" {
				return apis.NewBadRequestError("Message is required", nil)
			}

			llamaClient, err := llama.New(app)
			if err != nil {
				app.Logger().Error("Failed to create Llama client:", "error", err)
				return apis.NewApiError(http.StatusInternalServerError, "Failed to initialize chat", err)
			}

			// Build search filters from metadata
			var searchFilters *llama.SearchFilters
			if req.Filters != nil {
				searchFilters = buildSearchFilters(app, req.Filters)
			}

			if req.Mode == "search" {
				// Build flat retrieve request per LlamaIndex search API
				denseSimilarityTopK := 10
				renableReranking := true
				rerankTopN := 5

				retrieveReq := &llama.RetrieveRequestBody{
					ClassName:           "base_component",
					Query:               req.Message,
					DenseSimilarityTopK: &denseSimilarityTopK,
					EnableReranking:     &renableReranking,
					RerankTopN:          &rerankTopN,
					RetrievalMode:       "chunks",
					SearchFilters:       searchFilters,
				}

				// Apply user-provided retrieval parameters
				if req.RetrievalParameters != nil {
					rp := req.RetrievalParameters
					if rp.Alpha != nil {
						retrieveReq.Alpha = rp.Alpha
					}
					if rp.DenseSimilarityCutoff != nil {
						retrieveReq.DenseSimilarityCutoff = rp.DenseSimilarityCutoff
					}
					if rp.DenseSimilarityTopK != nil {
						retrieveReq.DenseSimilarityTopK = rp.DenseSimilarityTopK
					}
					if rp.EnableReranking != nil {
						retrieveReq.EnableReranking = rp.EnableReranking
					}
					if rp.FilesTopK != nil {
						retrieveReq.FilesTopK = rp.FilesTopK
					}
					if rp.RerankTopN != nil {
						retrieveReq.RerankTopN = rp.RerankTopN
					}
					if rp.RetrievalMode != "" {
						retrieveReq.RetrievalMode = rp.RetrievalMode
					}
					if rp.RetrievePageFigureNodes != nil {
						retrieveReq.RetrievePageFigureNodes = rp.RetrievePageFigureNodes
					}
					if rp.RetrievePageScreenshotNodes != nil {
						retrieveReq.RetrievePageScreenshotNodes = rp.RetrievePageScreenshotNodes
					}
					if rp.SparseSimilarityTopK != nil {
						retrieveReq.SparseSimilarityTopK = rp.SparseSimilarityTopK
					}
				}

				resp, err := llamaClient.Retrieve(retrieveReq)
				if err != nil {
					app.Logger().Error("Retrieve request failed:", "error", err)
					return apis.NewApiError(http.StatusInternalServerError, "Retrieve request failed", err)
				}

				sources := make([]ChatSource, 0)
				for _, sn := range resp.Nodes {
					source := ChatSource{
						Score:  sn.Score,
						Text:   sn.Node.Text,
						NodeID: sn.Node.ID_,
					}
					if sn.Node.Metadata != nil {
						if uploadID, ok := sn.Node.Metadata["upload_id"].(string); ok {
							source.UploadID = uploadID
						}
						if extFileID, ok := sn.Node.Metadata["external_file_id"].(string); ok {
							source.ExternalFileID = extFileID
						}
						if title, ok := sn.Node.Metadata["title"].(string); ok {
							source.Title = title
						}
						if page, ok := sn.Node.Metadata["page_number"].(float64); ok {
							source.PageNumber = int(page)
						} else if page, ok := sn.Node.Metadata["page_label"].(float64); ok {
							source.PageNumber = int(page)
						}
						if startIdx, ok := sn.Node.Metadata["start_char_idx"].(float64); ok {
							v := int(startIdx)
							source.StartCharIdx = &v
						}
						if endIdx, ok := sn.Node.Metadata["end_char_idx"].(float64); ok {
							v := int(endIdx)
							source.EndCharIdx = &v
						}
					}
					sources = append(sources, source)
				}

				return e.JSON(http.StatusOK, ChatResponse{
					Message: fmt.Sprintf("Found %d relevant documents.", len(sources)),
					Sources: sources,
				})
			}

			// Convert history to llama format
			messages := make([]llama.Message, 0, len(req.History)+1)
			for _, msg := range req.History {
				messages = append(messages, llama.Message{
					ClassName: "base_component",
					Role:      msg.Role,
					Content:   msg.Content,
				})
			}
			// Add the current user message
			messages = append(messages, llama.Message{
				ClassName: "base_component",
				Role:      "user",
				Content:   req.Message,
			})

			// Build LLM parameters with defaults
			modelName := "GPT_4O_MINI"
			temperature := 0.1
			useCitation := true
			llmParams := llama.LLMParameters{
				ClassName:   "base_component",
				ModelName:   modelName,
				Temperature: temperature,
				UseCitation: useCitation,
			}
			if req.LLMParameters != nil {
				lp := req.LLMParameters
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

			// Build retrieval parameters with defaults
			denseSimilarityTopK := 10
			enableReranking := true
			rerankTopN := 5
			retrievalParams := llama.RetrievalParameters{
				ClassName:           "base_component",
				DenseSimilarityTopK: &denseSimilarityTopK,
				EnableReranking:     &enableReranking,
				RerankTopN:          &rerankTopN,
				RetrievalMode:       "chunks",
				SearchFilters:       searchFilters,
			}
			if req.RetrievalParameters != nil {
				rp := req.RetrievalParameters
				if rp.Alpha != nil {
					retrievalParams.Alpha = rp.Alpha
				}
				if rp.DenseSimilarityCutoff != nil {
					retrievalParams.DenseSimilarityCutoff = rp.DenseSimilarityCutoff
				}
				if rp.DenseSimilarityTopK != nil {
					retrievalParams.DenseSimilarityTopK = rp.DenseSimilarityTopK
				}
				if rp.EnableReranking != nil {
					retrievalParams.EnableReranking = rp.EnableReranking
				}
				if rp.FilesTopK != nil {
					retrievalParams.FilesTopK = rp.FilesTopK
				}
				if rp.RerankTopN != nil {
					retrievalParams.RerankTopN = rp.RerankTopN
				}
				if rp.RetrievalMode != "" {
					retrievalParams.RetrievalMode = rp.RetrievalMode
				}
				if rp.RetrievePageFigureNodes != nil {
					retrievalParams.RetrievePageFigureNodes = rp.RetrievePageFigureNodes
				}
				if rp.RetrievePageScreenshotNodes != nil {
					retrievalParams.RetrievePageScreenshotNodes = rp.RetrievePageScreenshotNodes
				}
				if rp.SparseSimilarityTopK != nil {
					retrievalParams.SparseSimilarityTopK = rp.SparseSimilarityTopK
				}
			}

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
				return apis.NewApiError(http.StatusInternalServerError, "Chat request failed", err)
			}

			// Convert sources
			sources := make([]ChatSource, 0)
			for _, node := range resp.Nodes {
				source := ChatSource{
					Score:  node.Score,
					Text:   node.Text,
					NodeID: node.ID,
				}
				if node.Metadata != nil {
					if uploadID, ok := node.Metadata["upload_id"].(string); ok {
						source.UploadID = uploadID
					}
					if extFileID, ok := node.Metadata["external_file_id"].(string); ok {
						source.ExternalFileID = extFileID
					}
					if title, ok := node.Metadata["title"].(string); ok {
						source.Title = title
					}
					if page, ok := node.Metadata["page_number"].(float64); ok {
						source.PageNumber = int(page)
					} else if page, ok := node.Metadata["page_label"].(float64); ok {
						source.PageNumber = int(page)
					}
					if startIdx, ok := node.Metadata["start_char_idx"].(float64); ok {
						v := int(startIdx)
						source.StartCharIdx = &v
					}
					if endIdx, ok := node.Metadata["end_char_idx"].(float64); ok {
						v := int(endIdx)
						source.EndCharIdx = &v
					}
				}
				sources = append(sources, source)
			}

			return e.JSON(http.StatusOK, ChatResponse{
				Message: resp.Response,
				Sources: sources,
			})
		})

		return se.Next()
	})

	return nil
}

func buildSearchFilters(app *pocketbase.PocketBase, filters *MetadataFilters) *llama.SearchFilters {
	var filterList []llama.SearchFilter

	// Resolve collections into upload IDs
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

	// Add tag filters
	for _, tag := range filters.Tags {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "tag_id",
			Operator: "==",
			Value:    tag,
		})
	}

	// Add subject filters
	for _, subject := range filters.Subjects {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "subject_id",
			Operator: "==",
			Value:    subject,
		})
	}

	// Add publication filters
	for _, pub := range filters.Publications {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "publication_id",
			Operator: "==",
			Value:    pub,
		})
	}

	// Add type filters
	for _, t := range filters.Types {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "type",
			Operator: "==",
			Value:    t,
		})
	}

	// Add topic filters
	for _, topic := range filters.Topics {
		filterList = append(filterList, llama.SearchFilter{
			Key:      "topic_id",
			Operator: "==",
			Value:    topic,
		})
	}

	// Add upload filters
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

	return &llama.SearchFilters{
		Condition: "or",
		Filters:   filterList,
	}
}
