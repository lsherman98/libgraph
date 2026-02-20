package parser

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

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
		return "", fmt.Errorf("failed to create tmp base dir %s: %w", baseDir, err)
	}
	return os.MkdirTemp(baseDir, prefix)
}

func CleanupAllTmp() error {
	baseDir := filepath.Join(".", tmpBaseDir)
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		return nil
	}
	return os.RemoveAll(baseDir)
}

func (p *Parser) ParseUpload(upload *core.Record, onPage func(Page) error) (*ParseResult, error) {
	filename := upload.GetString("file")
	p.App.Logger().Info("ParseUpload started", "uploadID", upload.Id, "filename", filename)

	if filename == "" {
		return nil, fmt.Errorf("upload record has no file")
	}

	ext := strings.ToLower(filepath.Ext(filename))
	p.App.Logger().Info("ParseUpload file type detected", "ext", ext)

	fsys, err := p.App.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("failed to create filesystem: %w", err)
	}
	defer fsys.Close()

	filePath := upload.BaseFilesPath() + "/" + filename
	p.App.Logger().Info("ParseUpload reading file from storage", "storagePath", filePath)

	blob, err := fsys.GetReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get file from storage (path: %s): %w", filePath, err)
	}
	defer blob.Close()

	fileBytes, err := io.ReadAll(blob)
	if err != nil {
		return nil, fmt.Errorf("failed to read file bytes: %w", err)
	}

	p.App.Logger().Info("ParseUpload file read successfully", "sizeBytes", len(fileBytes))

	switch ext {
	case ".pdf":
		return p.parsePDF(fileBytes, filename, onPage)
	case ".epub":
		return p.parseEPUB(fileBytes, filename, onPage)
	case ".txt", ".md", ".markdown":
		return p.parsePlainText(fileBytes, filename, onPage)
	default:
		return nil, fmt.Errorf("unsupported file type: %s", ext)
	}
}

func (p *Parser) parsePDF(fileBytes []byte, filename string, onPage func(Page) error) (*ParseResult, error) {
	tmpDir, err := p.makeTmpDir("libgraph-pdf-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}

	defer func() {
		if removeErr := os.RemoveAll(tmpDir); removeErr != nil {
			p.App.Logger().Error("failed to clean up temp dir", "tmpDir", tmpDir, "error", removeErr)
		}
	}()

	safeFilename := sanitizeFilename(filename)
	inputPath := filepath.Join(tmpDir, safeFilename)

	if err := os.WriteFile(inputPath, fileBytes, 0644); err != nil {
		return nil, fmt.Errorf("failed to write temp PDF: %w", err)
	}

	_, statErr := os.Stat(inputPath)
	if statErr != nil {
		return nil, fmt.Errorf("failed to stat temp PDF after write: %w", statErr)
	}

	outputPattern := filepath.Join(tmpDir, "page_%d.pdf")

	cmd := exec.Command("pdftk", inputPath, "burst", "output", outputPattern)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdftk failed: %w, stderr: %s", err, stderr.String())
	}

	globPattern := filepath.Join(tmpDir, "page_*.pdf")
	pageFiles, err := filepath.Glob(globPattern)
	if err != nil {
		return nil, fmt.Errorf("failed to glob page files: %w", err)
	}

	if len(pageFiles) == 0 {
		entries, _ := os.ReadDir(tmpDir)
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		return nil, fmt.Errorf("pdfseparate produced no pages")
	}

	sort.Slice(pageFiles, func(i, j int) bool {
		numI := extractPageNumber(pageFiles[i])
		numJ := extractPageNumber(pageFiles[j])
		return numI < numJ
	})

	pages := make([]Page, len(pageFiles))
	errs := make([]error, len(pageFiles))

	sem := make(chan struct{}, p.WorkerPool)
	var wg sync.WaitGroup

	for i, pf := range pageFiles {
		wg.Add(1)
		go func(idx int, pagePath string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			md, err := runMarkitdown(pagePath)
			if err != nil {
				errs[idx] = fmt.Errorf("markitdown failed for page %d: %w", idx+1, err)
				p.App.Logger().Error("parsePDF markitdown failed", "page", idx+1, "error", err)
				return
			}

			pg := Page{
				PageNumber: idx + 1,
				Markdown:   md,
			}
			pages[idx] = pg

			if onPage != nil {
				if err := onPage(pg); err != nil {
					p.App.Logger().Error("parsePDF callback error", "page", idx+1, "error", err)
				}
			}
		}(i, pf)
	}
	wg.Wait()

	result := &ParseResult{}
	var failedCount, emptyCount int
	for i, page := range pages {
		if errs[i] != nil {
			p.App.Logger().Error("page conversion failed", "page", i+1, "error", errs[i])
			failedCount++
			continue
		}
		if strings.TrimSpace(page.Markdown) != "" {
			result.Pages = append(result.Pages, page)
		} else {
			emptyCount++
		}
	}

	if len(result.Pages) == 0 {
		return nil, fmt.Errorf("all pages failed to convert (failed=%d, empty=%d, total=%d)", failedCount, emptyCount, len(pageFiles))
	}

	return result, nil
}

func (p *Parser) parseEPUB(fileBytes []byte, filename string, onPage func(Page) error) (*ParseResult, error) {
	tmpDir, err := p.makeTmpDir("libgraph-epub-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer func() {
		if removeErr := os.RemoveAll(tmpDir); removeErr != nil {
			p.App.Logger().Error("failed to clean up temp dir", "tmpDir", tmpDir, "error", removeErr)
		}
	}()

	safeFilename := sanitizeFilename(filename)
	inputPath := filepath.Join(tmpDir, safeFilename)
	if err := os.WriteFile(inputPath, fileBytes, 0644); err != nil {
		return nil, fmt.Errorf("failed to write temp EPUB: %w", err)
	}

	pdfName := strings.TrimSuffix(safeFilename, filepath.Ext(safeFilename)) + ".pdf"
	pdfPath := filepath.Join(tmpDir, pdfName)

	cmd := exec.Command("ebook-convert", inputPath, pdfPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ebook-convert failed: %w, stderr: %s", err, stderr.String())
	}

	pdfBytes, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read converted PDF: %w", err)
	}

	return p.parsePDF(pdfBytes, pdfName, onPage)
}

func (p *Parser) parsePlainText(fileBytes []byte, filename string, onPage func(Page) error) (*ParseResult, error) {
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
				splitIdx = i + 2 // include the newlines in the previous page
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

func runMarkitdown(filePath string) (string, error) {
	cmd := exec.Command("markitdown", filePath)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("markitdown error (file=%s): %w, stderr: %s", filePath, err, stderr.String())
	}

	return stdout.String(), nil
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

func extractPageNumber(path string) int {
	base := filepath.Base(path)
	base = strings.TrimPrefix(base, "page_")
	base = strings.TrimSuffix(base, filepath.Ext(base))
	n, err := strconv.Atoi(base)
	if err != nil {
		return 0
	}
	return n
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
