package llama

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// func buildUrl(statement *core.Record, token string) string {
// 	return fmt.Sprintf(
// 		"test",
// 		collections.Uploads,
// 		statement.Id,
// 		statement.GetString("file"),
// 		token,
// 	)
// }

// var url string
// 			if dev == "true" {
// 				url = buildS3Url(statement.Collection().Id, statement.Id, statement.GetString("file"))
// 			} else {
// 				url = buildUrl(statement, token)
// 			}

func buildS3Url(collectionId, recordId, filename string) string {
	return fmt.Sprintf(
		"https://storage.googleapis.com/%s/%s/%s/%s",
		"libgraph-development",
		collectionId,
		recordId,
		filename,
	)
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

func (c *LlamaClient) Parse(upload *core.Record) (*ParseResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)
	params.Add("organization_id", c.OrganizationID)

	url := buildS3Url(upload.Collection().Id, upload.Id, upload.GetString("file"))

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

func (c *LlamaClient) UploadFileFromURL(upload *core.Record) (*UploadFileFromURLResponse, error) {
	params := url.Values{}
	params.Add("project_id", c.ProjectID)

	url := buildS3Url(upload.Collection().Id, upload.Id, upload.GetString("file"))

	body := &UploadFileFromURLRequest{
		Url:             url,
		Name:            upload.GetString("file"),
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
