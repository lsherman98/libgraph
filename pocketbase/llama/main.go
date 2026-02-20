package llama

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase"
)

const (
	cloudBaseURL = "https://api.cloud.llamaindex.ai"
)

type LlamaClient struct {
	Client         *http.Client
	BaseURL        *url.URL
	ProjectID      string
	OrganizationID string
	PipelineID     string
	APIKey         string
	App            *pocketbase.PocketBase
}

func New(app *pocketbase.PocketBase) (*LlamaClient, error) {
	baseURL, err := url.Parse(cloudBaseURL)
	if err != nil {
		return nil, err
	}

	apiKey := os.Getenv("LLAMA_INDEX_API_KEY")
	if apiKey == "" {
		return nil, errors.New("LLAMA_INDEX_API_KEY environment variable is required")
	}

	projectID := os.Getenv("LLAMA_INDEX_PROJECT_ID")
	if projectID == "" {
		return nil, errors.New("LLAMA_INDEX_PROJECT_ID environment variable is required")
	}

	organizationId := os.Getenv("LLAMA_INDEX_ORGANIZATION_ID")
	if organizationId == "" {
		app.Logger().Warn("LLAMA_INDEX_ORGANIZATION_ID environment variable is not set; proceeding without it")
	}

	pipelineID := os.Getenv("LLAMA_INDEX_PIPELINE_ID")
	if pipelineID == "" {
		app.Logger().Warn("LLAMA_INDEX_PIPELINE_ID environment variable is not set; indexing will fail")
	}

	return &LlamaClient{
		Client:         http.DefaultClient,
		BaseURL:        baseURL,
		APIKey:         apiKey,
		ProjectID:      projectID,
		OrganizationID: organizationId,
		PipelineID:     pipelineID,
		App:            app,
	}, nil
}

func (c *LlamaClient) UploadFileContent(name string, content []byte, externalFileID string) (*UploadFileContentResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)

	endpointURL, err := c.BaseURL.Parse(path.Join(c.BaseURL.Path, "/api/v1/files"))
	if err != nil {
		return nil, err
	}
	endpointURL.RawQuery = params.Encode()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("upload_file", name)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err = part.Write(content); err != nil {
		return nil, fmt.Errorf("failed to write content: %w", err)
	}

	if externalFileID != "" {
		if err := writer.WriteField("external_file_id", externalFileID); err != nil {
			return nil, fmt.Errorf("failed to write external_file_id: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, endpointURL.String(), &body)
	if err != nil {
		return nil, err
	}

	req.Header.Add("Accept", "application/json")
	req.Header.Add("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("LlamaIndex: file upload failed with status: %s, body: %s", resp.Status, string(respBody))
	}

	var response UploadFileContentResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode upload response: %w", err)
	}

	return &response, nil
}

func (c *LlamaClient) AddFilesToPipeline(fileId string, metadata map[string]interface{}) (*AddFilesToPipelineResponse, error) {
	if c.PipelineID == "" {
		return nil, errors.New("pipeline ID is not configured")
	}

	pipelineFile := PipelineFile{
		FileID:         fileId,
		CustomMetadata: metadata,
	}

	body := []PipelineFile{pipelineFile}

	var response AddFilesToPipelineResponse
	endpoint := fmt.Sprintf("/api/v1/pipelines/%s/files", c.PipelineID)
	if err := c.Do(context.Background(), http.MethodPut, endpoint, nil, body, &response); err != nil {
		return nil, err
	}

	return &response, nil
}

func (c *LlamaClient) DeletePipelineFile(fileId string) error {
	if c.PipelineID == "" {
		return errors.New("pipeline ID is not configured")
	}

	endpoint := fmt.Sprintf("/api/v1/pipelines/%s/files/%s", c.PipelineID, fileId)
	if err := c.Do(context.Background(), http.MethodDelete, endpoint, nil, nil, nil); err != nil {
		return err
	}

	return nil
}

func (c *LlamaClient) Chat(req *ChatRequestBody) (*ChatResponse, error) {
	if c.PipelineID == "" {
		return nil, errors.New("pipeline ID is not configured")
	}

	endpoint := fmt.Sprintf("/api/v1/pipelines/%s/chat", c.PipelineID)

	fullURL, err := c.BaseURL.Parse(path.Join(c.BaseURL.Path, endpoint))
	if err != nil {
		return nil, err
	}

	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, fullURL.String(), bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Add("Accept", "application/json")
	httpReq.Header.Add("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Add("Content-Type", "application/json")

	resp, err := c.Client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LlamaIndex: API request failed with status: %s, body: %s", resp.Status, string(respBody))
	}

	response := &ChatResponse{}
	bodyStr := string(respBody)
	lines := strings.Split(bodyStr, "\n")

	var textParts []string
	textRegex := regexp.MustCompile(`^0:"(.*)"$`)
	sourcesRegex := regexp.MustCompile(`^8:(.+)$`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if matches := textRegex.FindStringSubmatch(line); len(matches) > 1 {
			var unescaped string
			if err := json.Unmarshal([]byte(`"`+matches[1]+`"`), &unescaped); err == nil {
				textParts = append(textParts, unescaped)
			} else {
				textParts = append(textParts, matches[1])
			}
		}

		if matches := sourcesRegex.FindStringSubmatch(line); len(matches) > 1 {
			var sourcesData []struct {
				Type string `json:"type"`
				Data struct {
					Nodes []struct {
						ID       string        `json:"id"`
						Text     string        `json:"text"`
						Score    float64       `json:"score"`
						Metadata *NodeMetadata `json:"metadata"`
					} `json:"nodes"`
				} `json:"data"`
			}

			if err := json.Unmarshal([]byte(matches[1]), &sourcesData); err == nil {
				for _, source := range sourcesData {
					if source.Type == "sources" {
						for _, n := range source.Data.Nodes {
							response.Nodes = append(response.Nodes, NodeInfo{
								ID:       n.ID,
								Text:     n.Text,
								Score:    n.Score,
								Metadata: n.Metadata,
							})
						}
					}
				}
			}
		}
	}

	response.Response = strings.Join(textParts, "")

	return response, nil
}

func (c *LlamaClient) Retrieve(req *RetrieveRequestBody) (*RetrieveResponse, error) {
	if c.PipelineID == "" {
		return nil, errors.New("pipeline ID is not configured")
	}

	endpoint := fmt.Sprintf("/api/v1/pipelines/%s/retrieve", c.PipelineID)

	fullURL, err := c.BaseURL.Parse(path.Join(c.BaseURL.Path, endpoint))
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Add("project_id", c.ProjectID)
	fullURL.RawQuery = params.Encode()

	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, fullURL.String(), bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Add("Accept", "application/json")
	httpReq.Header.Add("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Add("Content-Type", "application/json")

	resp, err := c.Client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LlamaIndex: API request failed with status: %s, body: %s", resp.Status, string(respBody))
	}

	var raw retrieveRawResponse
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse retrieve response: %w", err)
	}

	response := RetrieveResponse{
		Nodes: make([]NodeInfo, len(raw.Nodes)),
	}
	for i, n := range raw.Nodes {
		response.Nodes[i] = NodeInfo{
			ID:       n.Node.ID_,
			Text:     n.Node.Text,
			Metadata: n.Node.Metadata,
			Score:    n.Score,
		}
	}

	return &response, nil
}

func (c *LlamaClient) Do(ctx context.Context, method, endpointPath string, queryParams url.Values, reqBody, resBody any) error {
	endpoint, err := c.BaseURL.Parse(path.Join(c.BaseURL.Path, endpointPath))
	if err != nil {
		return err
	}

	if queryParams != nil {
		endpoint.RawQuery = queryParams.Encode()
	}

	var payload io.Reader
	if reqBody != nil {
		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		payload = bytes.NewBuffer(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), payload)
	if err != nil {
		return err
	}

	req.Header.Add("Accept", "application/json")
	req.Header.Add("Authorization", "Bearer "+c.APIKey)
	if reqBody != nil {
		req.Header.Add("Content-Type", "application/json")
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LlamaIndex: API request failed with status: %s, body: %s", resp.Status, string(bodyBytes))
	}

	if resBody != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(resBody); err != nil {
			return err
		}
	}

	return nil
}
