package vector_search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func (o *BatchOutput) getBatchResponses() []EmbedContentResponse {
	if o == nil || len(o.RawInlined) == 0 || string(o.RawInlined) == "null" {
		return nil
	}

	var responses []EmbedContentResponse
	if err := json.Unmarshal(o.RawInlined, &responses); err == nil && len(responses) > 0 {
		return responses
	}

	return nil
}

func buildChunks(app core.App, records []*core.Record) []Chunk {
	chunks := make([]Chunk, 0, len(records))
	titleCache := make(map[string]string)
	lookupDone := make(map[string]bool)

	for _, record := range records {
		content := record.GetString("content")
		vectorID := record.GetInt("vector_id")
		uploadID := record.GetString("upload")

		if vectorID != 0 || uploadID == "" {
			continue
		}

		title := ""
		if !lookupDone[uploadID] {
			lookupDone[uploadID] = true
			if upload, err := app.FindRecordById(collections.Uploads, uploadID); err == nil {
				uploadTitle := upload.GetString("title")
				titleCache[uploadID] = uploadTitle
			}
		}

		title = titleCache[uploadID]

		chunks = append(chunks, Chunk{
			Record:   record,
			Content:  content,
			Title:    title,
			UploadID: uploadID,
		})
	}

	return chunks
}

func postBatchEmbed(ctx context.Context, requests []EmbedContentRequest, modelName string) (*BatchEmbed, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	url := fmt.Sprintf("%s/models/%s:asyncBatchEmbedContent?key=%s", geminiAPIBase, modelName, apiKey)

	body := BatchEmbedRequest{
		Requests: requests,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w (HTTP 429): %s", errRateLimited, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batch create failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var op BatchEmbed
	if err := json.Unmarshal(respBody, &op); err != nil {
		return nil, err
	}

	return &op, nil
}

func handleBulkEmbed(ctx context.Context, parts []Part) ([][]float32, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	modelName := getEmbeddingModel()

	requests := make([]EmbedContentRequest, len(parts))
	for i, part := range parts {
		requests[i] = EmbedContentRequest{
			Model:    fmt.Sprintf("models/%s", modelName),
			Content:  Content{Parts: []Part{{Text: part.Text}}},
			TaskType: "RETRIEVAL_DOCUMENT",
		}
	}

	vectors := make([][]float32, 0, len(requests))
	for start := 0; start < len(requests); start += bulkSize {
		end := min(start+bulkSize, len(requests))
		chunkVectors, err := postBulkEmbed(ctx, apiKey, modelName, requests[start:end])
		if err != nil {
			return nil, err
		}
		vectors = append(vectors, chunkVectors...)
	}

	return vectors, nil
}

func postBulkEmbed(ctx context.Context, apiKey, modelName string, requests []EmbedContentRequest) ([][]float32, error) {
	url := fmt.Sprintf("%s/models/%s:batchEmbedContents?key=%s", geminiAPIBase, modelName, apiKey)
	body := BatchEmbedRequest{
		Requests: requests,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w (HTTP 429): %s", errRateLimited, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batchEmbedContents failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var parsed BulkEmbedContentResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}

	if len(parsed.Embeddings) == 0 && parsed.Embedding != nil {
		parsed.Embeddings = []EmbedContentResponse{{Embedding: parsed.Embedding}}
	}

	vectors := make([][]float32, 0, len(parsed.Embeddings))
	for _, emb := range parsed.Embeddings {
		if len(emb.Values) > 0 {
			vectors = append(vectors, emb.Values)
			continue
		}
		if emb.Embedding != nil && len(emb.Embedding.Values) > 0 {
			vectors = append(vectors, emb.Embedding.Values)
			continue
		}
		vectors = append(vectors, nil)
	}

	return vectors, nil
}

func getBatchOperation(ctx context.Context, batchId string) (*BatchEmbed, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	url := fmt.Sprintf("%s/%s?key=%s", geminiAPIBase, batchId, apiKey)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("batch status failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var batch BatchEmbed
	if err := json.Unmarshal(respBody, &batch); err != nil {
		return nil, err
	}

	return &batch, nil
}

func getBatchJobStatus(batch *BatchEmbed) (bool, error) {
	isDone := batch.Done ||
		batch.State == "JOB_STATE_SUCCEEDED" ||
		batch.State == "JOB_STATE_FAILED" ||
		batch.State == "JOB_STATE_CANCELLED"

	if !isDone {
		return false, nil
	}

	if batch.Error != nil || batch.State == "JOB_STATE_FAILED" || batch.State == "JOB_STATE_CANCELLED" {
		errMessage := "embedding batch failed"
		if batch.Error != nil && batch.Error.Message != "" {
			errMessage = batch.Error.Message
		}
		return true, fmt.Errorf("%s", errMessage)
	}

	return true, nil
}

func resolveBatchResult(batch *BatchEmbed) (*BatchEmbedResult, error) {
	var result BatchEmbedResult
	if len(batch.Response) > 0 && string(batch.Response) != "null" {
		if err := json.Unmarshal(batch.Response, &result); err == nil && result.Output != nil {
			return &result, nil
		}
	}

	if batch.Output != nil {
		result.Name = batch.Name
		result.State = batch.State
		result.Output = batch.Output
		return &result, nil
	}

	if len(batch.Metadata) > 0 && string(batch.Metadata) != "null" {
		if err := json.Unmarshal(batch.Metadata, &result); err == nil && result.Output != nil {
			return &result, nil
		}
	}

	return nil, fmt.Errorf("batch result is not available")
}

func storeChunkEmbedding(app core.App, record *core.Record, values []float32) error {
	jsonVec, err := json.Marshal(values)
	if err != nil {
		return err
	}

	db := app.NonconcurrentDB()
	insertStmt := fmt.Sprintf("INSERT INTO %s(embedding) VALUES ({:embedding});", embeddingsTable)
	if _, err := db.NewQuery(insertStmt).Bind(dbx.Params{
		"embedding": string(jsonVec),
	}).Execute(); err != nil {
		return err
	}

	var idRow dbx.NullStringMap
	if err := db.NewQuery("SELECT last_insert_rowid() AS id").One(&idRow); err != nil {
		return err
	}

	var vectorID int64
	if v, verr := idRow["id"].Value(); verr == nil && v != nil {
		fmt.Sscanf(fmt.Sprint(v), "%d", &vectorID)
	}

	if vectorID <= 0 {
		return fmt.Errorf("last_insert_rowid returned %d after vec0 INSERT – embedding was stored but could not be linked", vectorID)
	}

	updateStmt := "UPDATE document_chunks SET vector_id = {:vectorId} WHERE id = {:chunkId} AND (vector_id = 0 OR vector_id IS NULL)"
	_, err = db.NewQuery(updateStmt).Bind(dbx.Params{
		"vectorId": vectorID,
		"chunkId":  record.Id,
	}).Execute()
	if err != nil {
		return err
	}

	return nil
}
