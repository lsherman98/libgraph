package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/vector_search"
	"github.com/lsherman98/libgraph/pocketbase/utils"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

const chatSearchTopK = 10
const searchModeTopK = 10

func Init(app *pocketbase.PocketBase) error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY environment variable is required")
	}

	var err error
	geminiClient, err = genai.NewClient(context.Background(), option.WithAPIKey(apiKey))
	if err != nil {
		return err
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.POST("/api/chat", func(e *core.RequestEvent) error {
			userID := e.Auth.Id

			body := ChatRequest{}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("invalid request body", err)
			}

			if body.Message == "" {
				return e.BadRequestError("message is required", nil)
			}

			var uploadIDs []string
			applyUploadFilter := false
			if body.Filters != nil {
				applyUploadFilter = hasActiveMetadataFilters(body.Filters)
				uploadIDs, err = resolveFilterUploadIDs(e.App, body.Filters, userID)
				if err != nil {
					return e.InternalServerError("failed to resolve filter upload IDs", err)
				}
			}

			chatID := body.ChatID
			if chatID != "" {
				chatRecord, err := e.App.FindRecordById(collections.Chats, chatID)
				if err != nil {
					chatID = ""
				} else if chatRecord.GetString("user") != userID {
					return e.ForbiddenError("chat does not belong to the authenticated user", nil)
				}
			}

			if chatID == "" {
				title := buildChatTitle(body.Message, body.Mode)
				chatsCollection, _ := e.App.FindCollectionByNameOrId(collections.Chats)
				chatRecord := core.NewRecord(chatsCollection)
				chatRecord.Set("title", title)
				chatRecord.Set("user", userID)
				chatRecord.Set("type", persistedChatType(body.Mode))
				if err := e.App.Save(chatRecord); err != nil {
					return e.InternalServerError("failed to create chat", err)
				}
				chatID = chatRecord.Id
			}

			if body.Mode == vars.ChatTypeContext {
				hasContext, err := hasChatContext(e.App, chatID, userID)
				if err != nil {
					return e.InternalServerError("failed to check chat context", err)
				}

				if !hasContext {
					return e.BadRequestError("at least one context item is required", nil)
				}
			}

			userMsgID, err := saveMessage(e.App, chatID, userID, vars.MessageRoleUser, body.Message, nil, "")
			if err != nil {
				return e.InternalServerError("failed to save user message", err)
			}

			payload := ChatPayload{
				ChatID:            chatID,
				Mode:              body.Mode,
				Message:           body.Message,
				UploadIDs:         uploadIDs,
				ApplyUploadFilter: applyUploadFilter,
				UserID:            userID,
				MessageID:         userMsgID,
				Filters:           body.Filters,
			}

			routine.FireAndForget(func() {
				if _, err := processChatResponse(e.App, payload); err != nil {
					e.App.Logger().Error("failed to process chat response", "error", err)
				}
			})

			return e.JSON(http.StatusAccepted, ChatResponse{
				ChatID:    chatID,
				MessageID: userMsgID,
			})
		}).Bind(apis.RequireAuth())

		return se.Next()
	})

	return nil
}

func processChatResponse(app core.App, payload ChatPayload) (string, error) {
	if payload.ChatID == "" || payload.UserID == "" {
		return "", fmt.Errorf("chat payload missing required fields")
	}

	mode := payload.Mode
	if mode == "" {
		mode = vars.ChatTypeChat
	}

	if mode == vars.ChatTypeSearch {
		results, err := vector_search.Search(app, payload.Message, payload.UploadIDs, searchModeTopK, payload.ApplyUploadFilter, payload.UserID)
		if err != nil {
			_, err := persistMessage(app, payload, "Sorry, something went wrong.", nil, "search request failed")
			if err != nil {
				return "", err
			}

			return "", err
		}

		sources := sourcesFromSearchResults(results)
		messageID, err := persistMessage(app, payload, "", sources, "")
		if err != nil {
			return "", err
		}

		return messageID, nil
	}

	if mode == vars.ChatTypeFTS || mode == "full_text" {
		sources, err := searchSourcesByFullText(app, payload.Message, payload.UploadIDs, searchModeTopK, payload.ApplyUploadFilter, payload.UserID)
		if err != nil {
			_, err := persistMessage(app, payload, "Sorry, something went wrong.", nil, "full text search request failed")
			if err != nil {
				return "", err
			}

			return "", err
		}

		messageID, err := persistMessage(app, payload, "", sources, "")
		if err != nil {
			return "", err
		}

		return messageID, nil
	}

	history, err := loadChatHistory(app, payload.ChatID)
	if err != nil {
		_, err := persistMessage(app, payload, "Sorry, I couldn't load the chat history for this response.", nil, "failed to load chat history")
		if err != nil {
			return "", err
		}
		return "", err
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-3.1-flash-lite-preview"
	}

	if mode == vars.ChatTypeContext {
		sidebarContexts, err := loadChatContext(app, payload.ChatID, payload.UserID)
		if err != nil {
			_, err := persistMessage(app, payload, "Sorry, I couldn't load the context for this response.", nil, "failed to load chat context")
			if err != nil {
				return "", err
			}

			return "", err
		}

		if len(sidebarContexts) == 0 {
			messageID, persistErr := persistMessage(app, payload, "Please add at least one context item before sending a message.", nil, "missing sidebar context")
			return messageID, persistErr
		}

		systemPrompt := buildPromptWithSidebarContext(sidebarContexts)
		model := geminiClient.GenerativeModel(modelName)
		model.Temperature = utils.FloatPtr(0.2)
		model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

		cs := model.StartChat()
		cs.History = buildGeminiHistory(history)

		resp, err := cs.SendMessage(context.Background(), genai.Text(payload.Message))
		if err != nil {
			_, err := persistMessage(app, payload, "Sorry, I couldn't complete that response.", nil, "chat request failed")
			if err != nil {
				return "", err
			}

			return "", err
		}

		answer := utils.ExtractResponseText(resp)
		if answer == "" {
			answer = "I couldn't generate a response from the provided context."
		}

		messageID, err := persistMessage(app, payload, answer, nil, "")
		if err != nil {
			return "", err
		}

		return messageID, nil
	}

	isFollowUp := len(history) > 1

	var cachedSources []ChatSource
	if isFollowUp {
		cachedSources, err = loadFirstAssistantSources(app, payload.ChatID)
		if err != nil {
			app.Logger().Error("failed to load cached context", "error", err)
			cachedSources = nil
			err = nil
		}
	}

	var searchResults []vector_search.SearchResult
	var systemPrompt string

	if isFollowUp {
		systemPrompt = buildPromptWithChatSources(cachedSources)
	} else {
		searchResults, err = vector_search.Search(app, payload.Message, payload.UploadIDs, chatSearchTopK, payload.ApplyUploadFilter, payload.UserID)
		if err != nil {
			app.Logger().Error("vector search failed", "error", err)
			searchResults = nil
			err = nil
		}
		systemPrompt = buildPromptWithContext(searchResults)
	}

	model := geminiClient.GenerativeModel(modelName)
	model.Temperature = utils.FloatPtr(0.2)
	model.MaxOutputTokens = utils.Int32Ptr(1800)
	model.ResponseMIMEType = "application/json"
	model.ResponseSchema = getResponseSchema()
	model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

	cs := model.StartChat()
	cs.History = buildGeminiHistory(history)

	resp, err := cs.SendMessage(context.Background(), genai.Text(payload.Message))
	if err != nil {
		_, err := persistMessage(app, payload, "Sorry, I couldn't complete that response.", nil, "chat request failed")
		if err != nil {
			return "", err
		}

		return "", err
	}

	responseText := utils.ExtractResponseText(resp)
	var structured StructuredChatResponse
	if err := json.Unmarshal([]byte(responseText), &structured); err != nil {
		structured = StructuredChatResponse{Answer: responseText}
	}

	var sources []ChatSource
	if isFollowUp {
		sources = buildFollowUpSources(structured.Citations, cachedSources, chatSearchTopK)
	} else {
		sources = buildSourcesForChatResponse(structured.Citations, searchResults, chatSearchTopK)
	}

	if structured.Answer == "" {
		structured.Answer = "I couldn't generate a response from the provided context."
	}

	messageID, err := persistMessage(app, payload, structured.Answer, sources, "")
	if err != nil {
		return "", err
	}

	return messageID, nil
}

func getResponseSchema() *genai.Schema {
	return &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"answer": {
				Type:        genai.TypeString,
				Description: "The complete answer to the user's question, with [citation:chunk_id] markers inline where appropriate",
			},
			"citations": {
				Type:        genai.TypeArray,
				Description: "Array of citations referenced in the answer",
				Items: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"chunk_id": {
							Type:        genai.TypeString,
							Description: "The chunk_id of the source chunk",
						},
						"quote": {
							Type:        genai.TypeString,
							Description: "Optional short quoted snippet from the context when direct quote is used",
						},
						"page_number": {
							Type:        genai.TypeInteger,
							Description: "The page number of the source",
						},
						"upload_id": {
							Type:        genai.TypeString,
							Description: "The upload ID of the source document",
						},
					},
					Required: []string{"chunk_id", "page_number", "upload_id"},
				},
			},
		},
		Required: []string{"answer", "citations"},
	}
}
