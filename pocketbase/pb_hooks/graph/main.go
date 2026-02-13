package graph

import (
	"encoding/json"
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/llama"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
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
)

func Init(app *pocketbase.PocketBase) error {
	registerUploadHooks(app)
	registerPeopleHooks(app)
	registerPublicationHooks(app)
	registerTagHooks(app)
	registerTopicHooks(app)
	registerHighlightHooks(app)
	registerBookmarkHooks(app)
	registerNotesHooks(app)

	return nil
}

func createNode(app *pocketbase.PocketBase, recordId string, nodeType NodeType, userId string, label string, data map[string]interface{}) (string, error) {
	nodesCollection, err := app.FindCollectionByNameOrId(collections.Nodes)
	if err != nil {
		return "", err
	}

	node := core.NewRecord(nodesCollection)
	node.Set("record_id", recordId)
	node.Set("type", string(nodeType))
	node.Set("user", userId)
	node.Set("label", label)

	if data != nil {
		jsonData, err := json.Marshal(data)
		if err == nil {
			node.Set("data", string(jsonData))
		}
	}

	if err := app.Save(node); err != nil {
		return "", err
	}

	return node.Id, nil
}

func updateNodeData(app *pocketbase.PocketBase, recordId string, userId string, nodeType NodeType, label string, data map[string]interface{}) error {
	node, err := findNodeByRecord(app, recordId, userId, nodeType)
	if err != nil || node == nil {
		return err
	}

	node.Set("label", label)

	if data != nil {
		jsonData, err := json.Marshal(data)
		if err == nil {
			node.Set("data", string(jsonData))
		}
	}

	return app.Save(node)
}

// Helper functions to extract label and data from records

func getUploadLabelAndData(record *core.Record) (string, map[string]interface{}) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Upload"
	}
	data := map[string]interface{}{
		"title":     title,
		"type":      record.GetString("type"),
		"status":    record.GetString("status"),
		"num_pages": record.GetInt("num_pages"),
	}
	return title, data
}

func getPersonLabelAndData(record *core.Record) (string, map[string]interface{}) {
	name := record.GetString("name")
	if name == "" {
		name = "Unknown Person"
	}
	data := map[string]interface{}{
		"name":   name,
		"type":   record.GetString("type"),
		"source": record.GetString("source"),
	}
	return name, data
}

func getPublicationLabelAndData(record *core.Record) (string, map[string]interface{}) {
	name := record.GetString("name")
	if name == "" {
		name = "Unknown Publication"
	}
	data := map[string]interface{}{
		"name": name,
		"type": record.GetString("type"),
		"url":  record.GetString("url"),
	}
	return name, data
}

func getTagLabelAndData(record *core.Record) (string, map[string]interface{}) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Tag"
	}
	data := map[string]interface{}{
		"title": title,
	}
	return title, data
}

func getTopicLabelAndData(record *core.Record) (string, map[string]interface{}) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Topic"
	}
	data := map[string]interface{}{
		"title": title,
	}
	return title, data
}

func getHighlightLabelAndData(record *core.Record) (string, map[string]interface{}) {
	text := record.GetString("text")
	label := text
	if len(label) > 40 {
		label = label[:40] + "..."
	}
	if label == "" {
		label = "Highlight"
	}
	data := map[string]interface{}{
		"text":    text,
		"color":   record.GetString("color"),
		"comment": record.GetString("comment"),
	}
	return label, data
}

func getBookmarkLabelAndData(record *core.Record) (string, map[string]interface{}) {
	comment := record.GetString("comment")
	pageNum := record.GetInt("page_number")
	label := comment
	if label == "" {
		if pageNum > 0 {
			label = fmt.Sprintf("Bookmark p.%d", pageNum)
		} else {
			label = "Bookmark"
		}
	}
	if len(label) > 40 {
		label = label[:40] + "..."
	}
	data := map[string]interface{}{
		"comment":     comment,
		"page_number": pageNum,
	}
	return label, data
}

func getNoteLabelAndData(record *core.Record) (string, map[string]interface{}) {
	content := record.GetString("content")
	pageNum := record.GetInt("page_number")
	label := content
	if len(label) > 40 {
		label = label[:40] + "..."
	}
	if label == "" {
		if pageNum > 0 {
			label = fmt.Sprintf("Note p.%d", pageNum)
		} else {
			label = "Note"
		}
	}
	data := map[string]interface{}{
		"content":     content,
		"page_number": pageNum,
	}
	return label, data
}

func createEdge(app *pocketbase.PocketBase, sourceNodeId string, targetNodeId string, edgeType EdgeType, userId string) error {
	edgesCollection, err := app.FindCollectionByNameOrId(collections.Edges)
	if err != nil {
		return err
	}

	edge := core.NewRecord(edgesCollection)
	edge.Set("source", sourceNodeId)
	edge.Set("target", targetNodeId)
	edge.Set("type", string(edgeType))
	edge.Set("user", userId)

	return app.Save(edge)
}

func findNodeByRecord(app *pocketbase.PocketBase, recordId string, userId string, nodeType NodeType) (*core.Record, error) {
	node, err := app.FindFirstRecordByFilter(
		collections.Nodes,
		"record_id = {:recordId} && type = {:type} && user = {:userId}",
		dbx.Params{"recordId": recordId, "type": string(nodeType), "userId": userId},
	)
	if err != nil || node == nil {
		return nil, err
	}

	return node, nil
}

func deleteNodeAndEdges(app *pocketbase.PocketBase, recordId string, userId string, nodeType NodeType) error {
	node, err := findNodeByRecord(app, recordId, userId, nodeType)
	if err != nil || node == nil {
		return err
	}

	edges, err := app.FindRecordsByFilter(
		collections.Edges,
		"(source = {:nodeId} || target = {:nodeId}) && user = {:userId}",
		"",
		0,
		0,
		dbx.Params{"nodeId": node.Id, "userId": userId},
	)
	if err == nil {
		for _, edge := range edges {
			app.Delete(edge)
		}
	}

	return app.Delete(node)
}

// syncEdgesForRelation syncs edges between a source node and a set of target records.
// It deletes edges that are no longer needed and creates new ones.
func syncEdgesForRelation(app *pocketbase.PocketBase, sourceNodeId string, targetRecordIds []string, targetNodeType NodeType, edgeType EdgeType, userId string, sourceIsTarget bool) error {
	// Find all existing edges of this type from/to source node
	var filterStr string
	if sourceIsTarget {
		filterStr = fmt.Sprintf("target = '%s' && type = '%s' && user = '%s'", sourceNodeId, string(edgeType), userId)
	} else {
		filterStr = fmt.Sprintf("source = '%s' && type = '%s' && user = '%s'", sourceNodeId, string(edgeType), userId)
	}

	existingEdges, err := app.FindRecordsByFilter(
		collections.Edges,
		filterStr,
		"",
		0,
		0,
		dbx.Params{},
	)
	if err != nil {
		existingEdges = []*core.Record{}
	}

	// Build a set of existing target/source node IDs
	existingMap := map[string]*core.Record{}
	for _, edge := range existingEdges {
		if sourceIsTarget {
			existingMap[edge.GetString("source")] = edge
		} else {
			existingMap[edge.GetString("target")] = edge
		}
	}

	// Build set of desired target node IDs
	desiredMap := map[string]bool{}
	for _, recordId := range targetRecordIds {
		targetNode, _ := findNodeByRecord(app, recordId, userId, targetNodeType)
		if targetNode != nil {
			desiredMap[targetNode.Id] = true
		}
	}

	// Delete edges no longer needed
	for nodeId, edge := range existingMap {
		if !desiredMap[nodeId] {
			app.Delete(edge)
		}
	}

	// Create new edges
	for nodeId := range desiredMap {
		if _, exists := existingMap[nodeId]; !exists {
			if sourceIsTarget {
				createEdge(app, nodeId, sourceNodeId, edgeType, userId)
			} else {
				createEdge(app, sourceNodeId, nodeId, edgeType, userId)
			}
		}
	}

	return nil
}

// syncSingleEdge syncs a single relation (e.g. publication) for a node.
func syncSingleEdge(app *pocketbase.PocketBase, sourceNodeId string, targetRecordId string, targetNodeType NodeType, edgeType EdgeType, userId string, sourceIsTarget bool) error {
	if targetRecordId == "" {
		return syncEdgesForRelation(app, sourceNodeId, []string{}, targetNodeType, edgeType, userId, sourceIsTarget)
	}
	return syncEdgesForRelation(app, sourceNodeId, []string{targetRecordId}, targetNodeType, edgeType, userId, sourceIsTarget)
}

func registerUploadHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		label, data := getUploadLabelAndData(upload)
		nodeId, err := createNode(app, upload.Id, NodeTypeUpload, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for upload:", "error", err)
			return e.Next()
		}

		// Create edges for subjects (people the upload is about)
		subjects := upload.GetStringSlice("subjects")
		for _, subjectId := range subjects {
			subjectNode, _ := findNodeByRecord(app, subjectId, userId, NodeTypeAuthor)
			if subjectNode != nil {
				createEdge(app, subjectNode.Id, nodeId, EdgeTypeAboutPerson, userId)
			}
		}

		// Create edge for publication (source of the upload)
		publicationId := upload.GetString("publication")
		if publicationId != "" {
			pubNode, _ := findNodeByRecord(app, publicationId, userId, NodeTypePublication)
			if pubNode != nil {
				createEdge(app, pubNode.Id, nodeId, EdgeTypePublishedBy, userId)
			}
		}

		tags := upload.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, nodeId, EdgeTypeTaggedWith, userId)
			}
		}

		topics := upload.GetStringSlice("topic")
		for _, topicId := range topics {
			topicNode, _ := findNodeByRecord(app, topicId, userId, NodeTypeTopic)
			if topicNode != nil {
				createEdge(app, topicNode.Id, nodeId, EdgeTypeBelongsTo, userId)
			}
		}

		// Create edges for related/linked uploads
		relatedUploads := upload.GetStringSlice("upload")
		for _, relatedId := range relatedUploads {
			relatedNode, _ := findNodeByRecord(app, relatedId, userId, NodeTypeUpload)
			if relatedNode != nil {
				createEdge(app, nodeId, relatedNode.Id, EdgeTypeLinksTo, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeUpload); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for upload:", "error", err)
		}

		// Remove document from LlamaIndex pipeline
		llamaFileId := e.Record.GetString("llama_file_id")
		if llamaFileId != "" {
			llamaClient, err := llama.New(app)
			if err != nil {
				e.App.Logger().Error("Failed to create LlamaIndex client:", "error", err)
			} else if err := llamaClient.DeletePipelineDocument(llamaFileId); err != nil {
				e.App.Logger().Error("Failed to delete document from pipeline:", "error", err, "llama_file_id", llamaFileId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")
		label, data := getUploadLabelAndData(upload)
		if err := updateNodeData(app, upload.Id, userId, NodeTypeUpload, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for upload:", "error", err)
		}

		// Sync all edges for the upload
		uploadNode, err := findNodeByRecord(app, upload.Id, userId, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			e.App.Logger().Error("Failed to find upload node for edge sync:", "error", err)
			return e.Next()
		}

		// Sync subjects (about_person) - subject node is source, upload node is target
		subjects := upload.GetStringSlice("subjects")
		if err := syncEdgesForRelation(app, uploadNode.Id, subjects, NodeTypeAuthor, EdgeTypeAboutPerson, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync subject edges:", "error", err)
		}

		// Sync publication (published_by) - publication node is source, upload node is target
		publicationId := upload.GetString("publication")
		if err := syncSingleEdge(app, uploadNode.Id, publicationId, NodeTypePublication, EdgeTypePublishedBy, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync publication edge:", "error", err)
		}

		// Sync tags (tagged_with) - tag node is source, upload node is target
		tags := upload.GetStringSlice("tags")
		if err := syncEdgesForRelation(app, uploadNode.Id, tags, NodeTypeTag, EdgeTypeTaggedWith, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync tag edges:", "error", err)
		}

		// Sync topics (belongs_to) - topic node is source, upload node is target
		topics := upload.GetStringSlice("topic")
		if err := syncEdgesForRelation(app, uploadNode.Id, topics, NodeTypeTopic, EdgeTypeBelongsTo, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync topic edges:", "error", err)
		}

		// Sync related uploads (links_to) - upload node is source, related node is target
		relatedUploads := upload.GetStringSlice("upload")
		if err := syncEdgesForRelation(app, uploadNode.Id, relatedUploads, NodeTypeUpload, EdgeTypeLinksTo, userId, false); err != nil {
			e.App.Logger().Error("Failed to sync related upload edges:", "error", err)
		}

		return e.Next()
	})
}

func registerPeopleHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		person := e.Record
		userId := person.GetString("user")

		label, data := getPersonLabelAndData(person)
		_, err := createNode(app, person.Id, NodeTypeAuthor, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for person:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeAuthor); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for person:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		person := e.Record
		userId := person.GetString("user")
		label, data := getPersonLabelAndData(person)
		if err := updateNodeData(app, person.Id, userId, NodeTypeAuthor, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for person:", "error", err)
		}
		return e.Next()
	})
}

func registerPublicationHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		pub := e.Record
		// Publications don't have a user field, use empty string
		// The node will be associated via edges to uploads which have users
		userId := pub.GetString("user")

		label, data := getPublicationLabelAndData(pub)
		_, err := createNode(app, pub.Id, NodeTypePublication, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for publication:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypePublication); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for publication:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		pub := e.Record
		userId := pub.GetString("user")
		label, data := getPublicationLabelAndData(pub)
		if err := updateNodeData(app, pub.Id, userId, NodeTypePublication, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for publication:", "error", err)
		}
		return e.Next()
	})
}

func registerTagHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		tag := e.Record
		userId := tag.GetString("user")

		label, data := getTagLabelAndData(tag)
		_, err := createNode(app, tag.Id, NodeTypeTag, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for tag:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeTag); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for tag:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		tag := e.Record
		userId := tag.GetString("user")
		label, data := getTagLabelAndData(tag)
		if err := updateNodeData(app, tag.Id, userId, NodeTypeTag, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for tag:", "error", err)
		}
		return e.Next()
	})
}

func registerTopicHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		topic := e.Record
		userId := topic.GetString("user")

		label, data := getTopicLabelAndData(topic)
		_, err := createNode(app, topic.Id, NodeTypeTopic, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for topic:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeTopic); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for topic:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		topic := e.Record
		userId := topic.GetString("user")
		label, data := getTopicLabelAndData(topic)
		if err := updateNodeData(app, topic.Id, userId, NodeTypeTopic, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for topic:", "error", err)
		}
		return e.Next()
	})
}

func registerHighlightHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		highlight := e.Record
		userId := highlight.GetString("user")

		label, data := getHighlightLabelAndData(highlight)
		highlightNodeId, err := createNode(app, highlight.Id, NodeTypeHighlight, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for highlight:", "error", err)
			return e.Next()
		}

		uploadId := highlight.GetString("upload")
		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, userId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, uploadNode.Id, highlightNodeId, EdgeTypeHighlightOf, userId)
			}
		}

		tags := highlight.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, highlightNodeId, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeHighlight); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for highlight:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		highlight := e.Record
		userId := highlight.GetString("user")
		label, data := getHighlightLabelAndData(highlight)
		if err := updateNodeData(app, highlight.Id, userId, NodeTypeHighlight, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for highlight:", "error", err)
		}
		return e.Next()
	})
}

func registerBookmarkHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bookmark := e.Record
		userId := bookmark.GetString("user")
		uploadId := bookmark.GetString("upload")
		tags := bookmark.GetStringSlice("tags")

		label, data := getBookmarkLabelAndData(bookmark)
		bookmarkNodeId, err := createNode(app, bookmark.Id, NodeTypeBookmark, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for bookmark:", "error", err)
			return e.Next()
		}

		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, userId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, uploadNode.Id, bookmarkNodeId, EdgeTypeBookmarkOf, userId)
			}
		}

		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, bookmarkNodeId, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeBookmark); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for bookmark:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bookmark := e.Record
		userId := bookmark.GetString("user")
		label, data := getBookmarkLabelAndData(bookmark)
		if err := updateNodeData(app, bookmark.Id, userId, NodeTypeBookmark, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for bookmark:", "error", err)
		}
		return e.Next()
	})
}

func registerNotesHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		note := e.Record
		userId := note.GetString("user")
		uploadId := note.GetString("upload")
		tags := note.GetStringSlice("tags")

		label, data := getNoteLabelAndData(note)
		noteNodeId, err := createNode(app, note.Id, NodeTypeNote, userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node for note:", "error", err)
			return e.Next()
		}

		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, userId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, uploadNode.Id, noteNodeId, EdgeTypeNoteOf, userId)
			}
		}

		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, noteNodeId, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeNote); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for note:", "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		note := e.Record
		userId := note.GetString("user")
		label, data := getNoteLabelAndData(note)
		if err := updateNodeData(app, note.Id, userId, NodeTypeNote, label, data); err != nil {
			e.App.Logger().Error("Failed to update node data for note:", "error", err)
		}
		return e.Next()
	})
}
