import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookmarksTypeOptions } from "@/lib/pocketbase-types";
import { useTags } from "@/lib/api/queries";
import { useCreateTag } from "@/lib/api/mutations";
import { CreatableCombobox } from "@/components/creatable-combobox";

interface BookmarkButtonProps {
  isBookmarked: boolean;
  blockId: string;
  previewText: string;
  bookmarkLabel?: string;
  bookmarkType?: BookmarksTypeOptions;
  bookmarkTags?: string[];
  onAddBookmark: (label: string, type: BookmarksTypeOptions, tags: string[]) => void;
  onUpdateBookmark?: (label: string, type: BookmarksTypeOptions, tags: string[]) => void;
  onRemoveBookmark: () => void;
  className?: string;
}

export function BookmarkButton({
  isBookmarked,
  blockId: _blockId,
  previewText,
  bookmarkLabel = "",
  bookmarkType = BookmarksTypeOptions.bookmark,
  bookmarkTags = [],
  onAddBookmark,
  onUpdateBookmark,
  onRemoveBookmark,
  className,
}: BookmarkButtonProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(bookmarkLabel);
  const [selectedType, setSelectedType] = useState<BookmarksTypeOptions>(bookmarkType);
  const [selectedTags, setSelectedTags] = useState<string[]>(bookmarkTags);

  const { data: tags = [] } = useTags();
  const createTagMutation = useCreateTag();

  // Sync state when props change
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setLabel(bookmarkLabel);
      setSelectedType(bookmarkType);
      setSelectedTags(bookmarkTags);
    }
    setOpen(newOpen);
  };

  const handleSave = () => {
    if (isBookmarked && onUpdateBookmark) {
      onUpdateBookmark(label, selectedType, selectedTags);
    } else {
      onAddBookmark(label, selectedType, selectedTags);
    }
    setLabel("");
    setSelectedTags([]);
    setOpen(false);
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

  const handleRemove = () => {
    onRemoveBookmark();
    setOpen(false);
  };

  if (isBookmarked) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("h-6 w-6 text-primary", className)} title="Edit bookmark">
            <BookmarkCheck className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium">Edit Bookmark</div>

            {/* Preview text */}
            <div className="text-xs text-muted-foreground line-clamp-2 italic">
              "{previewText.slice(0, 100)}
              {previewText.length > 100 ? "..." : ""}"
            </div>

            {/* Type selection */}
            <div className="flex gap-2">
              <Button
                variant={selectedType === BookmarksTypeOptions.bookmark ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setSelectedType(BookmarksTypeOptions.bookmark)}
              >
                <Bookmark className="h-4 w-4 mr-1" />
                Bookmark
              </Button>
              <Button
                variant={selectedType === BookmarksTypeOptions.favorite ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setSelectedType(BookmarksTypeOptions.favorite)}
              >
                <BookmarkCheck className="h-4 w-4 mr-1" />
                Favorite
              </Button>
            </div>

            {/* Label input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase text-muted-foreground ml-1">Label</label>
              <Input
                placeholder="Add a label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>

            {/* Tags selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase text-muted-foreground ml-1">Tags</label>
              <CreatableCombobox
                options={tagOptions}
                value={selectedTags}
                onSelect={handleTagSelect}
                onCreate={handleTagCreate}
                placeholder="Search or create tags..."
                isMulti
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleRemove}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity", className)}
          title="Add bookmark"
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium">Add Bookmark</div>

          {/* Preview text */}
          <div className="text-xs text-muted-foreground line-clamp-2 italic">
            "{previewText.slice(0, 100)}
            {previewText.length > 100 ? "..." : ""}"
          </div>

          {/* Type selection */}
          <div className="flex gap-2">
            <Button
              variant={selectedType === BookmarksTypeOptions.bookmark ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setSelectedType(BookmarksTypeOptions.bookmark)}
            >
              <Bookmark className="h-4 w-4 mr-1" />
              Bookmark
            </Button>
            <Button
              variant={selectedType === BookmarksTypeOptions.favorite ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setSelectedType(BookmarksTypeOptions.favorite)}
            >
              <BookmarkCheck className="h-4 w-4 mr-1" />
              Favorite
            </Button>
          </div>

          {/* Label input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase text-muted-foreground ml-1">Label</label>
            <Input
              placeholder="Add a label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          {/* Tags selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase text-muted-foreground ml-1">Tags</label>
            <CreatableCombobox
              options={tagOptions}
              value={selectedTags}
              onSelect={handleTagSelect}
              onCreate={handleTagCreate}
              placeholder="Search or create tags..."
              isMulti
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface BlockBookmarkIndicatorProps {
  blockId: string;
  previewText: string;
  bookmarkId?: string;
  isBookmarked: boolean;
  bookmarkLabel?: string;
  bookmarkType?: BookmarksTypeOptions;
  bookmarkTags?: string[];
  onAddBookmark: (label: string, type: BookmarksTypeOptions, tags: string[]) => void;
  onUpdateBookmark?: (label: string, type: BookmarksTypeOptions, tags: string[]) => void;
  onRemoveBookmark: () => void;
}

export function BlockBookmarkIndicator({
  blockId,
  previewText,
  isBookmarked,
  bookmarkLabel,
  bookmarkType,
  bookmarkTags,
  onAddBookmark,
  onUpdateBookmark,
  onRemoveBookmark,
}: BlockBookmarkIndicatorProps) {
  return (
    <span className="absolute -left-8 top-0 flex items-center gap-1">
      <BookmarkButton
        isBookmarked={isBookmarked}
        blockId={blockId}
        previewText={previewText}
        bookmarkLabel={bookmarkLabel}
        bookmarkType={bookmarkType}
        bookmarkTags={bookmarkTags}
        onAddBookmark={onAddBookmark}
        onUpdateBookmark={onUpdateBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />
    </span>
  );
}
