package graph

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase/core"
)

type NodeType string

const (
	NodeTypeUpload      NodeType = "upload"
	NodeTypeHighlight   NodeType = "highlight"
	NodeTypeBookmark    NodeType = "bookmark"
	NodeTypeAuthor      NodeType = "author"
	NodeTypePublication NodeType = "publication"
	NodeTypeTag         NodeType = "tag"
	NodeTypeTopic       NodeType = "topic"
	NodeTypeNote        NodeType = "note"
)

type EdgeType string

const (
	EdgeTypeAuthoredBy  EdgeType = "authored_by"
	EdgeTypeTaggedWith  EdgeType = "tagged_with"
	EdgeTypeBelongsTo   EdgeType = "belongs_to"
	EdgeTypeHighlightOf EdgeType = "highlight_of"
	EdgeTypeBookmarkOf  EdgeType = "bookmark_of"
	EdgeTypeNoteOf      EdgeType = "note_of"
	EdgeTypePublishedBy EdgeType = "published_by"
	EdgeTypeAboutPerson EdgeType = "about_person"
	EdgeTypeLinksTo     EdgeType = "links_to"
	EdgeTypeSummaryOf   EdgeType = "summary_of"
)

type labelDataFunc func(*core.Record) (string, map[string]any)

var collectionNodeType = map[string]NodeType{
	collections.Uploads:      NodeTypeUpload,
	collections.People:       NodeTypeAuthor,
	collections.Publications: NodeTypePublication,
	collections.Tags:         NodeTypeTag,
	collections.Topics:       NodeTypeTopic,
	collections.Highlights:   NodeTypeHighlight,
	collections.Bookmarks:    NodeTypeBookmark,
	collections.Notes:        NodeTypeNote,
}

var collectionLabelData = map[string]labelDataFunc{
	collections.Uploads:      getUploadLabelAndData,
	collections.People:       getPersonLabelAndData,
	collections.Publications: getPublicationLabelAndData,
	collections.Tags:         getTagLabelAndData,
	collections.Topics:       getTopicLabelAndData,
	collections.Highlights:   getHighlightLabelAndData,
	collections.Bookmarks:    getBookmarkLabelAndData,
	collections.Notes:        getNoteLabelAndData,
}

var annotationUploadEdgeType = map[string]EdgeType{
	collections.Highlights: EdgeTypeHighlightOf,
	collections.Bookmarks:  EdgeTypeBookmarkOf,
	collections.Notes:      EdgeTypeNoteOf,
}
