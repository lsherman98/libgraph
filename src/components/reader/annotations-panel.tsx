import { useState, useMemo } from "react";
import { useHighlights, useBookmarks, useNotes, usePages, useTags } from "@/lib/api/queries";
import { useDeleteNote } from "@/lib/api/mutations";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Highlighter, BookMarked, Pencil, Trash2, StickyNote, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions, type HighlightsRecord, type BookmarksRecord, type NotesRecord } from "@/lib/pocketbase-types";
import { useReaderStore } from "@/lib/stores/reader-store";
import { AddToProjectButton } from "./add-to-project-button";
import { PreviewDialog } from "@/components/workspace/preview-dialog";

interface AnnotationsPanelProps {
  activeTab?: "highlights" | "bookmarks" | "notes";
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

interface HighlightItemProps {
  highlight: HighlightsRecord;
  pageNumber?: number;
  onClick: () => void;
}

function HighlightItem({ highlight, pageNumber, onClick, onEdit }: HighlightItemProps & { onEdit: () => void }) {
  const color = highlight.color || HighlightsColorOptions.yellow;
  const { data: allTags = [] } = useTags();

  const tagTitles = (highlight.tags || []).map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  return (
    <div className="group/item w-full text-left p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "w-1 h-full min-h-8 rounded-full shrink-0",
            color === HighlightsColorOptions.yellow && "bg-yellow-400",
            color === HighlightsColorOptions.green && "bg-green-400",
            color === HighlightsColorOptions.blue && "bg-blue-400",
            color === HighlightsColorOptions.pink && "bg-pink-400",
            color === HighlightsColorOptions.purple && "bg-purple-400",
          )}
        />
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <p className="text-sm line-clamp-2 text-foreground/90">"{highlight.text}"</p>
          {(highlight.comment || tagTitles.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
              {highlight.comment && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <StickyNote className="h-3 w-3 shrink-0" />
                  <span className="truncate">{highlight.comment}</span>
                </span>
              )}
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
            <AddToProjectButton itemId={highlight.id} itemType="highlight" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit highlight"
          >
            <SquarePen className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BookmarkItemProps {
  bookmark: BookmarksRecord;
  onClick: () => void;
}

function BookmarkItem({ bookmark, onClick, onEdit }: BookmarkItemProps & { onEdit: () => void }) {
  const { data: allTags = [] } = useTags();

  const tagTitles = (bookmark.tags || []).map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  return (
    <div className="group/item w-full text-left p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-2">
        <BookMarked className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {bookmark.comment && <span className="text-sm text-muted-foreground italic">"{bookmark.comment}"</span>}
            {tagTitles.map((title, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                {title}
              </Badge>
            ))}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
            <AddToProjectButton itemId={bookmark.id} itemType="bookmark" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit bookmark"
          >
            <SquarePen className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NoteItemProps {
  note: NotesRecord;
  onDelete: () => void;
  onClick: () => void;
}

function NoteItem({ note, onDelete, onClick, onEdit }: NoteItemProps & { onEdit: () => void }) {
  const { data: allTags = [] } = useTags();

  const tagTitles = (note.tags || []).map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  return (
    <div className="group/item w-full text-left p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-2">
        <Pencil className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-sm text-foreground">{note.content}</span>
            {tagTitles.map((title, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                {title}
              </Badge>
            ))}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <AddToProjectButton itemId={note.id} itemType="note" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit note"
            >
              <SquarePen className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete note"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnotationsPanel({ activeTab = "highlights", onNavigateToPage: propNavigateToPage }: AnnotationsPanelProps) {
  const storeUploadId = useReaderStore((state) => state.currentUploadId);
  const storeNavigateToPage = useReaderStore((state) => state.navigateToPage);

  const uploadId = storeUploadId;
  const onNavigateToPage = storeNavigateToPage ?? propNavigateToPage ?? null;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: allHighlights = [] } = useHighlights(uploadId || undefined);
  const { data: allBookmarks = [] } = useBookmarks(uploadId || undefined);
  const { data: allNotes = [] } = useNotes(uploadId || undefined);
  const { data: pagesData } = usePages(uploadId || undefined, 1, 1000);

  const pageIdToNumber = useMemo(() => {
    const map = new Map<string, number>();
    pagesData?.items.forEach((page) => {
      map.set(page.id, page.page);
    });
    return map;
  }, [pagesData]);

  const groupedHighlights = useMemo(() => {
    const grouped = new Map<number, HighlightsRecord[]>();

    allHighlights?.forEach((highlight) => {
      const pageNum = highlight.page ? pageIdToNumber.get(highlight.page) : undefined;
      const displayPageNum = pageNum ?? 0;
      if (!grouped.has(displayPageNum)) {
        grouped.set(displayPageNum, []);
      }
      grouped.get(displayPageNum)!.push(highlight);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, items]) => ({ pageNumber, items }));
  }, [allHighlights, pageIdToNumber]);

  const groupedBookmarks = useMemo(() => {
    const grouped = new Map<number, BookmarksRecord[]>();

    allBookmarks?.forEach((bookmark) => {
      const displayPageNum = bookmark.page_number ?? 0;

      if (!grouped.has(displayPageNum)) {
        grouped.set(displayPageNum, []);
      }
      grouped.get(displayPageNum)!.push(bookmark);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, items]) => ({ pageNumber, items }));
  }, [allBookmarks]);

  const groupedNotes = useMemo(() => {
    const grouped = new Map<number, NotesRecord[]>();

    allNotes?.forEach((note) => {
      const displayPageNum = note.page_number ?? 0;

      if (!grouped.has(displayPageNum)) {
        grouped.set(displayPageNum, []);
      }
      grouped.get(displayPageNum)!.push(note);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, items]) => ({ pageNumber, items }));
  }, [allNotes]);

  const handleHighlightClick = (highlight: HighlightsRecord) => {
    const pageNum = highlight.page ? pageIdToNumber.get(highlight.page) : undefined;
    setPreviewType("highlight");
    setPreviewItem(highlight);
    setPreviewPageNumber(pageNum);
    setPreviewOpen(true);
  };

  const handleBookmarkClick = (bookmark: BookmarksRecord) => {
    setPreviewType("bookmark");
    setPreviewItem(bookmark);
    setPreviewPageNumber(bookmark.page_number);
    setPreviewOpen(true);
  };

  const handleNoteClick = (note: NotesRecord) => {
    setPreviewType("note");
    setPreviewItem(note);
    setPreviewPageNumber(note.page_number);
    setPreviewOpen(true);
  };

  const setEditorState = useReaderStore((state) => state.setEditorState);

  const handleHighlightEdit = (highlight: HighlightsRecord) => {
    setEditorState({
      mode: "editing-highlight",
      data: {
        id: highlight.id,
        text: highlight.text || "",
        color: highlight.color || HighlightsColorOptions.yellow,
        note: highlight.comment || undefined,
        tags: highlight.tags || undefined,
        pageId: highlight.page || "",
      },
    });
  };

  const handleBookmarkEdit = (bookmark: BookmarksRecord) => {
    setEditorState({
      mode: "editing-bookmark",
      data: {
        id: bookmark.id,
        blockId: bookmark.block_id || "",
        previewText: "",
        comment: bookmark.comment || undefined,
        tags: bookmark.tags || undefined,
        pageId: bookmark.page || "",
        pageNumber: bookmark.page_number || 0,
      },
    });
  };

  const handleNoteEdit = (note: NotesRecord) => {
    setEditorState({
      mode: "editing-note",
      data: {
        id: note.id,
        blockId: note.block_id || "",
        previewText: undefined,
        content: note.content || undefined,
        tags: note.tags || undefined,
        pageId: note.page || "",
        pageNumber: note.page_number || 0,
      },
    });
  };

  const deleteNoteMutation = useDeleteNote();

  const handleNavigate = () => {
    if (!previewItem) return;

    let pageNumber: number | undefined;
    let blockId: string | undefined;

    if (previewType === "highlight") {
      pageNumber = previewItem.page ? pageIdToNumber.get(previewItem.page) : undefined;
    } else if (previewType === "bookmark") {
      const bookmark = previewItem as BookmarksRecord;
      pageNumber = bookmark.page_number;
      blockId = bookmark.block_id;
    } else if (previewType === "note") {
      const note = previewItem as NotesRecord;
      pageNumber = note.page_number;
      blockId = note.block_id;
    }

    if (pageNumber && onNavigateToPage) {
      onNavigateToPage(pageNumber, blockId);
    }
    setPreviewOpen(false);
  };

  if (!uploadId) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Open a document to see annotations</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {activeTab === "highlights" && (
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-4">
              {groupedHighlights.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Highlighter className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No highlights yet</p>
                  <p className="text-xs mt-1">Select text in the reader to create a highlight</p>
                </div>
              ) : (
                groupedHighlights.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((highlight) => (
                      <HighlightItem
                        key={highlight.id}
                        highlight={highlight}
                        pageNumber={highlight.page ? pageIdToNumber.get(highlight.page) : undefined}
                        onClick={() => handleHighlightClick(highlight)}
                        onEdit={() => handleHighlightEdit(highlight)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {activeTab === "bookmarks" && (
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-4">
              {groupedBookmarks.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No bookmarks yet</p>
                  <p className="text-xs mt-1">Use the bookmark button on paragraphs to save them</p>
                </div>
              ) : (
                groupedBookmarks.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((bookmark) => (
                      <BookmarkItem
                        key={bookmark.id}
                        bookmark={bookmark}
                        onClick={() => handleBookmarkClick(bookmark)}
                        onEdit={() => handleBookmarkEdit(bookmark)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {activeTab === "notes" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-4">
              {groupedNotes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Pencil className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No notes yet</p>
                  <p className="text-xs mt-1">Click the note icon on paragraphs to add notes</p>
                </div>
              ) : (
                groupedNotes.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((note) => (
                      <NoteItem
                        key={note.id}
                        note={note}
                        onDelete={() => deleteNoteMutation.mutate(note.id)}
                        onClick={() => handleNoteClick(note)}
                        onEdit={() => handleNoteEdit(note)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={previewType}
        item={previewItem}
        pageNumber={previewPageNumber}
        uploadId={uploadId || undefined}
        totalPages={pagesData?.totalItems}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
