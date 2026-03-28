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
	queuePollInterval = 10 * time.Second
	embedPollInterval = 120 * time.Second
)

type Worker struct {
	name     string
	jobType  string
	limit    int
	interval time.Duration
}

type JobHandler func(app core.App, job *core.Record) error

type EnqueueRequest struct {
	JobType               string
	DedupeKey             string
	Payload               map[string]any
	UserID                string
	UploadID              string
	PageID                string
	AllowRequeueOnSuccess bool
}

var (
	handlers = map[string]JobHandler{}
)
