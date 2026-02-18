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

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func buildProdUrl(record *core.Record, token string) string {
	return fmt.Sprintf(
		"test.com/%s/%s/%s?token=%s",
		collections.Uploads,
		record.Id,
		record.GetString("file"),
		token,
	)
}

func buildS3Url(collectionId, recordId, filename string) string {
	return fmt.Sprintf(
		"https://storage.googleapis.com/%s/%s/%s/%s",
		"libgraph-development",
		collectionId,
		recordId,
		filename,
	)
}

func buildUrl(app *pocketbase.PocketBase, collectionId, recordId, filename, token string) string {
	dev := os.Getenv("DEV")

	var url string
	if dev == "true" {
		url = buildS3Url(collectionId, recordId, filename)
	} else {
		record, err := app.FindRecordById(collections.Uploads, recordId)
		if err != nil {
			return ""
		}

		url = buildProdUrl(record, token)
	}
	return url
}

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

func (c *LlamaClient) Parse(upload *core.Record, token string) (*ParseResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)
	params.Add("organization_id", c.OrganizationID)

	url := buildUrl(c.App, upload.Collection().Id, upload.Id, upload.GetString("file"), token)

	var response ParseResponse
	body := &ParseRequest{
		Tier:    "cost_effective",
		Version: "latest",
		OutputOptions: &OutputOptions{
			Markdown: &MarkdownOptions{
				AnnotateLinks: true,
			},
		},
		ProcessingOptions: &ProcessingOptions{
			Ignore: &IgnoreOptions{
				IgnoreDiagonalText: true,
				IgnoreTextInImage:  true,
				IgnoreHiddenText:   true,
			},
		},
		SourceURL: url,
	}

	if err := c.Do(context.Background(), http.MethodPost, "/api/v2/parse", params, body, &response); err != nil {
		return nil, err
	}

	return &response, nil
}

func (c *LlamaClient) GetParseJob(jobId string) (*ParseJobResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)
	params.Add("organization_id", c.OrganizationID)
	params.Add("expand", "markdown")

	var response ParseJobResponse
	if err := c.Do(context.Background(), http.MethodGet, path.Join("/api/v2/parse", jobId), params, nil, &response); err != nil {
		return nil, err
	}

	return &response, nil
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

func (c *LlamaClient) UploadFileFromURL(upload *core.Record, token string) (*UploadFileFromURLResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)

	url := buildUrl(c.App, upload.Collection().Id, upload.Id, upload.GetString("file"), token)

	body := &UploadFileFromURLRequest{
		Url:             url,
		Name:            upload.GetString("file"),
		ExternalFileID:  upload.Id,
		FollowRedirects: true,
		VerifySsl:       true,
	}

	var response UploadFileFromURLResponse
	if err := c.Do(context.Background(), http.MethodPut, "/api/v1/files/upload_from_url", params, body, &response); err != nil {
		return nil, err
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
		c.App.Logger().Error("[llama/Retrieve] pipeline ID is not configured")
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

	c.App.Logger().Info("[llama/Retrieve] request",
		"url", fullURL.String(),
		"pipelineID", c.PipelineID,
		"projectID", c.ProjectID,
		"body", string(bodyBytes),
	)

	httpReq, err := http.NewRequest(http.MethodPost, fullURL.String(), bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Add("Accept", "application/json")
	httpReq.Header.Add("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Add("Content-Type", "application/json")

	resp, err := c.Client.Do(httpReq)
	if err != nil {
		c.App.Logger().Error("[llama/Retrieve] HTTP request failed", "error", err)
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	c.App.Logger().Info("[llama/Retrieve] response",
		"status", resp.StatusCode,
		"bodyLen", len(respBody),
		"body", string(respBody),
	)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LlamaIndex: API request failed with status: %s, body: %s", resp.Status, string(respBody))
	}

	var raw retrieveRawResponse
	if err := json.Unmarshal(respBody, &raw); err != nil {
		c.App.Logger().Error("[llama/Retrieve] failed to parse response", "error", err, "body", string(respBody))
		return nil, fmt.Errorf("failed to parse retrieve response: %w", err)
	}

	c.App.Logger().Info("[llama/Retrieve] parsed nodes", "rawNodeCount", len(raw.Nodes))

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
