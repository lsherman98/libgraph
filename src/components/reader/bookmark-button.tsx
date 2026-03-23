import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Bookmark, BookmarkCheck, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/lib/stores/reader-store";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useCreateBookmark, useDeleteBookmark, useUpdateBookmark, useCreateNote, useUpdateNote, useDeleteNote } from "@/lib/api/mutations";
import { getUserId } from "@/lib/utils";
import { useEditorTagManagement } from "@/lib/hooks/use-tags-helpers";

interface BlockActionsProps {
  blockId: string;
  previewText: string;
  pageId: string;
  pageNumber: number;
  isBookmarked: boolean;
  bookmarkId?: string;
  bookmarkComment?: string;
  bookmarkTags?: string[];
  hasNote?: boolean;
  noteId?: string;
  noteContent?: string;
  noteTags?: string[];
  className?: string;
}

export function BlockActions({
  blockId,
  previewText,
  pageId,
  pageNumber,
  isBookmarked,
  bookmarkId,
  bookmarkComment,
  bookmarkTags,
  hasNote,
  noteId,
  noteContent,
  noteTags,
  className,
}: BlockActionsProps) {
  const [isBookmarkPopoverOpen, setIsBookmarkPopoverOpen] = useState(false);
  const [isNotePopoverOpen, setIsNotePopoverOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [noteContentValue, setNoteContentValue] = useState("");

  const createBookmarkMutation = useCreateBookmark();
  const updateBookmarkMutation = useUpdateBookmark();
  const deleteBookmarkMutation = useDeleteBookmark();
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const setEditorState = useReaderStore((state) => state.setEditorState);
  const editorState = useReaderStore((state) => state.editorState);
  const currentUploadId = useReaderStore((state) => state.currentUploadId);

  const {
    selectedTags: bookmarkSelectedTags,
    setSelectedTags: setBookmarkSelectedTags,
    tagOptions: bookmarkTagOptions,
    handleTagSelect: handleBookmarkTagSelect,
    handleTagCreate: handleBookmarkTagCreate,
  } = useEditorTagManagement([]);

  const {
    selectedTags: noteSelectedTags,
    setSelectedTags: setNoteSelectedTags,
    tagOptions: noteTagOptions,
    handleTagSelect: handleNoteTagSelect,
    handleTagCreate: handleNoteTagCreate,
  } = useEditorTagManagement([]);

  useEffect(() => {
    if (!isBookmarkPopoverOpen) return;
    if (isBookmarked) {
      setComment(bookmarkComment || "");
      setBookmarkSelectedTags(bookmarkTags || []);
      return;
    }

    setComment("");
    setBookmarkSelectedTags([]);
  }, [isBookmarkPopoverOpen, isBookmarked, bookmarkComment, bookmarkTags, setBookmarkSelectedTags]);

  useEffect(() => {
    if (!isNotePopoverOpen) return;
    if (hasNote) {
      setNoteContentValue(noteContent || "");
      setNoteSelectedTags(noteTags || []);
      return;
    }

    setNoteContentValue("");
    setNoteSelectedTags([]);
  }, [isNotePopoverOpen, hasNote, noteContent, noteTags, setNoteSelectedTags]);

  const handleBookmarkPopoverOpenChange = (open: boolean) => {
    setIsBookmarkPopoverOpen(open);

    if (!open && editorState?.mode === "pending-bookmark" && editorState.data.blockId === blockId) {
      setEditorState(null);
    }
  };

  const handleNotePopoverOpenChange = (open: boolean) => {
    setIsNotePopoverOpen(open);

    if (
      !open &&
      (editorState?.mode === "pending-note" || editorState?.mode === "editing-note") &&
      editorState.data.blockId === blockId
    ) {
      setEditorState(null);
    }
  };

  const openBookmarkPopover = () => {
    setEditorState({
      mode: "pending-bookmark",
      data: {
        blockId,
        previewText: previewText.slice(0, 150),
        pageId,
        pageNumber,
      },
    });
    setIsBookmarkPopoverOpen(true);
  };

  const handleSaveBookmark = () => {
    if (isBookmarked && bookmarkId) {
      updateBookmarkMutation.mutate({
        id: bookmarkId,
        data: {
          comment: comment || undefined,
          tags: bookmarkSelectedTags.length > 0 ? bookmarkSelectedTags : undefined,
        },
      });

      setEditorState(null);
      setIsBookmarkPopoverOpen(false);
      return;
    }

    if (!currentUploadId) return;

    createBookmarkMutation.mutate({
      upload: currentUploadId,
      page: pageId,
      page_number: pageNumber,
      block_id: blockId,
      comment: comment || "",
      tags: bookmarkSelectedTags.length > 0 ? bookmarkSelectedTags : undefined,
      user: getUserId(),
    });

    setEditorState(null);
    setIsBookmarkPopoverOpen(false);
  };

  const handleDeleteBookmark = () => {
    if (!isBookmarked || !bookmarkId) return;

    deleteBookmarkMutation.mutate(bookmarkId);
    setEditorState(null);
    setIsBookmarkPopoverOpen(false);
  };

  const handleBookmarkClick = () => {
    openBookmarkPopover();
  };

  const openNotePopover = () => {
    if (hasNote && noteId) {
      setEditorState({
        mode: "editing-note",
        data: {
          id: noteId,
          blockId,
          previewText: previewText.slice(0, 150),
          content: noteContent,
          tags: noteTags,
          pageId,
          pageNumber,
        },
      });
    } else {
      setEditorState({
        mode: "pending-note",
        data: {
          blockId,
          previewText: previewText.slice(0, 150),
          pageId,
          pageNumber,
        },
      });
    }

    setIsNotePopoverOpen(true);
  };

  const handleSaveNote = () => {
    if (!noteContentValue.trim()) return;

    if (hasNote && noteId) {
      updateNoteMutation.mutate({
        id: noteId,
        data: {
          content: noteContentValue.trim(),
          tags: noteSelectedTags.length > 0 ? noteSelectedTags : undefined,
        },
      });
    } else {
      if (!currentUploadId) return;
      createNoteMutation.mutate({
        upload: currentUploadId,
        page: pageId,
        page_number: pageNumber,
        block_id: blockId,
        content: noteContentValue.trim(),
        tags: noteSelectedTags.length > 0 ? noteSelectedTags : undefined,
        user: getUserId(),
      });
    }

    setEditorState(null);
    setIsNotePopoverOpen(false);
  };

  const handleDeleteNote = () => {
    if (!hasNote || !noteId) return;

    deleteNoteMutation.mutate(noteId);
    setEditorState(null);
    setIsNotePopoverOpen(false);
  };

  const handleNoteClick = () => {
    openNotePopover();
  };

  const hasOpenPopover = isBookmarkPopoverOpen || isNotePopoverOpen;

  return (
    <span className={cn("absolute -left-8 top-0 flex flex-col items-center gap-0.5", className)}>
      <Popover open={isBookmarkPopoverOpen} onOpenChange={handleBookmarkPopoverOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 transition-opacity focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
              isBookmarked ? "text-amber-500 opacity-100" : hasOpenPopover ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:opacity-100",
            )}
            title={isBookmarked ? "Edit bookmark" : "Add bookmark"}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleBookmarkClick();
            }}
          >
            {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="left"
          className="w-80 space-y-3"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Comment</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-24 text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Tags</label>
            <CreatableCombobox
              options={bookmarkTagOptions}
              value={bookmarkSelectedTags}
              onSelect={handleBookmarkTagSelect}
              onCreate={handleBookmarkTagCreate}
              placeholder="Search or create tags..."
              isMulti
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            {isBookmarked && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDeleteBookmark}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditorState(null);
                setIsBookmarkPopoverOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveBookmark}>
              {isBookmarked ? "Update" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Popover open={isNotePopoverOpen} onOpenChange={handleNotePopoverOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 transition-opacity focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
              hasNote ? "text-blue-500 opacity-100" : hasOpenPopover ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:opacity-100",
            )}
            title={hasNote ? "Edit note" : "Add note"}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleNoteClick();
            }}
          >
            <StickyNote className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="left"
          className="w-80 space-y-3"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Note</label>
            <Textarea
              value={noteContentValue}
              onChange={(e) => setNoteContentValue(e.target.value)}
              className="min-h-24 text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground mb-2 block">Tags</label>
            <CreatableCombobox
              options={noteTagOptions}
              value={noteSelectedTags}
              onSelect={handleNoteTagSelect}
              onCreate={handleNoteTagCreate}
              placeholder="Search or create tags..."
              isMulti
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            {hasNote && (
              <Button variant="ghost" size="sm" className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteNote}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditorState(null);
                setIsNotePopoverOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveNote} disabled={!noteContentValue.trim()}>
              {hasNote ? "Update" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
