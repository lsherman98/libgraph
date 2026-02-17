import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2 } from "lucide-react";
import { cn, getUserId } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight } from "@/lib/api/mutations";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useReaderStore } from "@/lib/stores/reader-store";
import { AddToProjectButton } from "./add-to-project-button";
import { HIGHLIGHT_COLORS, getHighlightColorConfig } from "@/lib/constants/highlight-colors";
import { useEditorTagManagement } from "@/lib/hooks/use-tags-helpers";

export function HighlightEditorPanel() {
  const editorState = useReaderStore((state) => state.editorState);
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const currentUploadId = useReaderStore((state) => state.currentUploadId);

  const createHighlightMutation = useCreateHighlight();
  const updateHighlightMutation = useUpdateHighlight();
  const deleteHighlightMutation = useDeleteHighlight();

  const pendingHighlight = editorState?.mode === "pending-highlight" ? editorState.data : null;
  const editingHighlight = editorState?.mode === "editing-highlight" ? editorState.data : null;
  const isEditing = !!editingHighlight;
  const highlight = editingHighlight || pendingHighlight;

  const [selectedColor, setSelectedColor] = useState<HighlightsColorOptions>(highlight?.color || HighlightsColorOptions.yellow);
  const [note, setNote] = useState(isEditing ? editingHighlight?.note || "" : "");
  const { selectedTags, setSelectedTags, tagOptions, handleTagSelect, handleTagCreate } = useEditorTagManagement(
    isEditing ? editingHighlight?.tags || [] : [],
  );

  useEffect(() => {
    if (editingHighlight) {
      setSelectedColor(editingHighlight.color);
      setNote(editingHighlight.note || "");
      setSelectedTags(editingHighlight.tags || []);
    } else if (pendingHighlight) {
      setSelectedColor(pendingHighlight.color);
      setNote("");
      setSelectedTags([]);
    }
  }, [editingHighlight, pendingHighlight, setSelectedTags]);

  const handleClose = () => {
    setEditorState(null);
  };

  const handleSave = () => {
    if (isEditing && editingHighlight) {
      updateHighlightMutation.mutate({
        id: editingHighlight.id,
        data: {
          color: selectedColor,
          comment: note || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        },
      });
    } else if (pendingHighlight && currentUploadId) {
      createHighlightMutation.mutate({
        upload: currentUploadId,
        page: pendingHighlight.pageId,
        color: selectedColor,
        text: pendingHighlight.text,
        comment: note || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        start_offset: pendingHighlight.startOffset,
        end_offset: pendingHighlight.endOffset,
        user: getUserId(),
      });
    }
    handleClose();
  };

  const handleDelete = () => {
    if (isEditing && editingHighlight) {
      deleteHighlightMutation.mutate(editingHighlight.id);
    }
    handleClose();
  };

  if (!highlight) return null;

  const colorConfig = getHighlightColorConfig(selectedColor);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">{isEditing ? "Edit Highlight" : "New Highlight"}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Selected Text</label>
            <div className={cn("p-3 rounded-lg text-sm", colorConfig?.bg || "bg-yellow-300/70")}>
              <p className="text-foreground line-clamp-4">"{highlight.text}"</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Color</label>
            <div className="flex items-center gap-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all hover:scale-110 ring-2 ring-offset-2 ring-offset-background",
                    color.bg,
                    selectedColor === color.value ? color.ring : "ring-transparent",
                  )}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.label}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Note</label>
            <Textarea
              placeholder="Add a note about this highlight..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
          {isEditing && editingHighlight && <AddToProjectButton itemId={editingHighlight.id} itemType="highlight" variant="default" />}
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
