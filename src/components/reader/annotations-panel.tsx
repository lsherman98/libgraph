import { useState, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useHighlights, useBookmarks, usePageMarkdown, usePages } from "@/lib/api/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Highlighter, BookMarked, ExternalLink, FileText, StickyNote, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions, type HighlightsRecord, type BookmarksRecord } from "@/lib/pocketbase-types";
import { useTags } from "@/lib/api/queries";

type ReaderSearch = {
  uploadId?: string;
};

interface AnnotationsPanelProps {
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

function HighlightItem({ highlight, pageNumber, onClick }: HighlightItemProps) {
  const color = highlight.color || HighlightsColorOptions.yellow;
  const { data: allTags = [] } = useTags();

  const tagTitles = (highlight.tags || []).map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "w-1 h-full min-h-10 rounded-full shrink-0",
            color === HighlightsColorOptions.yellow && "bg-yellow-400",
            color === HighlightsColorOptions.green && "bg-green-400",
            color === HighlightsColorOptions.blue && "bg-blue-400",
            color === HighlightsColorOptions.pink && "bg-pink-400",
            color === HighlightsColorOptions.purple && "bg-purple-400",
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm line-clamp-3 text-foreground/90">"{highlight.text}"</p>
          {highlight.note && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
              <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{highlight.note}</span>
            </div>
          )}
          {tagTitles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              Page {pageNumber ?? "?"}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  );
}

interface BookmarkItemProps {
  bookmark: BookmarksRecord;
  onClick: () => void;
}

function BookmarkItem({ bookmark, onClick }: BookmarkItemProps) {
  const { data: allTags = [] } = useTags();

  const tagTitles = (bookmark.tags || []).map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <BookMarked className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0">
          {bookmark.label && <p className="text-sm font-medium text-foreground mb-1">{bookmark.label}</p>}
          {bookmark.preview_text && (
            <p className="text-sm text-muted-foreground line-clamp-2 italic">"{bookmark.preview_text}"</p>
          )}

          {tagTitles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              Page {bookmark.page_number ?? "?"}
            </Badge>
            {bookmark.type === "favorite" && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Favorite
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "highlight" | "bookmark";
  item: HighlightsRecord | BookmarksRecord | null;
  pageNumber?: number;
  onNavigate: () => void;
}

function PreviewDialog({ open, onOpenChange, type, item, pageNumber, onNavigate }: PreviewDialogProps) {
  const pageId = item?.page ?? null;
  const { data: markdown, isLoading } = usePageMarkdown(pageId);

  if (!item) return null;

  const isHighlight = type === "highlight";
  const highlight = isHighlight ? (item as HighlightsRecord) : null;
  const bookmark = !isHighlight ? (item as BookmarksRecord) : null;

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
            ) : (
              <>
                <BookMarked className="h-5 w-5 text-amber-500" />
                {bookmark?.label || "Bookmark Preview"}
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
            {highlight.note && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
                <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{highlight.note}</p>
              </div>
            )}
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

export function AnnotationsPanel({ currentPageId, currentPageNumber, onNavigateToPage }: AnnotationsPanelProps) {
  const search = useSearch({ strict: false }) as ReaderSearch;
  const uploadId = search.uploadId ?? null;

  const [showCurrentPageOnly, setShowCurrentPageOnly] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: allHighlights = [] } = useHighlights(uploadId);
  const { data: allBookmarks = [] } = useBookmarks(uploadId);
  const { data: pagesData } = usePages(uploadId, 1, 1000); // Get all pages to map page IDs to numbers

  // Create a map of page ID to page number
  const pageIdToNumber = useMemo(() => {
    const map = new Map<string, number>();
    pagesData?.items.forEach((page) => {
      map.set(page.id, page.page);
    });
    return map;
  }, [pagesData]);

  // Filter by current page if toggle is enabled
  const highlights = useMemo(() => {
    if (!showCurrentPageOnly || !currentPageId) return allHighlights;
    return allHighlights.filter((h) => h.page === currentPageId);
  }, [allHighlights, showCurrentPageOnly, currentPageId]);

  const bookmarks = useMemo(() => {
    if (!showCurrentPageOnly || !currentPageNumber) return allBookmarks;
    return allBookmarks.filter((b) => b.page_number === currentPageNumber);
  }, [allBookmarks, showCurrentPageOnly, currentPageNumber]);

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

  const handleNavigate = () => {
    if (!previewItem) return;

    const pageNumber =
      previewType === "highlight"
        ? previewItem.page
          ? pageIdToNumber.get(previewItem.page)
          : undefined
        : (previewItem as BookmarksRecord).page_number;

    const blockId = previewType === "bookmark" ? (previewItem as BookmarksRecord).block_id : undefined;

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
      {/* Filter toggle */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <Label htmlFor="current-page-toggle" className="text-sm font-medium">
            Current page only
          </Label>
          <Switch
            id="current-page-toggle"
            checked={showCurrentPageOnly}
            onCheckedChange={setShowCurrentPageOnly}
            disabled={!currentPageId}
          />
        </div>
      </div>

      <Tabs defaultValue="highlights" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-auto mt-3">
          <TabsTrigger value="highlights" className="flex-1 gap-1.5">
            <Highlighter className="h-3.5 w-3.5" />
            Highlights
            {highlights.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {highlights.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="flex-1 gap-1.5">
            <BookMarked className="h-3.5 w-3.5" />
            Bookmarks
            {bookmarks.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {bookmarks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="highlights" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {highlights.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Highlighter className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No highlights yet</p>
                  <p className="text-xs mt-1">Select text in the reader to create a highlight</p>
                </div>
              ) : (
                highlights.map((highlight) => (
                  <HighlightItem
                    key={highlight.id}
                    highlight={highlight}
                    pageNumber={highlight.page ? pageIdToNumber.get(highlight.page) : undefined}
                    onClick={() => handleHighlightClick(highlight)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="bookmarks" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {bookmarks.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No bookmarks yet</p>
                  <p className="text-xs mt-1">Use the bookmark button on paragraphs to save them</p>
                </div>
              ) : (
                bookmarks.map((bookmark) => (
                  <BookmarkItem key={bookmark.id} bookmark={bookmark} onClick={() => handleBookmarkClick(bookmark)} />
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
