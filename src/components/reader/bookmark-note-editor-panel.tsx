import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import { useCreateBookmark, useUpdateBookmark, useDeleteBookmark } from "@/lib/api/mutations";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useReaderStore } from "@/lib/stores/reader-store";
import { AddToProjectButton } from "./add-to-project-button";
import { getUserId } from "@/lib/utils";
import { useEditorTagManagement } from "@/lib/hooks/use-tags-helpers";

function getAutoComment(text?: string): string {
  if (!text) return "";
  return text.split(/\s+/).slice(0, 20).join(" ");
}

export function BookmarkEditorPanel() {
  const editorState = useReaderStore((state) => state.editorState);
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const currentUploadId = useReaderStore((state) => state.currentUploadId);

  const createBookmarkMutation = useCreateBookmark();
  const updateBookmarkMutation = useUpdateBookmark();
  const deleteBookmarkMutation = useDeleteBookmark();

  const pendingBookmark = editorState?.mode === "pending-bookmark" ? editorState.data : null;
  const editingBookmark = editorState?.mode === "editing-bookmark" ? editorState.data : null;
  const isEditing = !!editingBookmark;
  const bookmark = editingBookmark || pendingBookmark;

  const [comment, setComment] = useState(isEditing ? editingBookmark?.comment || "" : getAutoComment(pendingBookmark?.previewText));
  const { selectedTags, setSelectedTags, tagOptions, handleTagSelect, handleTagCreate } = useEditorTagManagement(
    isEditing ? editingBookmark?.tags || [] : [],
  );

  useEffect(() => {
    if (editingBookmark) {
      setComment(editingBookmark.comment || "");
      setSelectedTags(editingBookmark.tags || []);
    } else if (pendingBookmark) {
      setComment(getAutoComment(pendingBookmark.previewText));
      setSelectedTags([]);
    }
  }, [editingBookmark, pendingBookmark, setSelectedTags]);

  const handleClose = () => setEditorState(null);

  const handleSave = () => {
    if (isEditing && editingBookmark) {
      updateBookmarkMutation.mutate({
        id: editingBookmark.id,
        data: {
          comment: comment || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        },
      });
    } else if (pendingBookmark && currentUploadId) {
      createBookmarkMutation.mutate({
        upload: currentUploadId,
        page: pendingBookmark.pageId,
        page_number: pendingBookmark.pageNumber,
        block_id: pendingBookmark.blockId,
        comment: comment || "",
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        user: getUserId(),
      });
    }
    handleClose();
  };

  const handleDelete = () => {
    if (isEditing && editingBookmark) {
      deleteBookmarkMutation.mutate(editingBookmark.id);
    }
    handleClose();
  };

  if (!bookmark) return null;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Selected Text</label>
            <div className="p-3 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 text-sm">
              <p className="text-foreground line-clamp-4 italic">"{bookmark.previewText}"</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Comment</label>
            <Textarea
              placeholder="Add a comment about this bookmark..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-30 text-sm resize-none"
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
          {isEditing && editingBookmark && <AddToProjectButton itemId={editingBookmark.id} itemType="bookmark" variant="default" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            {isEditing ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
