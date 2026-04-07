package vector_search

import (
	"context"
	"fmt"
	"os"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

func newGeminiClient() (*genai.Client, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY environment variable is not set")
	}
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	return client, nil
}

func embedContent(client *genai.Client, taskType genai.TaskType, title string, parts ...genai.Part) ([]float32, error) {
	ctx := context.Background()
	model := setEmbeddingModel(client)
	model.TaskType = taskType
	if title != "" {
		res, err := model.EmbedContentWithTitle(ctx, title, parts...)
		if err != nil {
			return nil, err
		}
		return res.Embedding.Values, nil
	}
	res, err := model.EmbedContent(ctx, parts...)
	if err != nil {
		return nil, err
	}
	return res.Embedding.Values, nil
}

func setEmbeddingModel(client *genai.Client) *genai.EmbeddingModel {
	return client.EmbeddingModel(getEmbeddingModel())
}

func getEmbeddingModel() string {
	modelName := os.Getenv("GOOGLE_EMBEDDING_MODEL")
	if modelName == "" {
		modelName = "gemini-embedding-001"
	}
	return modelName
}
