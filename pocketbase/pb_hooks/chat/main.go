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
	Message string           `json:"message"`
	Mode    string           `json:"mode,omitempty"` // "chat" or "search"
	Filters *MetadataFilters `json:"filters,omitempty"`
	History []ChatMessage    `json:"history,omitempty"`
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
	UploadID   string  `json:"upload_id,omitempty"`
	Title      string  `json:"title,omitempty"`
	Score      float64 `json:"score,omitempty"`
	Text       string  `json:"text,omitempty"`
	PageNumber int     `json:"page_number,omitempty"`
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
				retrieveReq := &llama.RetrieveRequestBody{
					ClassName: "base_component",
					Query:     req.Message,
					RetrievalParameters: llama.RetrievalParameters{
						ClassName:           "base_component",
						DenseSimilarityTopK: 10,
						EnableReranking:     true,
						RerankTopN:          5,
						RetrievalMode:       "chunks",
						SearchFilters:       searchFilters,
					},
				}

				resp, err := llamaClient.Retrieve(retrieveReq)
				if err != nil {
					app.Logger().Error("Retrieve request failed:", "error", err)
					return apis.NewApiError(http.StatusInternalServerError, "Retrieve request failed", err)
				}

				sources := make([]ChatSource, 0)
				for _, sn := range resp.Nodes {
					source := ChatSource{
						Score: sn.Score,
						Text:  sn.Node.Text,
					}
					if sn.Node.Metadata != nil {
						if uploadID, ok := sn.Node.Metadata["upload_id"].(string); ok {
							source.UploadID = uploadID
						}
						if title, ok := sn.Node.Metadata["title"].(string); ok {
							source.Title = title
						}
						if page, ok := sn.Node.Metadata["page_number"].(float64); ok {
							source.PageNumber = int(page)
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

			chatReq := &llama.ChatRequestBody{
				ClassName: "base_component",
				Data: llama.ChatData{
					ClassName: "base_component",
					LLMParameters: llama.LLMParameters{
						ClassName:   "base_component",
						ModelName:   "GPT_4O_MINI",
						Temperature: 0.1,
						UseCitation: true,
					},
					RetrievalParameters: llama.RetrievalParameters{
						ClassName:           "base_component",
						DenseSimilarityTopK: 10,
						EnableReranking:     true,
						RerankTopN:          5,
						RetrievalMode:       "chunks",
						SearchFilters:       searchFilters,
					},
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
				if node.Metadata != nil {
					source := ChatSource{
						Score: node.Score,
					}
					if uploadID, ok := node.Metadata["upload_id"].(string); ok {
						source.UploadID = uploadID
					}
					if title, ok := node.Metadata["title"].(string); ok {
						source.Title = title
					}
					if page, ok := node.Metadata["page_number"].(float64); ok {
						source.PageNumber = int(page)
					}
					sources = append(sources, source)
				}
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
