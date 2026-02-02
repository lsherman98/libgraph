import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Bookmark, StickyNote } from "lucide-react";
import { useTags } from "@/lib/api/queries";
import { useCreateTag } from "@/lib/api/mutations";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useReaderStore } from "@/lib/stores/reader-store";

export function BookmarkEditorPanel() {
  const pendingBookmark = useReaderStore((state) => state.pendingBookmark);
  const editingBookmark = useReaderStore((state) => state.editingBookmark);
  const setPendingBookmark = useReaderStore((state) => state.setPendingBookmark);
  const setEditingBookmark = useReaderStore((state) => state.setEditingBookmark);
  const createBookmarkFn = useReaderStore((state) => state.createBookmarkFn);
  const updateBookmarkFn = useReaderStore((state) => state.updateBookmarkFn);
  const deleteBookmarkFn = useReaderStore((state) => state.deleteBookmarkFn);

  const isEditing = !!editingBookmark;
  const bookmark = editingBookmark || pendingBookmark;

  const [comment, setComment] = useState(isEditing ? editingBookmark?.comment || "" : "");
  const [selectedTags, setSelectedTags] = useState<string[]>(isEditing ? editingBookmark?.tags || [] : []);

  const { data: tags = [] } = useTags();
  const createTagMutation = useCreateTag();

  // Reset state when bookmark changes
  useEffect(() => {
    if (editingBookmark) {
      setComment(editingBookmark.comment || "");
      setSelectedTags(editingBookmark.tags || []);
    } else if (pendingBookmark) {
      setComment("");
      setSelectedTags([]);
    }
  }, [editingBookmark, pendingBookmark]);

  const handleClose = () => {
    setPendingBookmark(null);
    setEditingBookmark(null);
  };

  const handleSave = () => {
    if (isEditing && editingBookmark && updateBookmarkFn) {
      updateBookmarkFn(editingBookmark.id, {
        comment: comment || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    } else if (pendingBookmark && createBookmarkFn) {
      createBookmarkFn({
        block_id: pendingBookmark.blockId,
        comment: comment || "",
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        preview_text: pendingBookmark.previewText,
      });
    }
    handleClose();
  };

  const handleDelete = () => {
    if (isEditing && editingBookmark && deleteBookmarkFn) {
      deleteBookmarkFn(editingBookmark.id);
    }
    handleClose();
  };

  const handleTagSelect = (tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const handleTagCreate = (title: string) => {
    createTagMutation.mutate(
      { title },
      {
        onSuccess: (newTag) => {
          setSelectedTags((prev) => [...prev, newTag.id]);
        },
      },
    );
  };

  const tagOptions = tags.map((t) => ({ label: t.title || t.id, value: t.id }));

  if (!bookmark) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-amber-500" />
          {isEditing ? "Edit Bookmark" : "New Bookmark"}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Preview text */}
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Selected Text</label>
            <div className="p-3 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 text-sm">
              <p className="text-foreground line-clamp-4 italic">"{bookmark.previewText}"</p>
            </div>
          </div>

          {/* Comment input */}
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Comment</label>
            <Textarea
              placeholder="Add a comment about this bookmark..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[120px] text-sm resize-none"
            />
          </div>

          {/* Tags selection */}
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

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 p-4 border-t">
        {isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        ) : (
          <div />
        )}
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

export function NoteEditorPanel() {
  const pendingNote = useReaderStore((state) => state.pendingNote);
  const editingNote = useReaderStore((state) => state.editingNote);
  const setPendingNote = useReaderStore((state) => state.setPendingNote);
  const setEditingNote = useReaderStore((state) => state.setEditingNote);
  const createNoteFn = useReaderStore((state) => state.createNoteFn);
  const updateNoteFn = useReaderStore((state) => state.updateNoteFn);
  const deleteNoteFn = useReaderStore((state) => state.deleteNoteFn);

  const isEditing = !!editingNote;
  const note = editingNote || pendingNote;

  const [content, setContent] = useState(isEditing ? editingNote?.content || "" : "");
  const [selectedTags, setSelectedTags] = useState<string[]>(isEditing ? editingNote?.tags || [] : []);

  const { data: tags = [] } = useTags();
  const createTagMutation = useCreateTag();

  // Reset state when note changes
  useEffect(() => {
    if (editingNote) {
      setContent(editingNote.content || "");
      setSelectedTags(editingNote.tags || []);
    } else if (pendingNote) {
      setContent("");
      setSelectedTags([]);
    }
  }, [editingNote, pendingNote]);

  const handleClose = () => {
    setPendingNote(null);
    setEditingNote(null);
  };

  const handleSave = () => {
    if (!content.trim()) return;

    if (isEditing && editingNote && updateNoteFn) {
      updateNoteFn(editingNote.id, {
        content: content.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    } else if (pendingNote && createNoteFn) {
      createNoteFn({
        block_id: pendingNote.blockId,
        content: content.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    }
    handleClose();
  };

  const handleDelete = () => {
    if (isEditing && editingNote && deleteNoteFn) {
      deleteNoteFn(editingNote.id);
    }
    handleClose();
  };

  const handleTagSelect = (tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const handleTagCreate = (title: string) => {
    createTagMutation.mutate(
      { title },
      {
        onSuccess: (newTag) => {
          setSelectedTags((prev) => [...prev, newTag.id]);
        },
      },
    );
  };

  const tagOptions = tags.map((t) => ({ label: t.title || t.id, value: t.id }));

  if (!note) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
          {/* Preview text (only for new notes) */}
          {note.previewText && (
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Context</label>
              <div className="p-3 rounded-lg bg-blue-100/50 dark:bg-blue-900/20 text-sm">
                <p className="text-foreground line-clamp-4 italic">"{note.previewText}"</p>
              </div>
            </div>
          )}

          {/* Content input */}
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Note</label>
            <Textarea
              placeholder="Write your note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[150px] text-sm resize-none"
              autoFocus
            />
          </div>

          {/* Tags selection */}
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

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 p-4 border-t">
        {isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        ) : (
          <div />
        )}
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
