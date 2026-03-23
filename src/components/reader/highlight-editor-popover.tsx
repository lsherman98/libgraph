import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { cn, getUserId } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight } from "@/lib/api/mutations";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useReaderStore } from "@/lib/stores/reader-store";
import { HIGHLIGHT_COLORS } from "@/lib/constants/highlight-colors";
import { useEditorTagManagement } from "@/lib/hooks/use-tags-helpers";

interface HighlightEditorPopoverProps {
  onClose: () => void;
}

export function HighlightEditorPopover({ onClose }: HighlightEditorPopoverProps) {
  const editorState = useReaderStore((state) => state.editorState);
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
    onClose();
  };

  const handleDelete = () => {
    if (isEditing && editingHighlight) {
      deleteHighlightMutation.mutate(editingHighlight.id);
    }
    onClose();
  };

  if (!highlight) return null;

  return (
    <div className="space-y-3" onMouseDown={(e) => e.stopPropagation()}>
      <div>
        <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Color</label>
        <div className="flex items-center gap-2">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              className={cn(
                "w-7 h-7 rounded-full transition-all hover:scale-110 ring-2 ring-offset-2 ring-offset-background",
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
          className="min-h-24 text-sm resize-none"
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

      <div className="flex items-center justify-end gap-2">
        {isEditing && (
          <Button variant="ghost" size="sm" className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave}>
          {isEditing ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}