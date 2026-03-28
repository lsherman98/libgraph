package graph

type NodeType string

const (
	NodeTypeUpload      NodeType = "upload"
	NodeTypeHighlight   NodeType = "highlight"
	NodeTypeBookmark    NodeType = "bookmark"
	NodeTypePerson      NodeType = "person"
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

type UploadData struct {
	Title    string `json:"title"`
	Type     string `json:"type"`
	NumPages int    `json:"num_pages"`
	Label    string `json:"label"`
}

type AuthorData struct {
	Name   string `json:"name"`
	Source string `json:"source"`
	Label  string `json:"label"`
}

type PublicationData struct {
	Name  string `json:"name"`
	URL   string `json:"url"`
	Label string `json:"label"`
}

type TagData struct {
	Title string `json:"title"`
	Label string `json:"label"`
}

type TopicData struct {
	Title string `json:"title"`
	Label string `json:"label"`
}

type HighlightData struct {
	Text    string `json:"text"`
	Color   string `json:"color"`
	Comment string `json:"comment"`
	Label   string `json:"label"`
}

type BookmarkData struct {
	Comment string `json:"comment"`
	PageNum int    `json:"page_number"`
	Label   string `json:"label"`
}

type NoteData struct {
	Content string `json:"content"`
	PageNum int    `json:"page_number"`
	Label   string `json:"label"`
}
