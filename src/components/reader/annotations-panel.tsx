import { useState, useMemo } from "react";
import { useHighlights, useBookmarks, useNotes, usePageMarkdown, usePages, useTags } from "@/lib/api/queries";
import { useDeleteNote } from "@/lib/api/mutations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Highlighter,
  BookMarked,
  ExternalLink,
  FileText,
  Tag,
  Pencil,
  Trash2,
  StickyNote,
  SquarePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HighlightsColorOptions,
  type HighlightsRecord,
  type BookmarksRecord,
  type NotesRecord,
} from "@/lib/pocketbase-types";
import { useReaderStore } from "@/lib/stores/reader-store";
import { AddToProjectButton } from "./add-to-project-button";

interface AnnotationsPanelProps {
  // Props are now optional - we prefer reading from the store
  currentPageId?: string;
  currentPageNumber?: number;
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

// Color classes for highlight badges
const highlightColorClasses: Record<HighlightsColorOptions, string> = {
  [HighlightsColorOptions.yellow]: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200",
  [HighlightsColorOptions.green]: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-200",
  [HighlightsColorOptions.blue]: "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200",
  [HighlightsColorOptions.pink]: "bg-pink-200 text-pink-900 dark:bg-pink-900/50 dark:text-pink-200",
  [HighlightsColorOptions.purple]: "bg-purple-200 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200",
};

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
          {highlight.comment && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
              <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-1">{highlight.comment}</span>
            </div>
          )}
          {tagTitles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">p.{pageNumber ?? "?"}</span>
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
          {bookmark.comment && (
            <p className="text-sm text-muted-foreground line-clamp-2 italic">"{bookmark.comment}"</p>
          )}
          {tagTitles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">p.{bookmark.page_number ?? "?"}</span>
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
          <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">{note.content}</p>

          {tagTitles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">p.{note.page_number ?? "?"}</span>
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

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "highlight" | "bookmark" | "note";
  item: HighlightsRecord | BookmarksRecord | NotesRecord | null;
  pageNumber?: number;
  onNavigate: () => void;
}

function PreviewDialog({ open, onOpenChange, type, item, pageNumber, onNavigate }: PreviewDialogProps) {
  const pageId = item?.page;
  const { data: markdown, isLoading } = usePageMarkdown(pageId);

  if (!item) return null;

  const isHighlight = type === "highlight";
  const isNote = type === "note";
  const highlight = isHighlight ? (item as HighlightsRecord) : null;
  const bookmark = type === "bookmark" ? (item as BookmarksRecord) : null;
  const note = isNote ? (item as NotesRecord) : null;

  // Render the full page content with the highlight marked
  const renderPageContent = () => {
    if (!markdown) return null;

    if (highlight && highlight.start_offset !== undefined && highlight.end_offset !== undefined) {
      const before = markdown.slice(0, highlight.start_offset);
      const highlighted = markdown.slice(highlight.start_offset, highlight.end_offset);
      const after = markdown.slice(highlight.end_offset);

      return (
        <>
          <span>{before}</span>
          <mark
            className={cn("px-0.5 rounded", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}
          >
            {highlighted}
          </mark>
          <span>{after}</span>
        </>
      );
    }

    return <span>{markdown}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {isHighlight ? (
              <>
                <Highlighter className="h-5 w-5" />
                Highlight Preview
              </>
            ) : isNote ? (
              <>
                <Pencil className="h-5 w-5 text-blue-500" />
                Note Preview
              </>
            ) : (
              <>
                <BookMarked className="h-5 w-5 text-amber-500" />
                {bookmark?.comment || "Bookmark Preview"}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            Page {pageNumber ?? "?"} • Click "Go to page" to navigate to this location
          </DialogDescription>
        </DialogHeader>

        {/* Highlighted text or bookmark info - fixed at top */}
        {isHighlight && highlight && (
          <div className="shrink-0 mb-2">
            <div
              className={cn("p-3 rounded-lg", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}
            >
              <p className="text-sm font-medium">"{highlight.text}"</p>
            </div>
            {highlight.comment && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
                <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{highlight.comment}</p>
              </div>
            )}
          </div>
        )}

        {/* Note content - fixed at top */}
        {isNote && note && (
          <div className="shrink-0 mb-2">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
            </div>
          </div>
        )}

        {/* Full page content - scrollable */}
        <div className="flex-1 min-h-0 border rounded-lg bg-card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground shrink-0">
            <FileText className="h-3.5 w-3.5" />
            Page {pageNumber ?? "?"} content
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : markdown ? (
              <div className="text-sm text-foreground/80 font-serif leading-relaxed whitespace-pre-wrap">
                {renderPageContent()}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Could not load page content</div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onNavigate} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Go to page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AnnotationsPanel({
  currentPageId: propPageId,
  currentPageNumber: propPageNumber,
  onNavigateToPage: propNavigateToPage,
}: AnnotationsPanelProps) {
  // Read from store as primary source, fall back to props for backwards compatibility
  const storeUploadId = useReaderStore((state) => state.currentUploadId);
  const storePageId = useReaderStore((state) => state.currentPageId);
  const storePageNumber = useReaderStore((state) => state.currentPageNumber);
  const storeNavigateToPage = useReaderStore((state) => state.navigateToPage);

  // Use store values, falling back to props if store is empty
  const uploadId = storeUploadId;
  const currentPageId = storePageId ?? propPageId ?? null;
  const currentPageNumber = storePageNumber ?? propPageNumber ?? null;
  const onNavigateToPage = storeNavigateToPage ?? propNavigateToPage ?? null;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: allHighlights = [] } = useHighlights(uploadId || undefined);
  const { data: allBookmarks = [] } = useBookmarks(uploadId || undefined);
  const { data: allNotes = [] } = useNotes(uploadId || undefined);
  const { data: pagesData } = usePages(uploadId || undefined, 1, 1000); // Get all pages to map page IDs to numbers

  // Create a map of page ID to page number
  const pageIdToNumber = useMemo(() => {
    const map = new Map<string, number>();
    pagesData?.items.forEach((page) => {
      map.set(page.id, page.page);
    });
    return map;
  }, [pagesData]);

  // Group highlights by page
  const groupedHighlights = useMemo(() => {
    const grouped = new Map<number, HighlightsRecord[]>();

    allHighlights?.forEach((highlight) => {
      const pageNum = highlight.page ? pageIdToNumber.get(highlight.page) : undefined;
      const displayPageNum = pageNum ?? 0; // 0 for unknown/no page

      if (!grouped.has(displayPageNum)) {
        grouped.set(displayPageNum, []);
      }
      grouped.get(displayPageNum)!.push(highlight);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, items]) => ({ pageNumber, items }));
  }, [allHighlights, pageIdToNumber]);

  // Group bookmarks by page
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

  // Group notes by page number
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

  // Edit handlers - use the store to open editors
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
      <Tabs defaultValue="highlights" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-auto mt-3">
          <TabsTrigger value="highlights" className="flex-1 gap-1.5">
            <Highlighter className="h-3.5 w-3.5" />
            Highlights
            {allHighlights && allHighlights.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {allHighlights.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="flex-1 gap-1.5">
            <BookMarked className="h-3.5 w-3.5" />
            Bookmarks
            {allBookmarks && allBookmarks.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {allBookmarks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1 gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Notes
            {allNotes && allNotes.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {allNotes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="highlights" className="flex-1 min-h-0 mt-0">
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
        </TabsContent>

        <TabsContent value="bookmarks" className="flex-1 min-h-0 mt-0">
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
        </TabsContent>

        <TabsContent value="notes" className="flex-1 min-h-0 mt-0 flex flex-col">
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
        </TabsContent>
      </Tabs>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={previewType}
        item={previewItem}
        pageNumber={previewPageNumber}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
