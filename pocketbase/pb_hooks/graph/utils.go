package graph

import (
	"encoding/json"
	"fmt"

	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func createNode(app core.App, recordId string, nodeType NodeType, userId, label string) (string, error) {
	nodesCollection, _ := app.FindCollectionByNameOrId(collections.Nodes)

	node := core.NewRecord(nodesCollection)
	node.Set("record_id", recordId)
	node.Set("type", string(nodeType))
	node.Set("user", userId)
	node.Set("label", label)
	if err := app.Save(node); err != nil {
		return "", err
	}

	return node.Id, nil
}

func createUploadNode(app core.App, recordId string, userId string, data UploadData) (string, error) {
	nodesCollection, _ := app.FindCollectionByNameOrId(collections.Nodes)

	node := core.NewRecord(nodesCollection)
	node.Set("record_id", recordId)
	node.Set("type", string(NodeTypeUpload))
	node.Set("user", userId)
	node.Set("label", data.Title)

	jsonData, err := json.Marshal(data)
	if err == nil {
		node.Set("data", string(jsonData))
	}

	if err := app.Save(node); err != nil {
		return "", err
	}

	return node.Id, nil
}

func updateNodeData(app core.App, recordId string, userId string, nodeType NodeType, label string) error {
	node, err := findNodeByRecord(app, recordId, userId, nodeType)
	if err != nil || node == nil {
		return err
	}

	node.Set("label", label)

	return app.Save(node)
}

func updateUploadNodeData(app core.App, recordId string, userId string, nodeType NodeType, data UploadData) error {
	node, err := findNodeByRecord(app, recordId, userId, nodeType)
	if err != nil || node == nil {
		return err
	}

	node.Set("label", data.Title)
	jsonData, err := json.Marshal(data)
	if err == nil {
		node.Set("data", string(jsonData))
	}

	return app.Save(node)
}

func getUploadData(record *core.Record) UploadData {
	title := record.GetString("title")
	uploadType := record.GetString("type")
	numPages := record.GetInt("num_pages")

	data := UploadData{
		Title:    title,
		Type:     uploadType,
		NumPages: numPages,
		Label:    title,
	}

	return data
}

func getAuthorData(record *core.Record) AuthorData {
	name := record.GetString("name")
	source := record.GetString("source")

	data := AuthorData{
		Name:   name,
		Source: source,
		Label:  name,
	}

	return data
}

func getPublicationData(record *core.Record) PublicationData {
	name := record.GetString("name")
	url := record.GetString("url")

	data := PublicationData{
		Name:  name,
		URL:   url,
		Label: name,
	}

	return data
}

func getTagData(record *core.Record) TagData {
	title := record.GetString("title")

	data := TagData{
		Title: title,
		Label: title,
	}

	return data
}

func getTopicData(record *core.Record) TopicData {
	title := record.GetString("title")

	data := TopicData{
		Title: title,
		Label: title,
	}

	return data
}

func getHighlightData(record *core.Record) HighlightData {
	text := record.GetString("text")
	color := record.GetString("color")
	comment := record.GetString("comment")
	label := text
	if len(label) > 40 {
		label = label[:40] + "..."
	}

	data := HighlightData{
		Text:    text,
		Color:   color,
		Comment: comment,
		Label:   label,
	}

	return data
}

func getBookmarkData(record *core.Record) BookmarkData {
	comment := record.GetString("comment")
	pageNum := record.GetInt("page_number")
	label := comment
	if label == "" {
		label = fmt.Sprintf("Bookmark p.%d", pageNum)
	}
	if len(label) > 40 {
		label = label[:40] + "..."
	}

	data := BookmarkData{
		Comment: comment,
		PageNum: pageNum,
		Label:   label,
	}

	return data
}

func getNoteData(record *core.Record) NoteData {
	content := record.GetString("content")
	pageNum := record.GetInt("page_number")
	label := content
	if len(label) > 40 {
		label = label[:40] + "..."
	}

	data := NoteData{
		Content: content,
		PageNum: pageNum,
		Label:   label,
	}

	return data
}

func createEdge(app core.App, sourceNodeId string, targetNodeId string, edgeType EdgeType, userId string) error {
	edgesCollection, _ := app.FindCollectionByNameOrId(collections.Edges)

	edge := core.NewRecord(edgesCollection)
	edge.Set("source", sourceNodeId)
	edge.Set("target", targetNodeId)
	edge.Set("type", string(edgeType))
	edge.Set("user", userId)

	return app.Save(edge)
}

func findNodeByRecord(app core.App, recordId string, userId string, nodeType NodeType) (*core.Record, error) {
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

func deleteNode(app core.App, recordId string, userId string, nodeType NodeType) error {
	node, err := findNodeByRecord(app, recordId, userId, nodeType)
	if err != nil || node == nil {
		return err
	}

	return app.Delete(node)
}

func syncEdges(app core.App, sourceNodeId string, targetRecordIds []string, targetNodeType NodeType, edgeType EdgeType, userId string) error {
	filterStr := "source = {:nodeId} && type = {:edgeType} && user = {:userId}"

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
		targetID := edge.GetString("target")
		existingMap[targetID] = edge
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
			err := createEdge(app, sourceNodeId, nodeId, edgeType, userId)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func syncIncomingEdges(app core.App, targetNodeId string, sourceRecordIds []string, sourceNodeType NodeType, edgeType EdgeType, userId string) error {
	filterStr := "target = {:nodeId} && type = {:edgeType} && user = {:userId}"

	existingEdges, err := app.FindRecordsByFilter(
		collections.Edges,
		filterStr,
		"",
		0,
		0,
		dbx.Params{"nodeId": targetNodeId, "edgeType": string(edgeType), "userId": userId},
	)
	if err != nil {
		existingEdges = []*core.Record{}
	}

	existingMap := map[string]*core.Record{}
	for _, edge := range existingEdges {
		sourceID := edge.GetString("source")
		existingMap[sourceID] = edge
	}

	desiredMap := map[string]bool{}
	for _, recordId := range sourceRecordIds {
		sourceNode, _ := findNodeByRecord(app, recordId, userId, sourceNodeType)
		if sourceNode != nil {
			desiredMap[sourceNode.Id] = true
		}
	}

	for nodeId, edge := range existingMap {
		if !desiredMap[nodeId] {
			app.Delete(edge)
		}
	}

	for nodeId := range desiredMap {
		if _, exists := existingMap[nodeId]; !exists {
			err := createEdge(app, nodeId, targetNodeId, edgeType, userId)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func syncUploadMetadataEdges(app core.App, upload *core.Record, uploadNodeId string, userId string) error {
	people := upload.GetStringSlice("people")
	if err := syncIncomingEdges(app, uploadNodeId, people, NodeTypePerson, EdgeTypeAboutPerson, userId); err != nil {
		return err
	}

	author := upload.GetString("author")
	if err := syncEdges(app, uploadNodeId, []string{author}, NodeTypePerson, EdgeTypeAuthoredBy, userId); err != nil {
		return err
	}

	publicationId := upload.GetString("publication")
	if err := syncIncomingEdges(app, uploadNodeId, []string{publicationId}, NodeTypePublication, EdgeTypePublishedBy, userId); err != nil {
		return err
	}

	tags := upload.GetStringSlice("tags")
	if err := syncIncomingEdges(app, uploadNodeId, tags, NodeTypeTag, EdgeTypeTaggedWith, userId); err != nil {
		return err
	}

	topics := upload.GetStringSlice("topics")
	if err := syncIncomingEdges(app, uploadNodeId, topics, NodeTypeTopic, EdgeTypeBelongsTo, userId); err != nil {
		return err
	}

	relatedUploads := upload.GetStringSlice("uploads")
	if err := syncEdges(app, uploadNodeId, relatedUploads, NodeTypeUpload, EdgeTypeLinksTo, userId); err != nil {
		return err
	}

	return nil
}

func ensureUploadNode(app core.App, uploadRecordId string, userId string) (*core.Record, error) {
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

	data := getUploadData(uploadRecord)
	if _, err := createUploadNode(app, uploadRecord.Id, userId, data); err != nil {
		return nil, err
	}

	return findNodeByRecord(app, uploadRecordId, userId, NodeTypeUpload)
}

func getSummaryFields(app core.App, summary *core.Record) (string, string, error) {
	sourceUploadID := summary.GetString("source_upload")
	summaryUploadID := summary.GetString("summary_upload")

	if sourceUploadID == "" {
		linkedPage, err := app.FindFirstRecordByFilter(
			collections.Pages,
			"summary = {:summaryId}",
			dbx.Params{"summaryId": summary.Id},
		)
		if err != nil {
			return "", "", err
		}

		sourceUploadID = linkedPage.GetString("upload")
	}

	return sourceUploadID, summaryUploadID, nil
}

func syncSummaryEdge(app core.App, summary *core.Record) error {
	sourceUploadID, summaryUploadID, err := getSummaryFields(app, summary)
	if err != nil {
		return err
	}

	summaryNode, err := ensureUploadNode(app, summaryUploadID, summary.GetString("user"))
	if err != nil || summaryNode == nil {
		return err
	}

	uploadNode, err := ensureUploadNode(app, sourceUploadID, summary.GetString("user"))
	if err != nil || uploadNode == nil {
		return err
	}

	if err := syncEdges(app, summaryNode.Id, []string{sourceUploadID}, NodeTypeUpload, EdgeTypeSummaryOf, summary.GetString("user")); err != nil {
		return err
	}

	return nil
}

func clearSummaryEdge(app core.App, summaryRecord *core.Record) error {
	_, summaryUploadID, err := getSummaryFields(app, summaryRecord)
	if err != nil {
		return err
	}

	summaryNode, err := findNodeByRecord(app, summaryUploadID, summaryRecord.GetString("user"), NodeTypeUpload)
	if err != nil || summaryNode == nil {
		return err
	}

	if err := syncEdges(app, summaryNode.Id, []string{}, NodeTypeUpload, EdgeTypeSummaryOf, summaryRecord.GetString("user")); err != nil {
		return err
	}

	return nil
}

func syncSummaryEdgesForUpload(app core.App, uploadRecordID string, userId string) error {
	if uploadRecordID == "" || userId == "" {
		return nil
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
		return err
	}

	for _, summary := range summaries {
		if err := syncSummaryEdge(app, summary); err != nil {
			continue
		}
	}

	return nil
}

func syncAnnotationEdges(app core.App, record *core.Record, edgeType EdgeType, userId, nodeId string) error {
	uploadId := record.GetString("upload")
	if err := syncIncomingEdges(app, nodeId, []string{uploadId}, NodeTypeUpload, edgeType, userId); err != nil {
		return err
	}

	tags := record.GetStringSlice("tags")
	if err := syncIncomingEdges(app, nodeId, tags, NodeTypeTag, EdgeTypeTaggedWith, userId); err != nil {
		return err
	}

	return nil
}
