package graph

import (
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// NodeType represents the type of entity a node represents
type NodeType string

const (
	NodeTypeUpload    NodeType = "upload"
	NodeTypeHighlight NodeType = "highlight"
	NodeTypeBookmark  NodeType = "bookmark"
	NodeTypeAuthor    NodeType = "author"
	NodeTypeTag       NodeType = "tag"
	NodeTypeTopic     NodeType = "topic"
	NodeTypePage      NodeType = "page"
)

// EdgeType represents the type of relationship between nodes
type EdgeType string

const (
	EdgeTypeAuthoredBy  EdgeType = "authored_by"
	EdgeTypeTaggedWith  EdgeType = "tagged_with"
	EdgeTypeBelongsTo   EdgeType = "belongs_to"
	EdgeTypeReferences  EdgeType = "references"
	EdgeTypeContains    EdgeType = "contains"
	EdgeTypeRelatedTo   EdgeType = "related_to"
	EdgeTypeHighlightOf EdgeType = "highlight_of"
	EdgeTypeBookmarkOf  EdgeType = "bookmark_of"
	EdgeTypeUserCreated EdgeType = "user_created"
)

// Init initializes all graph-related hooks
func Init(app *pocketbase.PocketBase) error {
	registerUploadHooks(app)
	registerAuthorHooks(app)
	registerTagHooks(app)
	registerTopicHooks(app)
	registerHighlightHooks(app)
	registerBookmarkHooks(app)
	registerPageHooks(app)

	return nil
}

// Helper function to create a node for a record
func createNode(app *pocketbase.PocketBase, recordId string, nodeType NodeType, name string, userId string) (*core.Record, error) {
	nodesCollection, err := app.FindCollectionByNameOrId(collections.Nodes)
	if err != nil {
		return nil, err
	}

	node := core.NewRecord(nodesCollection)
	node.Set("record", recordId)
	node.Set("type", string(nodeType))
	node.Set("name", name)
	if userId != "" {
		node.Set("user", userId)
	}

	if err := app.Save(node); err != nil {
		return nil, err
	}

	return node, nil
}

// Helper function to create an edge between two nodes
func createEdge(app *pocketbase.PocketBase, sourceNodeId string, targetNodeId string, edgeType EdgeType, userId string) error {
	edgesCollection, err := app.FindCollectionByNameOrId(collections.Edges)
	if err != nil {
		return err
	}

	edge := core.NewRecord(edgesCollection)
	edge.Set("source", sourceNodeId)
	edge.Set("target", targetNodeId)
	edge.Set("type", string(edgeType))
	if userId != "" {
		edge.Set("user", userId)
	}

	return app.Save(edge)
}

// Helper function to find a node by its record ID and type
func findNodeByRecord(app *pocketbase.PocketBase, recordId string, nodeType NodeType) (*core.Record, error) {
	nodes, err := app.FindRecordsByFilter(
		collections.Nodes,
		"record = {:recordId} && type = {:type}",
		"-created",
		1,
		0,
		map[string]interface{}{
			"recordId": recordId,
			"type":     string(nodeType),
		},
	)
	if err != nil || len(nodes) == 0 {
		return nil, err
	}
	return nodes[0], nil
}

// Helper function to delete a node and its edges
func deleteNodeAndEdges(app *pocketbase.PocketBase, recordId string, nodeType NodeType) error {
	node, err := findNodeByRecord(app, recordId, nodeType)
	if err != nil || node == nil {
		return err
	}

	// Delete all edges where this node is source or target
	edges, err := app.FindRecordsByFilter(
		collections.Edges,
		"source = {:nodeId} || target = {:nodeId}",
		"",
		0,
		0,
		map[string]interface{}{
			"nodeId": node.Id,
		},
	)
	if err == nil {
		for _, edge := range edges {
			app.Delete(edge)
		}
	}

	return app.Delete(node)
}

// Upload hooks
func registerUploadHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")
		title := upload.GetString("title")

		uploadNode, err := createNode(app, upload.Id, NodeTypeUpload, title, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for upload:", "error", err)
			return e.Next()
		}

		authorId := upload.GetString("author")
		if authorId != "" {
			authorNode, _ := findNodeByRecord(app, authorId, NodeTypeAuthor)
			if authorNode != nil {
				createEdge(app, uploadNode.Id, authorNode.Id, EdgeTypeAuthoredBy, userId)
			}
		}

		tags := upload.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, uploadNode.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
			}
		}

		topics := upload.GetStringSlice("topic")
		for _, topicId := range topics {
			topicNode, _ := findNodeByRecord(app, topicId, NodeTypeTopic)
			if topicNode != nil {
				createEdge(app, uploadNode.Id, topicNode.Id, EdgeTypeBelongsTo, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		uploadNode, err := findNodeByRecord(app, upload.Id, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			return e.Next()
		}

		uploadNode.Set("name", upload.GetString("title"))
		app.Save(uploadNode)

		oldEdges, _ := app.FindRecordsByFilter(
			collections.Edges,
			"source = {:nodeId} && (type = {:authoredBy} || type = {:taggedWith} || type = {:belongsTo})",
			"",
			0,
			0,
			map[string]interface{}{
				"nodeId":     uploadNode.Id,
				"authoredBy": string(EdgeTypeAuthoredBy),
				"taggedWith": string(EdgeTypeTaggedWith),
				"belongsTo":  string(EdgeTypeBelongsTo),
			},
		)
		for _, edge := range oldEdges {
			app.Delete(edge)
		}

		authorId := upload.GetString("author")
		if authorId != "" {
			authorNode, _ := findNodeByRecord(app, authorId, NodeTypeAuthor)
			if authorNode != nil {
				createEdge(app, uploadNode.Id, authorNode.Id, EdgeTypeAuthoredBy, userId)
			}
		}

		tags := upload.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, uploadNode.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
			}
		}

		topics := upload.GetStringSlice("topic")
		for _, topicId := range topics {
			topicNode, _ := findNodeByRecord(app, topicId, NodeTypeTopic)
			if topicNode != nil {
				createEdge(app, uploadNode.Id, topicNode.Id, EdgeTypeBelongsTo, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeUpload)
		return e.Next()
	})
}

// Author hooks
func registerAuthorHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Authors).BindFunc(func(e *core.RecordEvent) error {
		author := e.Record
		userId := author.GetString("user")
		name := author.GetString("name")

		_, err := createNode(app, author.Id, NodeTypeAuthor, name, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for author:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Authors).BindFunc(func(e *core.RecordEvent) error {
		author := e.Record
		node, _ := findNodeByRecord(app, author.Id, NodeTypeAuthor)
		if node != nil {
			node.Set("name", author.GetString("name"))
			app.Save(node)
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Authors).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeAuthor)
		return e.Next()
	})
}

// Tag hooks
func registerTagHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		tag := e.Record
		userId := tag.GetString("user")
		title := tag.GetString("title")

		_, err := createNode(app, tag.Id, NodeTypeTag, title, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for tag:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		tag := e.Record
		node, _ := findNodeByRecord(app, tag.Id, NodeTypeTag)
		if node != nil {
			node.Set("name", tag.GetString("title"))
			app.Save(node)
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeTag)
		return e.Next()
	})
}

// Topic hooks
func registerTopicHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		topic := e.Record
		userId := topic.GetString("user")
		title := topic.GetString("title")

		_, err := createNode(app, topic.Id, NodeTypeTopic, title, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for topic:", "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		topic := e.Record
		node, _ := findNodeByRecord(app, topic.Id, NodeTypeTopic)
		if node != nil {
			node.Set("name", topic.GetString("title"))
			app.Save(node)
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeTopic)
		return e.Next()
	})
}

// Highlight hooks
func registerHighlightHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		highlight := e.Record
		userId := highlight.GetString("user")
		text := highlight.GetString("text")
		if len(text) > 50 {
			text = text[:50] + "..."
		}

		highlightNode, err := createNode(app, highlight.Id, NodeTypeHighlight, text, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for highlight:", "error", err)
			return e.Next()
		}

		uploadId := highlight.GetString("upload")
		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, highlightNode.Id, uploadNode.Id, EdgeTypeHighlightOf, userId)
			}
		}

		tags := highlight.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, highlightNode.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		highlight := e.Record
		userId := highlight.GetString("user")

		node, _ := findNodeByRecord(app, highlight.Id, NodeTypeHighlight)
		if node != nil {
			text := highlight.GetString("text")
			if len(text) > 50 {
				text = text[:50] + "..."
			}
			node.Set("name", text)
			app.Save(node)

			oldEdges, _ := app.FindRecordsByFilter(
				collections.Edges,
				"source = {:nodeId} && type = {:taggedWith}",
				"",
				0,
				0,
				map[string]interface{}{
					"nodeId":     node.Id,
					"taggedWith": string(EdgeTypeTaggedWith),
				},
			)
			for _, edge := range oldEdges {
				app.Delete(edge)
			}

			tags := highlight.GetStringSlice("tags")
			for _, tagId := range tags {
				tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
				if tagNode != nil {
					createEdge(app, node.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
				}
			}
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeHighlight)
		return e.Next()
	})
}

// Bookmark hooks
func registerBookmarkHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bookmark := e.Record
		userId := bookmark.GetString("user")
		label := bookmark.GetString("label")
		if label == "" {
			label = "Bookmark"
		}

		bookmarkNode, err := createNode(app, bookmark.Id, NodeTypeBookmark, label, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for bookmark:", "error", err)
			return e.Next()
		}

		uploadId := bookmark.GetString("upload")
		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, bookmarkNode.Id, uploadNode.Id, EdgeTypeBookmarkOf, userId)
			}
		}

		tags := bookmark.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, bookmarkNode.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bookmark := e.Record
		userId := bookmark.GetString("user")

		node, _ := findNodeByRecord(app, bookmark.Id, NodeTypeBookmark)
		if node != nil {
			label := bookmark.GetString("label")
			if label == "" {
				label = "Bookmark"
			}
			node.Set("name", label)
			app.Save(node)

			oldEdges, _ := app.FindRecordsByFilter(
				collections.Edges,
				"source = {:nodeId} && type = {:taggedWith}",
				"",
				0,
				0,
				map[string]interface{}{
					"nodeId":     node.Id,
					"taggedWith": string(EdgeTypeTaggedWith),
				},
			)
			for _, edge := range oldEdges {
				app.Delete(edge)
			}

			tags := bookmark.GetStringSlice("tags")
			for _, tagId := range tags {
				tagNode, _ := findNodeByRecord(app, tagId, NodeTypeTag)
				if tagNode != nil {
					createEdge(app, node.Id, tagNode.Id, EdgeTypeTaggedWith, userId)
				}
			}
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypeBookmark)
		return e.Next()
	})
}

// Page hooks
func registerPageHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Pages).BindFunc(func(e *core.RecordEvent) error {
		page := e.Record
		pageNum := page.GetInt("page")
		uploadId := page.GetString("upload")

		var userId string
		if uploadId != "" {
			upload, err := app.FindRecordById(collections.Uploads, uploadId)
			if err == nil {
				userId = upload.GetString("user")
			}
		}

		pageName := fmt.Sprintf("Page %d", pageNum)
		pageNode, err := createNode(app, page.Id, NodeTypePage, pageName, userId)
		if err != nil {
			e.App.Logger().Error("Failed to create node for page:", "error", err)
			return e.Next()
		}

		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, pageNode.Id, uploadNode.Id, EdgeTypeContains, userId)
			}
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Pages).BindFunc(func(e *core.RecordEvent) error {
		deleteNodeAndEdges(app, e.Record.Id, NodeTypePage)
		return e.Next()
	})
}
