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
	parseBaseURL = "https://api.cloud.llamaindex.ai/api/v2/parse"
)

type LlamaClient struct {
	Client         *http.Client
	BaseURL        *url.URL
	ProjectID      string
	OrganizationID string
	APIKey         string
	App            *pocketbase.PocketBase
}

func New(app *pocketbase.PocketBase) (*LlamaClient, error) {
	baseURL, err := url.Parse(parseBaseURL)
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

	return &LlamaClient{
		Client:         http.DefaultClient,
		BaseURL:        baseURL,
		APIKey:         apiKey,
		ProjectID:      projectID,
		OrganizationID: organizationId,
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
		Tier:      "cost_effective",
		Version:   "latest",
		Languages: []string{"en"},
		OutputOptions: &OutputOptions{
			Markdown: &MarkdownOptions{
				AnnotateLinks: true,
			},
			ImagesToSave: []string{"screenshot"},
			ExportPDF: &ExportPDFOptions{
				Enable: true,
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

	if err := c.Do(context.Background(), http.MethodPost, "", params, body, &response); err != nil {
		c.App.Logger().Error("LlamaIndex: Parse request failed", "error", err)
		return nil, err
	}

	return &response, nil
}

func (c *LlamaClient) GetParseJob(jobId string) error {
    params := url.Values{}
	params.Add("project_id", c.ProjectID)
	params.Add("organization_id", c.OrganizationID)
    
    return nil
}

func (c *LlamaClient) Do(ctx context.Context, method, endpointPath string, queryParams url.Values, reqBody, resBody any) error {
	endpoint, err := c.BaseURL.Parse(path.Join(c.BaseURL.Path, endpointPath))
	if err != nil {
		c.App.Logger().Error("LlamaIndex:: failed to parse endpoint URL", "error", err)
		return err
	}

	if queryParams != nil {
		endpoint.RawQuery = queryParams.Encode()
	}

	var payload io.Reader
	if reqBody != nil {
		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			c.App.Logger().Error("LlamaIndex: failed to marshal request payload", "error", err)
			return err
		}
		payload = bytes.NewBuffer(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), payload)
	if err != nil {
		c.App.Logger().Error("LlamaIndex: failed to create HTTP request", "error", err)
		return err
	}

	req.Header.Add("Accept", "application/json")
	req.Header.Add("Authorization", "Bearer "+c.APIKey)
	if reqBody != nil {
		req.Header.Add("Content-Type", "application/json")
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		c.App.Logger().Error("LlamaIndex: failed to execute request", "error", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LlamaIndex: API request failed with status: %s, body: %s", resp.Status, string(bodyBytes))
	}

	if resBody != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(resBody); err != nil {
			c.App.Logger().Error("LlamaIndex: failed to decode response body", "error", err)
			return err
		}
	}

	return nil
}
