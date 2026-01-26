import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookmarksTypeOptions } from "@/lib/pocketbase-types";

interface BookmarkButtonProps {
  isBookmarked: boolean;
  blockId: string;
  previewText: string;
  bookmarkLabel?: string;
  bookmarkType?: BookmarksTypeOptions;
  onAddBookmark: (label: string, type: BookmarksTypeOptions) => void;
  onUpdateBookmark?: (label: string, type: BookmarksTypeOptions) => void;
  onRemoveBookmark: () => void;
  className?: string;
}

export function BookmarkButton({
  isBookmarked,
  blockId: _blockId,
  previewText,
  bookmarkLabel = "",
  bookmarkType = BookmarksTypeOptions.bookmark,
  onAddBookmark,
  onUpdateBookmark,
  onRemoveBookmark,
  className,
}: BookmarkButtonProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(bookmarkLabel);
  const [selectedType, setSelectedType] = useState<BookmarksTypeOptions>(bookmarkType);

  // Sync state when props change
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setLabel(bookmarkLabel);
      setSelectedType(bookmarkType);
    }
    setOpen(newOpen);
  };

  const handleSave = () => {
    if (isBookmarked && onUpdateBookmark) {
      onUpdateBookmark(label, selectedType);
    } else {
      onAddBookmark(label, selectedType);
    }
    setLabel("");
    setOpen(false);
  };

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
            <Input
              placeholder="Add a label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />

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
          <Input
            placeholder="Add a label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />

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
  onAddBookmark: (label: string, type: BookmarksTypeOptions) => void;
  onRemoveBookmark: () => void;
}

export function BlockBookmarkIndicator({
  blockId,
  previewText,
  isBookmarked,
  onAddBookmark,
  onRemoveBookmark,
}: BlockBookmarkIndicatorProps) {
  return (
    <span className="absolute -left-8 top-0 flex items-center gap-1">
      <BookmarkButton
        isBookmarked={isBookmarked}
        blockId={blockId}
        previewText={previewText}
        onAddBookmark={onAddBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />
    </span>
  );
}
