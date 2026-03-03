package graph

import (
	"encoding/json"
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/lsherman98/libgraph/pocketbase/pb_hooks/proxyhooks"
	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	phooks := proxyhooks.Get(app)
	registerUploadHooks(app, phooks)
	registerSimpleNodeHooks(app, phooks)
	registerAnnotationCreateHooks(app, phooks)
	registerSummaryHooks(app, phooks)

	return nil
}

func createNode(app *pocketbase.PocketBase, recordId string, nodeType NodeType, userId string, label string, data map[string]any) (string, error) {
	nodesCollection, err := app.FindCollectionByNameOrId(collections.Nodes)
	if err != nil {
		return "", err
	}

	node := core.NewRecord(nodesCollection)
	nodeProxy, _ := pbgen.WrapRecord[pbgen.Nodes](node)
	node.Set("record_id", recordId)
	node.Set("type", string(nodeType))
	node.Set("user", userId)
	if nodeProxy != nil {
		nodeProxy.SetLabel(label)
	} else {
		node.Set("label", label)
	}
	if nodeProxy != nil {
		nodeProxy.SetRecordId(recordId)
	}

	if data != nil {
		jsonData, err := json.Marshal(data)
		if err == nil {
			if nodeProxy != nil {
				nodeProxy.SetData(string(jsonData))
			} else {
				node.Set("data", string(jsonData))
			}
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

	nodeProxy, _ := pbgen.WrapRecord[pbgen.Nodes](node)
	if nodeProxy != nil {
		nodeProxy.SetLabel(label)
	} else {
		node.Set("label", label)
	}

	if data != nil {
		jsonData, err := json.Marshal(data)
		if err == nil {
			if nodeProxy != nil {
				nodeProxy.SetData(string(jsonData))
			} else {
				node.Set("data", string(jsonData))
			}
		}
	}

	return app.Save(node)
}

func getUploadLabelAndData(record *core.Record) (string, map[string]any) {
	uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](record)
	title := record.GetString("title")
	typeValue := record.GetString("type")
	numPages := record.GetInt("num_pages")
	if uploadProxy != nil {
		title = uploadProxy.Title()
		typeValue = uploadProxy.Record.GetString("type")
		numPages = int(uploadProxy.NumPages())
	}
	if title == "" {
		title = "Untitled Upload"
	}

	data := map[string]any{
		"title":     title,
		"type":      typeValue,
		"num_pages": numPages,
	}

	return title, data
}

func getPersonLabelAndData(record *core.Record) (string, map[string]any) {
	personProxy, _ := pbgen.WrapRecord[pbgen.People](record)
	name := record.GetString("name")
	typeValue := record.GetString("type")
	source := record.GetString("source")
	if personProxy != nil {
		name = personProxy.Name()
		typeValue = personProxy.Record.GetString("type")
		source = personProxy.Source()
	}
	if name == "" {
		name = "Unknown Person"
	}

	data := map[string]any{
		"name":   name,
		"type":   typeValue,
		"source": source,
	}

	return name, data
}

func getPublicationLabelAndData(record *core.Record) (string, map[string]any) {
	publicationProxy, _ := pbgen.WrapRecord[pbgen.Publications](record)
	name := record.GetString("name")
	typeValue := record.GetString("type")
	url := record.GetString("url")
	if publicationProxy != nil {
		name = publicationProxy.Name()
		typeValue = publicationProxy.Record.GetString("type")
		url = publicationProxy.Url()
	}
	if name == "" {
		name = "Unknown Publication"
	}

	data := map[string]any{
		"name": name,
		"type": typeValue,
		"url":  url,
	}

	return name, data
}

func getTagLabelAndData(record *core.Record) (string, map[string]any) {
	tagProxy, _ := pbgen.WrapRecord[pbgen.Tags](record)
	title := record.GetString("title")
	if tagProxy != nil {
		title = tagProxy.Title()
	}
	if title == "" {
		title = "Untitled Tag"
	}

	data := map[string]any{
		"title": title,
	}

	return title, data
}

func getTopicLabelAndData(record *core.Record) (string, map[string]any) {
	topicProxy, _ := pbgen.WrapRecord[pbgen.Topics](record)
	title := record.GetString("title")
	if topicProxy != nil {
		title = topicProxy.Title()
	}
	if title == "" {
		title = "Untitled Topic"
	}

	data := map[string]any{
		"title": title,
	}

	return title, data
}

func getHighlightLabelAndData(record *core.Record) (string, map[string]any) {
	highlightProxy, _ := pbgen.WrapRecord[pbgen.Highlights](record)
	text := record.GetString("text")
	color := record.GetString("color")
	comment := record.GetString("comment")
	if highlightProxy != nil {
		text = highlightProxy.Text()
		color = highlightProxy.Record.GetString("color")
		comment = highlightProxy.Comment()
	}
	label := text
	if len(label) > 40 {
		label = label[:40] + "..."
	}
	if label == "" {
		label = "Highlight"
	}

	data := map[string]any{
		"text":    text,
		"color":   color,
		"comment": comment,
	}

	return label, data
}

func getBookmarkLabelAndData(record *core.Record) (string, map[string]any) {
	bookmarkProxy, _ := pbgen.WrapRecord[pbgen.Bookmarks](record)
	comment := record.GetString("comment")
	pageNum := record.GetInt("page_number")
	if bookmarkProxy != nil {
		comment = bookmarkProxy.Comment()
		pageNum = int(bookmarkProxy.PageNumber())
	}
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
	noteProxy, _ := pbgen.WrapRecord[pbgen.Notes](record)
	content := record.GetString("content")
	pageNum := record.GetInt("page_number")
	if noteProxy != nil {
		content = noteProxy.Content()
		pageNum = int(noteProxy.PageNumber())
	}
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
	edgeProxy, _ := pbgen.WrapRecord[pbgen.Edges](edge)
	edge.Set("source", sourceNodeId)
	edge.Set("target", targetNodeId)
	edge.Set("type", string(edgeType))
	edge.Set("user", userId)
	if edgeProxy != nil {
		edgeProxy.SetProxyRecord(edge)
	}

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
		edgeProxy, _ := pbgen.WrapRecord[pbgen.Edges](edge)
		sourceID := edge.GetString("source")
		targetID := edge.GetString("target")
		if edgeProxy != nil {
			sourceID = edgeProxy.GetString("source")
			targetID = edgeProxy.GetString("target")
		}
		if sourceIsTarget {
			existingMap[sourceID] = edge
		} else {
			existingMap[targetID] = edge
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
			if err := app.Delete(edge); err != nil {
				app.Logger().Error("failed to delete stale edge", "edge_id", edge.Id, "error", err)
			}
		}
	}

	for nodeId := range desiredMap {
		if _, exists := existingMap[nodeId]; !exists {
			var err error
			if sourceIsTarget {
				err = createEdge(app, nodeId, sourceNodeId, edgeType, userId)
			} else {
				err = createEdge(app, sourceNodeId, nodeId, edgeType, userId)
			}
			if err != nil {
				app.Logger().Error("failed to create edge", "source", sourceNodeId, "target", nodeId, "error", err)
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

func ensureUploadNode(app *pocketbase.PocketBase, uploadRecordId string, userId string) (*core.Record, error) {
	if uploadRecordId == "" {
		return nil, nil
	}

	existingNode, err := findNodeByRecord(app, uploadRecordId, userId, NodeTypeUpload)
	if err != nil {
		return nil, err
	}
	if existingNode != nil {
		return existingNode, nil
	}

	uploadRecord, err := app.FindRecordById(collections.Uploads, uploadRecordId)
	if err != nil {
		return nil, err
	}

	label, data := getUploadLabelAndData(uploadRecord)
	if _, err := createNode(app, uploadRecord.Id, NodeTypeUpload, userId, label, data); err != nil {
		return nil, err
	}

	return findNodeByRecord(app, uploadRecordId, userId, NodeTypeUpload)
}

func resolveSummaryFields(app *pocketbase.PocketBase, summaryRecord *core.Record) (string, string, string, error) {
	userId := summaryRecord.GetString("user")
	sourceUploadID := summaryRecord.GetString("source_upload")
	sourcePageID := summaryRecord.GetString("source_page")
	summaryUploadID := summaryRecord.GetString("summary_upload")

	if summaryProxy, err := pbgen.WrapRecord[pbgen.Summaries](summaryRecord); err == nil {
		userId = summaryProxy.GetString("user")
		sourceUploadID = summaryProxy.GetString("source_upload")
		sourcePageID = summaryProxy.GetString("source_page")
		summaryUploadID = summaryProxy.GetString("summary_upload")
	}

	if sourceUploadID == "" && sourcePageID != "" {
		sourcePageRecord, err := app.FindRecordById(collections.Pages, sourcePageID)
		if err != nil {
			return userId, "", summaryUploadID, err
		}

		sourceUploadID = sourcePageRecord.GetString("upload")
		if sourcePageProxy, err := pbgen.WrapRecord[pbgen.Pages](sourcePageRecord); err == nil {
			sourceUploadID = sourcePageProxy.GetString("upload")
		}
	}

	return userId, sourceUploadID, summaryUploadID, nil
}

func syncSummaryGraphEdge(app *pocketbase.PocketBase, summaryRecord *core.Record) {
	userId, sourceUploadID, summaryUploadID, err := resolveSummaryFields(app, summaryRecord)
	if err != nil {
		app.Logger().Error("failed to resolve summary source relation", "summary_id", summaryRecord.Id, "error", err)
		return
	}

	if summaryUploadID == "" {
		app.Logger().Error("summary record missing summary_upload relation", "summary_id", summaryRecord.Id)
		return
	}

	summaryNode, err := ensureUploadNode(app, summaryUploadID, userId)
	if err != nil || summaryNode == nil {
		app.Logger().Error("failed to ensure summary upload node", "summary_id", summaryRecord.Id, "upload_id", summaryUploadID, "error", err)
		return
	}

	if sourceUploadID == "" {
		if err := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
			app.Logger().Error("failed to clear summary source edges", "summary_id", summaryRecord.Id, "error", err)
		}
		return
	}

	if _, err := ensureUploadNode(app, sourceUploadID, userId); err != nil {
		if clearErr := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); clearErr != nil {
			app.Logger().Error("failed to clear summary source edges after source ensure failure", "summary_id", summaryRecord.Id, "error", clearErr)
		}
		app.Logger().Warn("failed to ensure source upload node; cleared summary edge", "summary_id", summaryRecord.Id, "upload_id", sourceUploadID, "error", err)
		return
	}

	if err := syncSingleEdge(app, summaryNode.Id, sourceUploadID, NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
		app.Logger().Error("failed to sync summary source edge", "summary_id", summaryRecord.Id, "error", err)
	}
}

func clearSummaryGraphEdge(app *pocketbase.PocketBase, summaryRecord *core.Record) {
	userId, _, summaryUploadID, err := resolveSummaryFields(app, summaryRecord)
	if err != nil {
		app.Logger().Error("failed to resolve summary fields on delete", "summary_id", summaryRecord.Id, "error", err)
		return
	}
	if summaryUploadID == "" {
		return
	}

	summaryNode, err := findNodeByRecord(app, summaryUploadID, userId, NodeTypeUpload)
	if err != nil || summaryNode == nil {
		return
	}

	if err := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
		app.Logger().Error("failed to clear summary source edge on delete", "summary_id", summaryRecord.Id, "error", err)
	}
}

func syncSummaryGraphEdgesForUpload(app *pocketbase.PocketBase, uploadRecordID string, userId string) {
	if uploadRecordID == "" || userId == "" {
		return
	}

	summaries, err := app.FindRecordsByFilter(
		collections.Summaries,
		"user = {:userId} && (summary_upload = {:uploadId} || source_upload = {:uploadId})",
		"",
		0,
		0,
		dbx.Params{"userId": userId, "uploadId": uploadRecordID},
	)
	if err != nil {
		app.Logger().Error("failed to load summaries for upload sync", "upload_id", uploadRecordID, "error", err)
		return
	}

	for _, summary := range summaries {
		syncSummaryGraphEdge(app, summary)
	}
}

func registerUploadHooks(app *pocketbase.PocketBase, phooks *pbgen.ProxyHooks) {
	phooks.OnUploadsAfterCreateSuccess.BindFunc(func(e *pbgen.UploadsEvent) error {
		upload := e.PRecord.Record
		uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](upload)
		userId := upload.GetString("user")
		if uploadProxy != nil {
			userId = uploadProxy.Record.GetString("user")
		}

		label, data := getUploadLabelAndData(upload)
		nodeId, err := createNode(app, upload.Id, NodeTypeUpload, userId, label, data)
		if err != nil {
			e.App.Logger().Error("failed to create node for upload", "error", err)
			return e.Next()
		}

		subjects := upload.GetStringSlice("people")
		if uploadProxy != nil {
			subjects = uploadProxy.Record.GetStringSlice("people")
		}
		for _, subjectId := range subjects {
			subjectNode, _ := findNodeByRecord(app, subjectId, userId, NodeTypeAuthor)
			if subjectNode != nil {
				createEdge(app, subjectNode.Id, nodeId, EdgeTypeAboutPerson, userId)
			}
		}

		publicationId := upload.GetString("publication")
		if uploadProxy != nil {
			publicationId = uploadProxy.Record.GetString("publication")
		}
		if publicationId != "" {
			pubNode, _ := findNodeByRecord(app, publicationId, userId, NodeTypePublication)
			if pubNode != nil {
				createEdge(app, pubNode.Id, nodeId, EdgeTypePublishedBy, userId)
			}
		}

		tags := upload.GetStringSlice("tags")
		if uploadProxy != nil {
			tags = uploadProxy.Record.GetStringSlice("tags")
		}
		for _, tagId := range tags {
			tagNode, _ := findNodeByRecord(app, tagId, userId, NodeTypeTag)
			if tagNode != nil {
				createEdge(app, tagNode.Id, nodeId, EdgeTypeTaggedWith, userId)
			}
		}

		topics := upload.GetStringSlice("topics")
		if uploadProxy != nil {
			topics = uploadProxy.Record.GetStringSlice("topics")
		}
		for _, topicId := range topics {
			topicNode, _ := findNodeByRecord(app, topicId, userId, NodeTypeTopic)
			if topicNode != nil {
				createEdge(app, topicNode.Id, nodeId, EdgeTypeBelongsTo, userId)
			}
		}

		relatedUploads := upload.GetStringSlice("uploads")
		if uploadProxy != nil {
			relatedUploads = uploadProxy.Record.GetStringSlice("uploads")
		}
		for _, relatedId := range relatedUploads {
			relatedNode, _ := findNodeByRecord(app, relatedId, userId, NodeTypeUpload)
			if relatedNode != nil {
				createEdge(app, nodeId, relatedNode.Id, EdgeTypeLinksTo, userId)
			}
		}

		syncSummaryGraphEdgesForUpload(app, upload.Id, userId)

		return e.Next()
	})

	phooks.OnUploadsAfterDeleteSuccess.BindFunc(func(e *pbgen.UploadsEvent) error {
		record := e.PRecord.Record
		uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](record)
		userId := record.GetString("user")
		if uploadProxy != nil {
			userId = uploadProxy.Record.GetString("user")
		}
		if err := deleteNodeAndEdges(app, record.Id, userId, NodeTypeUpload); err != nil {
			e.App.Logger().Error("failed to delete node and edges for upload", "error", err)
		}

		syncSummaryGraphEdgesForUpload(app, record.Id, userId)

		return e.Next()
	})

	phooks.OnUploadsAfterUpdateSuccess.BindFunc(func(e *pbgen.UploadsEvent) error {
		upload := e.PRecord.Record
		uploadProxy, _ := pbgen.WrapRecord[pbgen.Uploads](upload)
		userId := upload.GetString("user")
		if uploadProxy != nil {
			userId = uploadProxy.Record.GetString("user")
		}
		label, data := getUploadLabelAndData(upload)
		if err := updateNodeData(app, upload.Id, userId, NodeTypeUpload, label, data); err != nil {
			e.App.Logger().Error("failed to update node data for upload", "error", err)
		}

		uploadNode, err := findNodeByRecord(app, upload.Id, userId, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			e.App.Logger().Error("failed to find upload node for edge sync", "error", err)
			return e.Next()
		}

		subjects := upload.GetStringSlice("people")
		if uploadProxy != nil {
			subjects = uploadProxy.Record.GetStringSlice("people")
		}
		if err := syncEdgesForRelation(app, uploadNode.Id, subjects, NodeTypeAuthor, EdgeTypeAboutPerson, userId, true); err != nil {
			e.App.Logger().Error("failed to sync subject edges", "error", err)
		}

		publicationId := upload.GetString("publication")
		if uploadProxy != nil {
			publicationId = uploadProxy.Record.GetString("publication")
		}
		if err := syncSingleEdge(app, uploadNode.Id, publicationId, NodeTypePublication, EdgeTypePublishedBy, userId, true); err != nil {
			e.App.Logger().Error("failed to sync publication edge", "error", err)
		}

		tags := upload.GetStringSlice("tags")
		if uploadProxy != nil {
			tags = uploadProxy.Record.GetStringSlice("tags")
		}
		if err := syncEdgesForRelation(app, uploadNode.Id, tags, NodeTypeTag, EdgeTypeTaggedWith, userId, true); err != nil {
			e.App.Logger().Error("failed to sync tag edges", "error", err)
		}

		topics := upload.GetStringSlice("topics")
		if uploadProxy != nil {
			topics = uploadProxy.Record.GetStringSlice("topics")
		}
		if err := syncEdgesForRelation(app, uploadNode.Id, topics, NodeTypeTopic, EdgeTypeBelongsTo, userId, true); err != nil {
			e.App.Logger().Error("failed to sync topic edges", "error", err)
		}

		relatedUploads := upload.GetStringSlice("uploads")
		if uploadProxy != nil {
			relatedUploads = uploadProxy.Record.GetStringSlice("uploads")
		}
		if err := syncEdgesForRelation(app, uploadNode.Id, relatedUploads, NodeTypeUpload, EdgeTypeLinksTo, userId, false); err != nil {
			e.App.Logger().Error("failed to sync related upload edges", "error", err)
		}

		syncSummaryGraphEdgesForUpload(app, upload.Id, userId)

		return e.Next()
	})
}

func registerSimpleNodeHooks(app *pocketbase.PocketBase, phooks *pbgen.ProxyHooks) {
	bindSimpleCreate := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		if _, err := createNode(app, record.Id, collectionNodeType[collName], userId, label, data); err != nil {
			app.Logger().Error("failed to create node", "collection", collName, "error", err)
		}
	}

	phooks.OnPeopleAfterCreateSuccess.BindFunc(func(e *pbgen.PeopleEvent) error {
		bindSimpleCreate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnPublicationsAfterCreateSuccess.BindFunc(func(e *pbgen.PublicationsEvent) error {
		bindSimpleCreate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTagsAfterCreateSuccess.BindFunc(func(e *pbgen.TagsEvent) error {
		bindSimpleCreate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTopicsAfterCreateSuccess.BindFunc(func(e *pbgen.TopicsEvent) error {
		bindSimpleCreate(e.PRecord.Record)
		return e.Next()
	})

	bindSimpleDelete := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")
		if proxy, err := pbgen.WrapRecord[pbgen.Highlights](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Bookmarks](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Notes](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.People](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Publications](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Tags](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Topics](record); err == nil {
			userId = proxy.GetString("user")
		}

		if err := deleteNodeAndEdges(app, record.Id, userId, collectionNodeType[collName]); err != nil {
			app.Logger().Error("failed to delete node and edges", "collection", collName, "error", err)
		}
	}

	phooks.OnPeopleAfterDeleteSuccess.BindFunc(func(e *pbgen.PeopleEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnPublicationsAfterDeleteSuccess.BindFunc(func(e *pbgen.PublicationsEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTagsAfterDeleteSuccess.BindFunc(func(e *pbgen.TagsEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTopicsAfterDeleteSuccess.BindFunc(func(e *pbgen.TopicsEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnHighlightsAfterDeleteSuccess.BindFunc(func(e *pbgen.HighlightsEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnBookmarksAfterDeleteSuccess.BindFunc(func(e *pbgen.BookmarksEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnNotesAfterDeleteSuccess.BindFunc(func(e *pbgen.NotesEvent) error {
		bindSimpleDelete(e.PRecord.Record)
		return e.Next()
	})

	bindSimpleUpdate := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")
		if proxy, err := pbgen.WrapRecord[pbgen.Highlights](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Bookmarks](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Notes](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.People](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Publications](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Tags](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Topics](record); err == nil {
			userId = proxy.GetString("user")
		}

		label, data := collectionLabelData[collName](record)
		if err := updateNodeData(app, record.Id, userId, collectionNodeType[collName], label, data); err != nil {
			app.Logger().Error("failed to update node data", "collection", collName, "error", err)
		}
	}

	phooks.OnPeopleAfterUpdateSuccess.BindFunc(func(e *pbgen.PeopleEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnPublicationsAfterUpdateSuccess.BindFunc(func(e *pbgen.PublicationsEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTagsAfterUpdateSuccess.BindFunc(func(e *pbgen.TagsEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnTopicsAfterUpdateSuccess.BindFunc(func(e *pbgen.TopicsEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnHighlightsAfterUpdateSuccess.BindFunc(func(e *pbgen.HighlightsEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnBookmarksAfterUpdateSuccess.BindFunc(func(e *pbgen.BookmarksEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnNotesAfterUpdateSuccess.BindFunc(func(e *pbgen.NotesEvent) error {
		bindSimpleUpdate(e.PRecord.Record)
		return e.Next()
	})
}

func registerAnnotationCreateHooks(app *pocketbase.PocketBase, phooks *pbgen.ProxyHooks) {
	bindAnnotationCreate := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")
		if proxy, err := pbgen.WrapRecord[pbgen.Highlights](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Bookmarks](record); err == nil {
			userId = proxy.GetString("user")
		} else if proxy, err := pbgen.WrapRecord[pbgen.Notes](record); err == nil {
			userId = proxy.GetString("user")
		}

		label, data := collectionLabelData[collName](record)
		nodeId, err := createNode(app, record.Id, collectionNodeType[collName], userId, label, data)
		if err != nil {
			app.Logger().Error("failed to create annotation node", "collection", collName, "error", err)
			return
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
	}

	phooks.OnHighlightsAfterCreateSuccess.BindFunc(func(e *pbgen.HighlightsEvent) error {
		bindAnnotationCreate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnBookmarksAfterCreateSuccess.BindFunc(func(e *pbgen.BookmarksEvent) error {
		bindAnnotationCreate(e.PRecord.Record)
		return e.Next()
	})
	phooks.OnNotesAfterCreateSuccess.BindFunc(func(e *pbgen.NotesEvent) error {
		bindAnnotationCreate(e.PRecord.Record)
		return e.Next()
	})
}

func registerSummaryHooks(app *pocketbase.PocketBase, phooks *pbgen.ProxyHooks) {
	phooks.OnSummariesAfterCreateSuccess.BindFunc(func(e *pbgen.SummariesEvent) error {
		syncSummaryGraphEdge(app, e.PRecord.Record)
		return e.Next()
	})

	phooks.OnSummariesAfterUpdateSuccess.BindFunc(func(e *pbgen.SummariesEvent) error {
		syncSummaryGraphEdge(app, e.PRecord.Record)
		return e.Next()
	})

	phooks.OnSummariesAfterDeleteSuccess.BindFunc(func(e *pbgen.SummariesEvent) error {
		clearSummaryGraphEdge(app, e.PRecord.Record)
		return e.Next()
	})
}
