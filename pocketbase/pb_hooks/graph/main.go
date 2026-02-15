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

func Init(app *pocketbase.PocketBase) error {
	registerUploadHooks(app)
	registerSimpleNodeHooks(app)
	registerAnnotationCreateHooks(app)

	return nil
}

func createNode(app *pocketbase.PocketBase, recordId string, nodeType NodeType, userId string, label string, data map[string]any) (string, error) {
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

func updateNodeData(app *pocketbase.PocketBase, recordId string, userId string, nodeType NodeType, label string, data map[string]any) error {
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

func getUploadLabelAndData(record *core.Record) (string, map[string]any) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Upload"
	}

	data := map[string]any{
		"title":     title,
		"type":      record.GetString("type"),
		"num_pages": record.GetInt("num_pages"),
	}

	return title, data
}

func getPersonLabelAndData(record *core.Record) (string, map[string]any) {
	name := record.GetString("name")
	if name == "" {
		name = "Unknown Person"
	}

	data := map[string]any{
		"name":   name,
		"type":   record.GetString("type"),
		"source": record.GetString("source"),
	}

	return name, data
}

func getPublicationLabelAndData(record *core.Record) (string, map[string]any) {
	name := record.GetString("name")
	if name == "" {
		name = "Unknown Publication"
	}

	data := map[string]any{
		"name": name,
		"type": record.GetString("type"),
		"url":  record.GetString("url"),
	}

	return name, data
}

func getTagLabelAndData(record *core.Record) (string, map[string]any) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Tag"
	}

	data := map[string]any{
		"title": title,
	}

	return title, data
}

func getTopicLabelAndData(record *core.Record) (string, map[string]any) {
	title := record.GetString("title")
	if title == "" {
		title = "Untitled Topic"
	}

	data := map[string]any{
		"title": title,
	}

	return title, data
}

func getHighlightLabelAndData(record *core.Record) (string, map[string]any) {
	text := record.GetString("text")
	label := text
	if len(label) > 40 {
		label = label[:40] + "..."
	}
	if label == "" {
		label = "Highlight"
	}

	data := map[string]any{
		"text":    text,
		"color":   record.GetString("color"),
		"comment": record.GetString("comment"),
	}

	return label, data
}

func getBookmarkLabelAndData(record *core.Record) (string, map[string]any) {
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

	data := map[string]any{
		"comment":     comment,
		"page_number": pageNum,
	}

	return label, data
}

func getNoteLabelAndData(record *core.Record) (string, map[string]any) {
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

	data := map[string]any{
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

	return app.Delete(node)
}

func syncEdgesForRelation(app *pocketbase.PocketBase, sourceNodeId string, targetRecordIds []string, targetNodeType NodeType, edgeType EdgeType, userId string, sourceIsTarget bool) error {
	var filterStr string
	if sourceIsTarget {
		filterStr = "target = {:nodeId} && type = {:edgeType} && user = {:userId}"
	} else {
		filterStr = "source = {:nodeId} && type = {:edgeType} && user = {:userId}"
	}

	existingEdges, err := app.FindRecordsByFilter(
		collections.Edges,
		filterStr,
		"",
		0,
		0,
		dbx.Params{"nodeId": sourceNodeId, "edgeType": string(edgeType), "userId": userId},
	)
	if err != nil {
		existingEdges = []*core.Record{}
	}

	existingMap := map[string]*core.Record{}
	for _, edge := range existingEdges {
		if sourceIsTarget {
			existingMap[edge.GetString("source")] = edge
		} else {
			existingMap[edge.GetString("target")] = edge
		}
	}

	desiredMap := map[string]bool{}
	for _, recordId := range targetRecordIds {
		targetNode, _ := findNodeByRecord(app, recordId, userId, targetNodeType)
		if targetNode != nil {
			desiredMap[targetNode.Id] = true
		}
	}

	for nodeId, edge := range existingMap {
		if !desiredMap[nodeId] {
			app.Delete(edge)
		}
	}

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

		subjects := upload.GetStringSlice("people")
		for _, subjectId := range subjects {
			subjectNode, _ := findNodeByRecord(app, subjectId, userId, NodeTypeAuthor)
			if subjectNode != nil {
				createEdge(app, subjectNode.Id, nodeId, EdgeTypeAboutPerson, userId)
			}
		}

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

		topics := upload.GetStringSlice("topics")
		for _, topicId := range topics {
			topicNode, _ := findNodeByRecord(app, topicId, userId, NodeTypeTopic)
			if topicNode != nil {
				createEdge(app, topicNode.Id, nodeId, EdgeTypeBelongsTo, userId)
			}
		}

		relatedUploads := upload.GetStringSlice("uploads")
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

		llamaFileId := e.Record.GetString("llama_file_id")
		if llamaFileId != "" {
			llamaClient, err := llama.New(app)
			if err != nil {
				e.App.Logger().Error("Failed to create LlamaIndex client:", "error", err)
			} else if err := llamaClient.DeletePipelineFile(llamaFileId); err != nil {
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

		uploadNode, err := findNodeByRecord(app, upload.Id, userId, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			e.App.Logger().Error("Failed to find upload node for edge sync:", "error", err)
			return e.Next()
		}

		subjects := upload.GetStringSlice("people")
		if err := syncEdgesForRelation(app, uploadNode.Id, subjects, NodeTypeAuthor, EdgeTypeAboutPerson, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync subject edges:", "error", err)
		}

		publicationId := upload.GetString("publication")
		if err := syncSingleEdge(app, uploadNode.Id, publicationId, NodeTypePublication, EdgeTypePublishedBy, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync publication edge:", "error", err)
		}

		tags := upload.GetStringSlice("tags")
		if err := syncEdgesForRelation(app, uploadNode.Id, tags, NodeTypeTag, EdgeTypeTaggedWith, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync tag edges:", "error", err)
		}

		topics := upload.GetStringSlice("topics")
		if err := syncEdgesForRelation(app, uploadNode.Id, topics, NodeTypeTopic, EdgeTypeBelongsTo, userId, true); err != nil {
			e.App.Logger().Error("Failed to sync topic edges:", "error", err)
		}

		relatedUploads := upload.GetStringSlice("uploads")
		if err := syncEdgesForRelation(app, uploadNode.Id, relatedUploads, NodeTypeUpload, EdgeTypeLinksTo, userId, false); err != nil {
			e.App.Logger().Error("Failed to sync related upload edges:", "error", err)
		}

		return e.Next()
	})
}

func registerSimpleNodeHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(
		collections.People, collections.Publications, collections.Tags, collections.Topics,
	).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		if _, err := createNode(app, record.Id, collectionNodeType[collName], userId, label, data); err != nil {
			e.App.Logger().Error("Failed to create node:", "collection", collName, "error", err)
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(
		collections.People, collections.Publications, collections.Tags, collections.Topics,
		collections.Highlights, collections.Bookmarks, collections.Notes,
	).BindFunc(func(e *core.RecordEvent) error {
		collName := e.Record.Collection().Name
		if err := deleteNodeAndEdges(app, e.Record.Id, e.Record.GetString("user"), collectionNodeType[collName]); err != nil {
			e.App.Logger().Error("Failed to delete node and edges:", "collection", collName, "error", err)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(
		collections.People, collections.Publications, collections.Tags, collections.Topics,
		collections.Highlights, collections.Bookmarks, collections.Notes,
	).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		if err := updateNodeData(app, record.Id, userId, collectionNodeType[collName], label, data); err != nil {
			e.App.Logger().Error("Failed to update node data:", "collection", collName, "error", err)
		}
		return e.Next()
	})
}

func registerAnnotationCreateHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(
		collections.Highlights, collections.Bookmarks, collections.Notes,
	).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		nodeId, err := createNode(app, record.Id, collectionNodeType[collName], userId, label, data)
		if err != nil {
			e.App.Logger().Error("Failed to create node:", "collection", collName, "error", err)
			return e.Next()
		}

		uploadId := record.GetString("upload")
		if uploadId != "" {
			uploadNode, _ := findNodeByRecord(app, uploadId, userId, NodeTypeUpload)
			if uploadNode != nil {
				createEdge(app, uploadNode.Id, nodeId, annotationUploadEdgeType[collName], userId)
			}
		}

		tags := record.GetStringSlice("tags")
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, nodeId, EdgeTypeTaggedWith, userId)
			}
		}

		return e.Next()
	})
}
