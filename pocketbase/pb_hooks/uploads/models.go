package uploads

import (
	"regexp"
	"strings"
)

var (
	reImage       = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	reLink        = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	reHTML        = regexp.MustCompile(`<[^>]+>`)
	reHeading     = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	reBlockquote  = regexp.MustCompile(`(?m)^>\s*`)
	reListBullet  = regexp.MustCompile(`(?m)^[\s]*[-*+]\s+`)
	reListOrdered = regexp.MustCompile(`(?m)^[\s]*\d+\.\s+`)
	reCodeBlock   = regexp.MustCompile("```[\\s\\S]*?```")
	reInlineCode  = regexp.MustCompile("`([^`]+)`")
	reHR          = regexp.MustCompile(`(?m)^[-*_]{3,}\s*$`)
	reWhitespace  = regexp.MustCompile(`\s+`)
	reSentence    = regexp.MustCompile(`([.!?])\s+`)
	transcriptExt = map[string]bool{
		".txt":      true,
		".md":       true,
		".markdown": true,
	}
)

const (
	maxTranscriptionDuration = 60 * 60
	maxChunkSize             = 2000
	embedBatchSize           = 250
)

func stripMarkdown(md string) string {
	text := reImage.ReplaceAllString(md, "$1")
	text = reLink.ReplaceAllString(text, "$1")
	text = reHTML.ReplaceAllString(text, "")
	text = reHeading.ReplaceAllString(text, "")
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "__", "")
	text = strings.ReplaceAll(text, "*", "")
	text = strings.ReplaceAll(text, "_", "")
	text = reBlockquote.ReplaceAllString(text, "")
	text = reListBullet.ReplaceAllString(text, "")
	text = reListOrdered.ReplaceAllString(text, "")
	text = reCodeBlock.ReplaceAllString(text, "")
	text = reInlineCode.ReplaceAllString(text, "$1")
	text = reHR.ReplaceAllString(text, "")
	text = reWhitespace.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

type ChunkPayload struct {
	PageNumber int `json:"page_number"`
}

type EmbedChunk struct {
	ChunkID string
	Hash    string
}
