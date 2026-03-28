package parser

import "github.com/pocketbase/pocketbase"

type Page struct {
	PageNumber int
	Markdown   string
}

type ParseResult struct {
	Pages []Page
}

type Parser struct {
	App        *pocketbase.PocketBase
	WorkerPool int
}

type liteParseJSONOutput struct {
	Pages []liteParsePage `json:"pages"`
}

type liteParsePage struct {
	Page int    `json:"page"`
	Text string `json:"text"`
}
