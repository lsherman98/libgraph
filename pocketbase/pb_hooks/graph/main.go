package graph

import (
	"github.com/lsherman98/libgraph/pocketbase/collections"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Init(app *pocketbase.PocketBase) error {
	app.OnRecordAfterCreateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		data := getUploadData(upload)
		uploadNodeId, err := createUploadNode(e.App, upload.Id, userId, data)
		if err != nil {
			return e.Next()
		}

		if err := syncUploadMetadataEdges(e.App, upload, uploadNodeId, userId); err != nil {
			return e.Next()
		}

		if err := syncSummaryEdgesForUpload(e.App, upload.Id, userId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")

		if err := deleteNode(e.App, upload.Id, userId, NodeTypeUpload); err != nil {
			return e.Next()
		}

		if err := syncSummaryEdgesForUpload(e.App, upload.Id, userId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Uploads).BindFunc(func(e *core.RecordEvent) error {
		upload := e.Record
		userId := upload.GetString("user")
		data := getUploadData(upload)
		if err := updateUploadNodeData(e.App, upload.Id, userId, NodeTypeUpload, data); err != nil {
			return e.Next()
		}

		uploadNode, err := findNodeByRecord(e.App, upload.Id, userId, NodeTypeUpload)
		if err != nil || uploadNode == nil {
			return e.Next()
		}

		if err := syncUploadMetadataEdges(e.App, upload, uploadNode.Id, userId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getAuthorData(e.Record)
		_, err := createNode(e.App, e.Record.Id, NodeTypePerson, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getPublicationData(e.Record)
		_, err := createNode(e.App, e.Record.Id, NodeTypePublication, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getTagData(e.Record)
		_, err := createNode(e.App, e.Record.Id, NodeTypeTag, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getTopicData(e.Record)
		_, err := createNode(e.App, e.Record.Id, NodeTypeTopic, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypePerson); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypePublication); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypeTag); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypeTopic); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypeHighlight); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypeBookmark); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		if err := deleteNode(e.App, e.Record.Id, userId, NodeTypeNote); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.People).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getAuthorData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypePerson, data.Label); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Publications).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getPublicationData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypePublication, data.Label); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Tags).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getTagData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypeTag, data.Label); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Topics).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getTopicData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypeTopic, data.Label); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getHighlightData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypeHighlight, data.Label); err != nil {
			return e.Next()
		}

		node, err := findNodeByRecord(e.App, e.Record.Id, userId, NodeTypeHighlight)
		if err != nil || node == nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeHighlightOf, userId, node.Id); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getBookmarkData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypeBookmark, data.Label); err != nil {
			return e.Next()
		}

		node, err := findNodeByRecord(e.App, e.Record.Id, userId, NodeTypeBookmark)
		if err != nil || node == nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeBookmarkOf, userId, node.Id); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")
		data := getNoteData(e.Record)
		if err := updateNodeData(e.App, e.Record.Id, userId, NodeTypeNote, data.Label); err != nil {
			return e.Next()
		}

		node, err := findNodeByRecord(e.App, e.Record.Id, userId, NodeTypeNote)
		if err != nil || node == nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeNoteOf, userId, node.Id); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		if err := syncSummaryEdge(e.App, e.Record); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		if err := syncSummaryEdge(e.App, e.Record); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess(collections.Summaries).BindFunc(func(e *core.RecordEvent) error {
		if err := clearSummaryEdge(e.App, e.Record); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Highlights).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")

		data := getHighlightData(e.Record)
		nodeId, err := createNode(e.App, e.Record.Id, NodeTypeHighlight, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeHighlightOf, userId, nodeId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Bookmarks).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")

		data := getBookmarkData(e.Record)
		nodeId, err := createNode(e.App, e.Record.Id, NodeTypeBookmark, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeBookmarkOf, userId, nodeId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	app.OnRecordAfterCreateSuccess(collections.Notes).BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.GetString("user")

		data := getNoteData(e.Record)
		nodeId, err := createNode(e.App, e.Record.Id, NodeTypeNote, userId, data.Label)
		if err != nil {
			return e.Next()
		}

		if err := syncAnnotationEdges(e.App, e.Record, EdgeTypeNoteOf, userId, nodeId); err != nil {
			return e.Next()
		}

		return e.Next()
	})

	return nil
}
