package summarize

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/utils"
	"github.com/lsherman98/libgraph/pocketbase/vars"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func HandleSummarizeJob(app core.App, job *core.Record) error {
	payload := SummarizePayload{}
	if err := job.UnmarshalJSONField("payload", &payload); err != nil {
		return err
	}

	if len(payload.PageIDs) > 0 {
		return handlePageRangeSummarizeJob(app, payload, job)
	}

	if payload.FullDocument {
		return handleFullSummarizeJob(app, job)
	}

	page, err := app.FindRecordById(collections.Pages, job.GetString("page"))
	if err != nil {
		return err
	}

	uploadID := page.GetString("upload")
	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	uploadType := upload.GetString("type")
	if uploadType == vars.UploadTypeSummary {
		return fmt.Errorf("cannot summarize summary upload")
	}

	if uploadType != vars.UploadTypeBook {
		return handleFullSummarizeJob(app, job)
	}

	pageUserID := page.GetString("user")
	jobUserID := job.GetString("user")
	if pageUserID != jobUserID {
		return fmt.Errorf("page does not belong to user")
	}

	markdown, err := utils.ReadPageMarkdown(app, page)
	if err != nil {
		return err
	}

	summary, err := generatePageSummary(markdown)
	if err != nil {
		return err
	}

	_, _, _, err = upsertPageSummary(app, page, jobUserID, summary, false)
	if err != nil {
		return err
	}

	return nil
}

func handleFullSummarizeJob(app core.App, job *core.Record) error {
	uploadID := job.GetString("upload")
	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	jobUserID := job.GetString("user")
	uploadUserID := upload.GetString("user")
	if uploadUserID != jobUserID {
		return fmt.Errorf("upload does not belong to user")
	}

	uploadType := upload.GetString("type")
	if uploadType == vars.UploadTypeSummary {
		return fmt.Errorf("cannot summarize summary upload")
	}

	pages, err := app.FindRecordsByFilter(
		collections.Pages,
		"upload = {:uploadId}",
		"+page",
		0,
		0,
		dbx.Params{"uploadId": uploadID},
	)
	if err != nil {
		return err
	}

	primaryPage := pages[0]
	fullMarkdown := strings.Builder{}
	for _, page := range pages {
		if page.GetString("user") != jobUserID {
			return fmt.Errorf("page does not belong to user")
		}

		markdown, readErr := utils.ReadPageMarkdown(app, page)
		if readErr != nil {
			return readErr
		}

		fullMarkdown.WriteString(markdown)
	}

	summary, err := generateDocumentSummary(fullMarkdown.String())
	if err != nil {
		return err
	}

	_, _, _, err = upsertPageSummary(app, primaryPage, jobUserID, summary, true)
	if err != nil {
		return err
	}

	return nil
}

func handlePageRangeSummarizeJob(app core.App, payload SummarizePayload, job *core.Record) error {
	pages := make([]*core.Record, 0, len(payload.PageIDs))
	uploadID := job.GetString("upload")
	jobUserID := job.GetString("user")

	for _, pageID := range payload.PageIDs {
		page, err := app.FindRecordById(collections.Pages, pageID)
		if err != nil {
			return err
		}

		if page.GetString("user") != jobUserID {
			return fmt.Errorf("page does not belong to user")
		}

		pages = append(pages, page)
	}

	upload, err := app.FindRecordById(collections.Uploads, uploadID)
	if err != nil {
		return err
	}

	uploadType := upload.GetString("type")
	if uploadType == vars.UploadTypeSummary {
		return fmt.Errorf("cannot summarize summary upload")
	}

	if uploadType != vars.UploadTypeBook {
		return fmt.Errorf("multiple page summary is only supported for books")
	}

	sort.Slice(pages, func(i, j int) bool {
		return pages[i].GetInt("page") < pages[j].GetInt("page")
	})

	if len(pages) == 1 {
		pageMarkdown, err := utils.ReadPageMarkdown(app, pages[0])
		if err != nil {
			return err
		}

		summary, err := generatePageSummary(pageMarkdown)
		if err != nil {
			return err
		}

		_, _, _, err = upsertPageSummary(app, pages[0], jobUserID, summary, false)
		return err
	}

	fullMarkdown := strings.Builder{}
	for _, page := range pages {
		markdown, err := utils.ReadPageMarkdown(app, page)
		if err != nil {
			return err
		}

		fullMarkdown.WriteString("\n\n")
		fmt.Fprintf(&fullMarkdown, "## Page %d\n\n%s", page.GetInt("page"), markdown)
	}

	summary, err := generateDocumentSummary(fullMarkdown.String())
	if err != nil {
		return err
	}

	primaryPage := pages[0]
	summaryRecord, summaryUpload, _, err := upsertPageSummary(app, primaryPage, jobUserID, summary, true)
	if err != nil {
		return err
	}

	startPage := pages[0].GetInt("page")
	endPage := pages[len(pages)-1].GetInt("page")
	title := upload.GetString("title")

	if startPage == endPage {
		summaryUpload.Set("title", fmt.Sprintf("%s — Summary (Page %d)", title, startPage))
	} else {
		summaryUpload.Set("title", fmt.Sprintf("%s — Summary (Pages %d–%d)", title, startPage, endPage))
	}
	if err := app.Save(summaryUpload); err != nil {
		return err
	}

	for _, page := range pages {
		if err := linkPageToSummaryRecord(app, page, summaryRecord.Id); err != nil {
			return err
		}
	}

	return nil
}

func linkPageToSummaryRecord(app core.App, page *core.Record, summaryID string) error {
	page.Set("summary", summaryID)
	return app.Save(page)
}

func generatePageSummary(markdown string) (string, error) {
	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		return "", fmt.Errorf("GEMINI_MODEL environment variable is not set")
	}

	model := gemini.GenerativeModel(modelName)
	model.Temperature = utils.FloatPtr(0.2)
	model.SystemInstruction = genai.NewUserContent(genai.Text("You summarize a single page from a user's document. Return concise markdown with 4-7 bullet points and a short 1-sentence takeaway at the end. Do not include citations, JSON, or extra preamble."))

	prompt := fmt.Sprintf("Summarize this page content:\n\n%s", markdown)
	resp, err := model.GenerateContent(context.Background(), genai.Text(prompt))
	if err != nil {
		return "", err
	}

	summary := utils.ExtractResponseText(resp)
	if summary == "" {
		return "", fmt.Errorf("empty summary response")
	}

	return summary, nil
}

func generateDocumentSummary(markdown string) (string, error) {
	const maxChars = 250_000
	if len(markdown) > maxChars {
		markdown = markdown[:maxChars]
	}

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		return "", fmt.Errorf("GEMINI_MODEL environment variable is not set")
	}

	model := gemini.GenerativeModel(modelName)
	model.Temperature = utils.FloatPtr(0.2)
	model.SystemInstruction = genai.NewUserContent(genai.Text(
		"You summarize an entire document uploaded by a user. " +
			"Return concise markdown with a 2-3 sentence overview followed by 5-10 bullet points covering the key ideas. " +
			"End with a one-sentence takeaway. Do not include citations, JSON, or extra preamble.",
	))

	prompt := fmt.Sprintf("Summarize this document:\n\n%s", markdown)
	resp, err := model.GenerateContent(context.Background(), genai.Text(prompt))
	if err != nil {
		return "", err
	}

	summary := utils.ExtractResponseText(resp)
	if summary == "" {
		return "", fmt.Errorf("empty summary response")
	}

	return summary, nil
}

func upsertPageSummary(app core.App, sourcePageRecord *core.Record, userID, markdown string, fullDocument bool) (*core.Record, *core.Record, *core.Record, error) {
	sourceUploadID := sourcePageRecord.GetString("upload")
	sourceUploadRecord, err := app.FindRecordById(collections.Uploads, sourceUploadID)
	if err != nil {
		return nil, nil, nil, err
	}

	uploadsCollection, _ := app.FindCollectionByNameOrId(collections.Uploads)
	pagesCollection, _ := app.FindCollectionByNameOrId(collections.Pages)
	summariesCollection, _ := app.FindCollectionByNameOrId(collections.Summaries)

	title := sourceUploadRecord.GetString("title")
	pageNumber := sourcePageRecord.GetInt("page")
	summaryTitle := fmt.Sprintf("%s — Summary (Page %d)", title, pageNumber)
	filename := fmt.Sprintf("summary_page_%d.md", pageNumber)
	if fullDocument {
		summaryTitle = fmt.Sprintf("%s — Summary", title)
		filename = summaryTitle + " - summary.md"
	}

	summaryUploadFile, err := filesystem.NewFileFromBytes([]byte(markdown), filename)
	if err != nil {
		return nil, nil, nil, err
	}

	summaryUpload := core.NewRecord(uploadsCollection)
	summaryUpload.Set("title", summaryTitle)
	summaryUpload.Set("file", summaryUploadFile)
	summaryUpload.Set("type", "summary")
	summaryUpload.Set("status", vars.UploadStatusSuccess)
	summaryUpload.Set("num_pages", 1)
	summaryUpload.Set("user", userID)
	if err := app.Save(summaryUpload); err != nil {
		return nil, nil, nil, err
	}

	summaryPageFile, err := filesystem.NewFileFromBytes([]byte(markdown), filename)
	if err != nil {
		return nil, nil, nil, err
	}

	summaryPage := core.NewRecord(pagesCollection)
	summaryPage.Set("upload", summaryUpload.Id)
	summaryPage.Set("page", 1)
	summaryPage.Set("user", userID)
	summaryPage.Set("markdown", summaryPageFile)
	if err := app.Save(summaryPage); err != nil {
		return nil, nil, nil, err
	}

	newSummary := core.NewRecord(summariesCollection)
	newSummary.Set("user", userID)
	newSummary.Set("source_upload", sourceUploadID)
	newSummary.Set("summary_upload", summaryUpload.Id)
	newSummary.Set("summary_page", summaryPage.Id)
	newSummary.Set("scope", "page")
	newSummary.Set("status", vars.SummaryStatusSuccess)
	if err := app.Save(newSummary); err != nil {
		return nil, nil, nil, err
	}

	if err := linkPageToSummaryRecord(app, sourcePageRecord, newSummary.Id); err != nil {
		return nil, nil, nil, err
	}

	return newSummary, summaryUpload, summaryPage, nil
}
