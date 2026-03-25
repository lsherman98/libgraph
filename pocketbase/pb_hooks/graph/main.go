package graph

import (
	"encoding/json"
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	registerUploadHooks(app)
	registerSimpleNodeHooks(app)
	registerAnnotationCreateHooks(app)
	registerSummaryHooks(app)

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
	typeValue := record.GetString("type")
	numPages := record.GetInt("num_pages")
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
	name := record.GetString("name")
	typeValue := record.GetString("type")
	source := record.GetString("source")
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
	name := record.GetString("name")
	typeValue := record.GetString("type")
	url := record.GetString("url")
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
	color := record.GetString("color")
	comment := record.GetString("comment")
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
		sourceID := edge.GetString("source")
		targetID := edge.GetString("target")
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
			app.Delete(edge)
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
				return err
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
	summaryUploadID := summaryRecord.GetString("summary_upload")

	if sourceUploadID == "" {
		linkedPages, err := app.FindRecordsByFilter(
			collections.Pages,
			"summary = {:summaryId}",
			"+page",
			1,
			0,
			dbx.Params{"summaryId": summaryRecord.Id},
		)
		if err != nil {
			return userId, "", summaryUploadID, err
		}
		if len(linkedPages) > 0 {
			sourceUploadID = linkedPages[0].GetString("upload")
		}
	}

	return userId, sourceUploadID, summaryUploadID, nil
}

func syncSummaryGraphEdge(app *pocketbase.PocketBase, summaryRecord *core.Record) error {
	userId, sourceUploadID, summaryUploadID, err := resolveSummaryFields(app, summaryRecord)
	if err != nil {
		return err
	}

	if summaryUploadID == "" {
		return fmt.Errorf("summary record missing summary_upload relation: %s", summaryRecord.Id)
	}

	summaryNode, err := ensureUploadNode(app, summaryUploadID, userId)
	if err != nil || summaryNode == nil {
		return err
	}

	if sourceUploadID == "" {
		if err := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
			return err
		}
		return nil
	}

	if _, err := ensureUploadNode(app, sourceUploadID, userId); err != nil {
		if err := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
			return err
		}
		return err
	}

	if err := syncSingleEdge(app, summaryNode.Id, sourceUploadID, NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
		return err
	}

	return nil
}

func clearSummaryGraphEdge(app *pocketbase.PocketBase, summaryRecord *core.Record) error {
	userId, _, summaryUploadID, err := resolveSummaryFields(app, summaryRecord)
	if err != nil {
		return err
	}

	if summaryUploadID == "" {
		return fmt.Errorf("summary record missing summary_upload relation: %s", summaryRecord.Id)
	}

	summaryNode, err := findNodeByRecord(app, summaryUploadID, userId, NodeTypeUpload)
	if err != nil || summaryNode == nil {
		return err
	}

	if err := syncSingleEdge(app, summaryNode.Id, "", NodeTypeUpload, EdgeTypeSummaryOf, userId, false); err != nil {
		return err
	}

	return nil
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
		return
	}

	for _, summary := range summaries {
		syncSummaryGraphEdge(app, summary)
	}
}

func registerUploadHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		label, data := getUploadLabelAndData(upload)
		nodeId, err := createNode(app, upload.Id, NodeTypeUpload, userId, label, data)
		if err != nil {
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

		syncSummaryGraphEdgesForUpload(app, upload.Id, userId)

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		record := e.Record
		userId := record.GetString("user")

		deleteNodeAndEdges(app, record.Id, userId, NodeTypeUpload)
		syncSummaryGraphEdgesForUpload(app, record.Id, userId)

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")
		label, data := getUploadLabelAndData(upload)
		if err := updateNodeData(app, upload.Id, userId, NodeTypeUpload, label, data); err != nil {
			return e.Next()
		}

		uploadNode, err := findNodeByRecord(app, upload.Id, userId, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			return e.Next()
		}

		subjects := upload.GetStringSlice("people")
		if err := syncEdgesForRelation(app, uploadNode.Id, subjects, NodeTypeAuthor, EdgeTypeAboutPerson, userId, true); err != nil {
			return e.Next()
		}

		publicationId := upload.GetString("publication")
		if err := syncSingleEdge(app, uploadNode.Id, publicationId, NodeTypePublication, EdgeTypePublishedBy, userId, true); err != nil {
			return e.Next()
		}

		tags := upload.GetStringSlice("tags")
		if err := syncEdgesForRelation(app, uploadNode.Id, tags, NodeTypeTag, EdgeTypeTaggedWith, userId, true); err != nil {
			return e.Next()
		}

		topics := upload.GetStringSlice("topics")
		if err := syncEdgesForRelation(app, uploadNode.Id, topics, NodeTypeTopic, EdgeTypeBelongsTo, userId, true); err != nil {
			return e.Next()
		}

		relatedUploads := upload.GetStringSlice("uploads")
		if err := syncEdgesForRelation(app, uploadNode.Id, relatedUploads, NodeTypeUpload, EdgeTypeLinksTo, userId, false); err != nil {
			return e.Next()
		}

		syncSummaryGraphEdgesForUpload(app, upload.Id, userId)

		return e.Next()
	})
}

func registerSimpleNodeHooks(app *pocketbase.PocketBase) {
	bindSimpleCreate := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		createNode(app, record.Id, collectionNodeType[collName], userId, label, data)
	}

	app.OnRecordAfterCreateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleCreate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterCreateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleCreate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterCreateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleCreate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterCreateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleCreate(e.Record)
		return e.Next()
	})

	bindSimpleDelete := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")

		deleteNodeAndEdges(app, record.Id, userId, collectionNodeType[collName])
	}

	app.OnRecordAfterDeleteSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleDelete(e.Record)
		return e.Next()
	})

	bindSimpleUpdate := func(record *core.Record) {
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		updateNodeData(app, record.Id, userId, collectionNodeType[collName], label, data)
	}

	app.OnRecordAfterUpdateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		bindSimpleUpdate(e.Record)
		return e.Next()
	})
}

func registerAnnotationCreateHooks(app *pocketbase.PocketBase) error {
	bindAnnotationCreate := func(record *core.Record) error {
		collName := record.Collection().Name
		userId := record.GetString("user")

		label, data := collectionLabelData[collName](record)
		nodeId, err := createNode(app, record.Id, collectionNodeType[collName], userId, label, data)
		if err != nil {
			return err
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

		return nil
	}

	app.OnRecordAfterCreateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		bindAnnotationCreate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterCreateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		bindAnnotationCreate(e.Record)
		return e.Next()
	})
	app.OnRecordAfterCreateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		bindAnnotationCreate(e.Record)
		return e.Next()
	})

	return nil
}

func registerSummaryHooks(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		syncSummaryGraphEdge(app, e.Record)
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		syncSummaryGraphEdge(app, e.Record)
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		clearSummaryGraphEdge(app, e.Record)
		return e.Next()
	})
	return nil
}
