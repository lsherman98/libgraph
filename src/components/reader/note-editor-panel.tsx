import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, StickyNote } from "lucide-react";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useReaderStore } from "@/lib/stores/reader-store";
import { AddToProjectButton } from "./add-to-project-button";
import { getUserId } from "@/lib/utils";
import { useCreateNote, useUpdateNote, useDeleteNote } from "@/lib/api/mutations";
import { useEditorTagManagement } from "@/lib/hooks/use-tags-helpers";

export function NoteEditorPanel() {
  const editorState = useReaderStore((state) => state.editorState);
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const currentUploadId = useReaderStore((state) => state.currentUploadId);

  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const pendingNote = editorState?.mode === "pending-note" ? editorState.data : null;
  const editingNote = editorState?.mode === "editing-note" ? editorState.data : null;
  const isEditing = !!editingNote;
  const note = editingNote || pendingNote;

  const [content, setContent] = useState(isEditing ? editingNote?.content || "" : "");
  const { selectedTags, setSelectedTags, tagOptions, handleTagSelect, handleTagCreate } = useEditorTagManagement(
    isEditing ? editingNote?.tags || [] : [],
  );

  useEffect(() => {
    if (editingNote) {
      setContent(editingNote.content || "");
      setSelectedTags(editingNote.tags || []);
    } else if (pendingNote) {
      setContent("");
      setSelectedTags([]);
    }
  }, [editingNote, pendingNote, setSelectedTags]);

  const handleClose = () => setEditorState(null);

  const handleSave = () => {
    if (!content.trim()) return;

    if (isEditing && editingNote) {
      updateNoteMutation.mutate({
        id: editingNote.id,
        data: {
          content: content.trim(),
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        },
      });
    } else if (pendingNote && currentUploadId) {
      createNoteMutation.mutate({
        upload: currentUploadId,
        page: pendingNote.pageId,
        page_number: pendingNote.pageNumber,
        block_id: pendingNote.blockId,
        content: content.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        user: getUserId(),
      });
    }
    handleClose();
  };

  const handleDelete = () => {
    if (isEditing && editingNote) {
      deleteNoteMutation.mutate(editingNote.id);
    }
    handleClose();
  };

  if (!note) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-blue-500" />
          {isEditing ? "Edit Note" : "New Note"}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {note.previewText && (
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Context</label>
              <div className="p-3 rounded-lg bg-blue-100/50 dark:bg-blue-900/20 text-sm">
                <p className="text-foreground line-clamp-4 italic">"{note.previewText}"</p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Note</label>
            <Textarea
              placeholder="Write your note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-37.5 text-sm resize-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Tags</label>
            <CreatableCombobox
              options={tagOptions}
              value={selectedTags}
              onSelect={handleTagSelect}
              onCreate={handleTagCreate}
              placeholder="Search or create tags..."
              isMulti
            />
          </div>
        </div>
      </ScrollArea>
      <div className="flex items-center justify-between gap-2 p-4 border-t">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          ) : (
            <div />
          )}
          {isEditing && editingNote && <AddToProjectButton itemId={editingNote.id} itemType="note" variant="default" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!content.trim()}>
            {isEditing ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
