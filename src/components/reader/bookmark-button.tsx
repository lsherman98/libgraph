import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useSidebar } from "@/components/ui/sidebar";

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
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const { setOpenRight } = useSidebar();

  const openSidebar = () => {
    setOpenRight(true);
  };

  const handleBookmarkClick = () => {
    if (isBookmarked && bookmarkId) {
      setEditorState({
        mode: "editing-bookmark",
        data: {
          id: bookmarkId,
          blockId,
          previewText: previewText.slice(0, 150),
          comment: bookmarkComment,
          tags: bookmarkTags,
          pageId,
          pageNumber,
        },
      });
    } else {
      setEditorState({
        mode: "pending-bookmark",
        data: {
          blockId,
          previewText: previewText.slice(0, 150),
          pageId,
          pageNumber,
        },
      });
    }
    openSidebar();
  };

  const handleNoteClick = () => {
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
    openSidebar();
  };

  return (
    <span className={cn("absolute -left-8 top-0 flex flex-col items-center gap-0.5", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6 transition-opacity",
          isBookmarked ? "text-amber-500 opacity-100" : "opacity-0 group-hover:opacity-60 hover:opacity-100",
        )}
        title={isBookmarked ? "Edit bookmark" : "Add bookmark"}
        onClick={handleBookmarkClick}
      >
        {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6 transition-opacity", hasNote ? "text-blue-500 opacity-100" : "opacity-0 group-hover:opacity-60 hover:opacity-100")}
        title={hasNote ? "Edit note" : "Add note"}
        onClick={handleNoteClick}
      >
        <StickyNote className="h-4 w-4" />
      </Button>
    </span>
  );
}
