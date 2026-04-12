package processing

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	JobTypeUploadParseOrTranscribe = "upload.parse"
	JobTypeChunkGenerate           = "chunk.generate"
	JobTypePageSummarize           = "page.summarize"
	JobTypeChunkEmbedSubmit        = "chunk.embed"
	JobTypeChunkEmbedPoll          = "chunk.embed.poll"
)

const (
	queuePollInterval = 60 * time.Second
	embedPollInterval = 120 * time.Second
)

type Worker struct {
	name     string
	jobType  string
	limit    int
	interval time.Duration
}

type JobHandler func(app core.App, job *core.Record) error

type Handlers struct {
	UploadParse      JobHandler
	ChunkGenerate    JobHandler
	PageSummarize    JobHandler
	ChunkEmbedSubmit JobHandler
	ChunkEmbedPoll   JobHandler
}

type EnqueueRequest struct {
	JobType   string
	DedupeKey string
	Payload   map[string]any
	UserID    string
	UploadID  string
	PageID    string
}

var handlers Handlers
