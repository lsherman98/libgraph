package utils

import (
	"fmt"
	"io"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/pocketbase/pocketbase/core"
)

func ReadPageMarkdown(app core.App, pageRecord *core.Record) (string, error) {
	filename := pageRecord.GetString("markdown")
	if filename == "" {
		return "", fmt.Errorf("page markdown file is empty")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return "", err
	}
	defer fsys.Close()

	filePath := pageRecord.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return "", err
	}
	defer blob.Close()

	content, err := io.ReadAll(blob)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

func ExtractResponseText(resp *genai.GenerateContentResponse) string {
	if resp == nil || len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return ""
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if text, ok := part.(genai.Text); ok {
			sb.WriteString(string(text))
		}
	}
	
	return sb.String()
}

func FloatPtr(f float32) *float32 {
	return &f
}

func Int32Ptr(v int32) *int32 {
	return &v
}
