package graph

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type NodeType string

const (
	NodeTypeUpload    NodeType = "upload"
	NodeTypeHighlight NodeType = "highlight"
	NodeTypeBookmark  NodeType = "bookmark"
	NodeTypeAuthor    NodeType = "author"
	NodeTypeTag       NodeType = "tag"
	NodeTypeTopic     NodeType = "topic"
	NodeTypeNote      NodeType = "note"
)

type EdgeType string

const (
	EdgeTypeAuthoredBy  EdgeType = "authored_by"
	EdgeTypeTaggedWith  EdgeType = "tagged_with"
	EdgeTypeBelongsTo   EdgeType = "belongs_to"
	EdgeTypeHighlightOf EdgeType = "highlight_of"
	EdgeTypeBookmarkOf  EdgeType = "bookmark_of"
	EdgeTypeNoteOf      EdgeType = "note_of"
)

func Init(app *pocketbase.PocketBase) error {
	registerUploadHooks(app)
	registerAuthorHooks(app)
	registerTagHooks(app)
	registerTopicHooks(app)
	registerHighlightHooks(app)
	registerBookmarkHooks(app)
	registerNotesHooks(app)

	return nil
}

// func getCollectionForNodeType(nodeType string) (string, error) {
// 	switch NodeType(nodeType) {
// 	case NodeTypeUpload:
// 		return collections.Uploads, nil
// 	case NodeTypeHighlight:
// 		return collections.Highlights, nil
// 	case NodeTypeBookmark:
// 		return collections.Bookmarks, nil
// 	case NodeTypeAuthor:
// 		return collections.Authors, nil
// 	case NodeTypeTag:
// 		return collections.Tags, nil
// 	case NodeTypeTopic:
// 		return collections.Topics, nil
// 	case NodeTypeNote:
// 		return collections.Notes, nil
// 	default:
// 		return "", fmt.Errorf("unknown node type: %s", nodeType)
// 	}
// }

func createNode(app *pocketbase.PocketBase, recordId string, nodeType NodeType, userId string) (string, error) {
	nodesCollection, err := app.FindCollectionByNameOrId(collections.Nodes)
	if err != nil {
		return "", err
	}

	node := core.NewRecord(nodesCollection)
	node.Set("record_id", recordId)
	node.Set("type", string(nodeType))
	node.Set("user", userId)
	if err := app.Save(node); err != nil {
		return "", err
	}

	return node.Id, nil
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

func registerUploadHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		nodeId, err := createNode(app, upload.Id, NodeTypeUpload, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for upload:", "error", err)
			return e.Next()
		}

		authorId := upload.GetString("author")
		if authorId != "" {
			authorNode, _ := findNodeByRecord(app, authorId, userId, NodeTypeAuthor)
			if authorNode != nil {
				createEdge(app, authorNode.Id, nodeId, EdgeTypeAuthoredBy, userId)
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

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeUpload); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for upload:", "error", err)
		}
		return e.Next()
	})
}

func registerAuthorHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Authors).BindFunc(func(e *core.RecordEvent) error {
		author := e.Record
		userId := author.GetString("user")

		_, err := createNode(app, author.Id, NodeTypeAuthor, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for author:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Authors).BindFunc(func(e *core.RecordEvent) error {
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), NodeTypeAuthor); err != nil {
			e.App.Logger().Error("Failed to delete node and edges for author:", "error", err)
		}
		return e.Next()
	})
}

func registerTagHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		tag := e.Record
		userId := tag.GetString("user")

		_, err := createNode(app, tag.Id, NodeTypeTag, userId)
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
}

func registerTopicHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		topic := e.Record
		userId := topic.GetString("user")

		_, err := createNode(app, topic.Id, NodeTypeTopic, userId)
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
}

func registerHighlightHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		highlight := e.Record
		userId := highlight.GetString("user")

		highlightNodeId, err := createNode(app, highlight.Id, NodeTypeHighlight, userId)
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
}

func registerBookmarkHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bookmark := e.Record
		userId := bookmark.GetString("user")
		uploadId := bookmark.GetString("upload")
		tags := bookmark.GetStringSlice("tags")

		bookmarkNodeId, err := createNode(app, bookmark.Id, NodeTypeBookmark, userId)
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
}

func registerNotesHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		note := e.Record
		userId := note.GetString("user")
		uploadId := note.GetString("upload")
		tags := note.GetStringSlice("tags")

		noteNodeId, err := createNode(app, note.Id, NodeTypeNote, userId)
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
}
