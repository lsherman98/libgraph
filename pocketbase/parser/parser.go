package parser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const tmpBaseDir = "tmp"

func New(app *pocketbase.PocketBase) *Parser {
	return &Parser{
		App:        app,
		WorkerPool: 5,
	}
}

func (p *Parser) makeTmpDir(prefix string) (string, error) {
	baseDir := filepath.Join(".", tmpBaseDir)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return "", err
	}
	return os.MkdirTemp(baseDir, prefix)
}

func CleanupTmp() error {
	baseDir := filepath.Join(".", tmpBaseDir)
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		return nil
	}
	return os.RemoveAll(baseDir)
}

func (p *Parser) ParseUpload(upload *core.Record, onPage func(Page) error) (*ParseResult, error) {
	filename := upload.GetString("file")

	if filename == "" {
		return nil, fmt.Errorf("upload record has no file")
	}

	ext := strings.ToLower(filepath.Ext(filename))

	fsys, err := p.App.NewFilesystem()
	if err != nil {
		return nil, err
	}
	defer fsys.Close()

	filePath := upload.BaseFilesPath() + "/" + filename

	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return nil, err
	}
	defer blob.Close()

	fileBytes, err := io.ReadAll(blob)
	if err != nil {
		return nil, err
	}

	switch ext {
	case ".pdf":
		return p.parsePDF(fileBytes, filename, onPage)
	case ".epub":
		return p.parseEPUB(fileBytes, filename, onPage)
	case ".txt", ".md", ".markdown":
		return p.parsePlainText(fileBytes, onPage)
	default:
		return nil, fmt.Errorf("unsupported file type: %s", ext)
	}
}

func (p *Parser) parsePDF(fileBytes []byte, filename string, onPage func(Page) error) (*ParseResult, error) {
	tmpDir, err := p.makeTmpDir("libgraph-pdf-*")
	if err != nil {
		return nil, err
	}

	defer func() {
		if removeErr := os.RemoveAll(tmpDir); removeErr != nil {
			p.App.Logger().Error("failed to clean up temp dir", "tmpDir", tmpDir, "error", removeErr)
		}
	}()

	safeFilename := sanitizeFilename(filename)
	inputPath := filepath.Join(tmpDir, safeFilename)

	if err := os.WriteFile(inputPath, fileBytes, 0644); err != nil {
		return nil, err
	}

	_, err = os.Stat(inputPath)
	if err != nil {
		return nil, err
	}

	liteparseOutput, err := runLiteParseJSON(inputPath)
	if err != nil {
		return nil, err
	}

	result := &ParseResult{}
	var emptyCount int
	for i, parsedPage := range liteparseOutput.Pages {
		pageNumber := parsedPage.Page
		if pageNumber <= 0 {
			pageNumber = i + 1
		}

		page := Page{
			PageNumber: pageNumber,
			Markdown:   parsedPage.Text,
		}

		if strings.TrimSpace(page.Markdown) != "" {
			result.Pages = append(result.Pages, page)
			if onPage != nil {
				if err := onPage(page); err != nil {
					p.App.Logger().Error("parsePDF callback error", "page", page.PageNumber, "error", err)
				}
			}
		} else {
			emptyCount++
		}
	}

	if len(result.Pages) == 0 {
		return nil, fmt.Errorf("liteparse returned no non-empty pages (empty=%d, total=%d)", emptyCount, len(liteparseOutput.Pages))
	}

	return result, nil
}

func (p *Parser) parseEPUB(fileBytes []byte, filename string, onPage func(Page) error) (*ParseResult, error) {
	tmpDir, err := p.makeTmpDir("libgraph-epub-*")
	if err != nil {
		return nil, err
	}
	defer func() {
		if removeErr := os.RemoveAll(tmpDir); removeErr != nil {
			p.App.Logger().Error("failed to clean up temp dir", "tmpDir", tmpDir, "error", removeErr)
		}
	}()

	safeFilename := sanitizeFilename(filename)
	inputPath := filepath.Join(tmpDir, safeFilename)
	if err := os.WriteFile(inputPath, fileBytes, 0644); err != nil {
		return nil, err
	}

	pdfName := strings.TrimSuffix(safeFilename, filepath.Ext(safeFilename)) + ".pdf"
	pdfPath := filepath.Join(tmpDir, pdfName)

	cmd := exec.Command("ebook-convert", inputPath, pdfPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, err
	}

	pdfBytes, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, err
	}

	return p.parsePDF(pdfBytes, pdfName, onPage)
}

func (p *Parser) parsePlainText(fileBytes []byte, onPage func(Page) error) (*ParseResult, error) {
	content := string(fileBytes)
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("file is empty")
	}

	pageChunks := splitTextIntoPages(content, 5000)

	pages := make([]Page, len(pageChunks))
	for i, chunk := range pageChunks {
		pg := Page{
			PageNumber: i + 1,
			Markdown:   chunk,
		}
		pages[i] = pg
		if onPage != nil {
			if err := onPage(pg); err != nil {
				p.App.Logger().Error("parsePlainText callback error", "page", i+1, "error", err)
			}
		}
	}

	return &ParseResult{Pages: pages}, nil
}

func splitTextIntoPages(text string, maxPageSize int) []string {
	var pages []string
	runes := []rune(text)
	totalLen := len(runes)

	start := 0
	for start < totalLen {
		end := start + maxPageSize
		if end >= totalLen {
			pages = append(pages, string(runes[start:]))
			break
		}

		splitIdx := -1
		searchLimit := start + (maxPageSize / 2)

		for i := end; i > searchLimit; i-- {
			if i+1 < totalLen && runes[i] == '\n' && runes[i+1] == '\n' {
				splitIdx = i + 2
				break
			}
		}

		if splitIdx == -1 {
			for i := end; i > searchLimit; i-- {
				if runes[i] == '\n' {
					splitIdx = i + 1
					break
				}
			}
		}

		if splitIdx == -1 {
			for i := end; i > searchLimit; i-- {
				if runes[i] == ' ' {
					splitIdx = i + 1
					break
				}
			}
		}

		if splitIdx == -1 {
			splitIdx = end
		}

		pages = append(pages, string(runes[start:splitIdx]))
		start = splitIdx
	}

	return pages
}

type liteParseJSONOutput struct {
	Pages []liteParsePage `json:"pages"`
}

type liteParsePage struct {
	Page int    `json:"page"`
	Text string `json:"text"`
}

func runLiteParseJSON(filePath string) (*liteParseJSONOutput, error) {
	liteparseCmd, err := findLiteParseCommand()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(liteparseCmd, "parse", filePath, "--format", "json", "--no-ocr", "-q")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrMsg := strings.TrimSpace(stderr.String())
		if stderrMsg == "" {
			return nil, fmt.Errorf("liteparse parse failed: %w", err)
		}
		return nil, fmt.Errorf("liteparse parse failed: %w: %s", err, stderrMsg)
	}

	var parsed liteParseJSONOutput
	if err := json.Unmarshal(stdout.Bytes(), &parsed); err != nil {
		return nil, fmt.Errorf("invalid liteparse json output: %w", err)
	}

	return &parsed, nil
}

func findLiteParseCommand() (string, error) {
	for _, candidate := range []string{"lit", "liteparse"} {
		if _, err := exec.LookPath(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("pdf parsing requires liteparse CLI: install @llamaindex/liteparse (provides 'lit')")
}

func sanitizeFilename(name string) string {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)

	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, base)

	if safe == "" {
		safe = "document"
	}

	return safe + ext
}

func IsDocumentFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pdf", ".epub", ".txt", ".md", ".markdown":
		return true
	default:
		return false
	}
}
