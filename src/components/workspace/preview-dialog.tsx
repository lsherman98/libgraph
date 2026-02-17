import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Highlighter, BookMarked, ExternalLink, FileText, Pencil, StickyNote, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions, type HighlightsRecord, type BookmarksRecord, type NotesRecord } from "@/lib/pocketbase-types";
import { usePageMarkdown, usePageByNumber, usePages } from "@/lib/api/queries";

export const highlightColorClasses: Record<HighlightsColorOptions, string> = {
  [HighlightsColorOptions.yellow]: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200",
  [HighlightsColorOptions.green]: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-200",
  [HighlightsColorOptions.blue]: "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200",
  [HighlightsColorOptions.pink]: "bg-pink-200 text-pink-900 dark:bg-pink-900/50 dark:text-pink-200",
  [HighlightsColorOptions.purple]: "bg-purple-200 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200",
};

export interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "highlight" | "bookmark" | "note";
  item: HighlightsRecord | BookmarksRecord | NotesRecord | null;
  pageNumber?: number;
  totalPages?: number;
  uploadId?: string;
  onNavigate: () => void;
}

export function PreviewDialog({ open, onOpenChange, type, item, pageNumber, totalPages: totalPagesProp, uploadId, onNavigate }: PreviewDialogProps) {
  const [currentPageNumber, setCurrentPageNumber] = useState<number | undefined>(pageNumber);
  const isOnOriginalPage = currentPageNumber === pageNumber;

  useEffect(() => {
    if (open) {
      setCurrentPageNumber(pageNumber);
    }
  }, [open, pageNumber]);

  const { data: pagesData } = usePages(open && uploadId ? uploadId : undefined, 1, 1);
  const totalPages = totalPagesProp ?? pagesData?.totalItems;

  const originalPageId = item?.page;
  const { data: navigatedPage } = usePageByNumber(!isOnOriginalPage && uploadId ? uploadId : "", currentPageNumber ?? 0);

  const activePageId = isOnOriginalPage ? originalPageId : navigatedPage?.id;
  const { data: markdown, isLoading } = usePageMarkdown(activePageId);

  if (!item) return null;

  const isHighlight = type === "highlight";
  const isNote = type === "note";
  const highlight = isHighlight ? (item as HighlightsRecord) : null;
  const bookmark = type === "bookmark" ? (item as BookmarksRecord) : null;
  const note = isNote ? (item as NotesRecord) : null;

  const canNavigate = !!uploadId && totalPages != null && totalPages > 1;
  const canGoPrev = canNavigate && (currentPageNumber ?? 1) > 1;
  const canGoNext = canNavigate && (currentPageNumber ?? 1) < (totalPages ?? 1);

  const goToPrevPage = () => {
    if (canGoPrev) setCurrentPageNumber((p) => (p ?? 1) - 1);
  };
  const goToNextPage = () => {
    if (canGoNext) setCurrentPageNumber((p) => (p ?? 1) + 1);
  };

  const renderPageContent = () => {
    if (!markdown) return null;

    if (isOnOriginalPage && highlight && highlight.start_offset !== undefined && highlight.end_offset !== undefined) {
      const before = markdown.slice(0, highlight.start_offset);
      const highlighted = markdown.slice(highlight.start_offset, highlight.end_offset);
      const after = markdown.slice(highlight.end_offset);

      return (
        <>
          <span>{before}</span>
          <mark className={cn("px-0.5 rounded", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}>{highlighted}</mark>
          <span>{after}</span>
        </>
      );
    }

    return <span>{markdown}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl min-w-4xl max-h-[85vh] flex flex-col">
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
          <DialogDescription>Page {pageNumber ?? "?"}</DialogDescription>
        </DialogHeader>
        {isHighlight && highlight && (
          <div className="shrink-0 mb-2">
            <div className={cn("p-3 rounded-lg", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}>
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
        {isNote && note && (
          <div className="shrink-0 mb-2">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 border rounded-lg bg-card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground shrink-0">
            <FileText className="h-3.5 w-3.5" />
            Page {currentPageNumber ?? "?"} content
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : markdown ? (
              <div className="text-sm text-foreground/80 font-serif leading-relaxed whitespace-pre-wrap">{renderPageContent()}</div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Could not load page content</div>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 flex items-center !justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canNavigate && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevPage} disabled={!canGoPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[5rem] text-center">
                {currentPageNumber ?? "?"} / {totalPages ?? "?"}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextPage} disabled={!canGoNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button onClick={onNavigate} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Go to page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
