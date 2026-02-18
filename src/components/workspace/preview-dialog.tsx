import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Highlighter, BookMarked, ExternalLink, FileText, Pencil, StickyNote, ChevronLeft, ChevronRight, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions, type HighlightsRecord, type BookmarksRecord, type NotesRecord } from "@/lib/pocketbase-types";
import { usePageMarkdown, usePageByNumber, usePages } from "@/lib/api/queries";
import { HIGHLIGHT_PREVIEW_CLASSES } from "@/lib/constants/highlight-colors";
import { Link } from "@tanstack/react-router";
import type { ChatSource } from "@/lib/types";

export interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "highlight" | "bookmark" | "note" | "source" | "upload";
  item: HighlightsRecord | BookmarksRecord | NotesRecord | null;
  source?: ChatSource | null;
  pageNumber?: number;
  totalPages?: number;
  uploadId?: string;
  uploadTitle?: string;
  onNavigate?: () => void;
}

export function PreviewDialog({
  open,
  onOpenChange,
  type,
  item,
  source,
  pageNumber,
  totalPages: totalPagesProp,
  uploadId,
  uploadTitle,
  onNavigate,
}: PreviewDialogProps) {
  const isSource = type === "source";
  const isUpload = type === "upload";
  const effectiveUploadId = isSource ? source?.upload_id : uploadId;
  const effectivePageNumber = isSource ? source?.page_number : isUpload ? (pageNumber ?? 1) : pageNumber;

  const [currentPageNumber, setCurrentPageNumber] = useState<number | undefined>(effectivePageNumber);
  const isOnOriginalPage = currentPageNumber != null && currentPageNumber === effectivePageNumber;

  useEffect(() => {
    setCurrentPageNumber(effectivePageNumber);
  }, [open, effectivePageNumber]);

  const { data: pagesData } = usePages(open && effectiveUploadId ? effectiveUploadId : undefined, 1, 1);
  const totalPages = totalPagesProp ?? pagesData?.totalItems;

  const originalPageId = isSource || isUpload ? undefined : item?.page;
  const needsPageByNumber = isSource || isUpload || !isOnOriginalPage;
  const validPageNumber = currentPageNumber != null && currentPageNumber > 0;
  const { data: fetchedPage } = usePageByNumber(
    needsPageByNumber && validPageNumber && effectiveUploadId ? effectiveUploadId : "",
    needsPageByNumber && validPageNumber ? currentPageNumber : 0,
  );

  const activePageId = isSource || isUpload ? fetchedPage?.id : isOnOriginalPage ? originalPageId : fetchedPage?.id;
  const { data: markdown, isLoading } = usePageMarkdown(activePageId);

  const highlightRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlightRef.current) {
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [markdown, source?.text]);

  if (!isSource && !isUpload && !item) return null;
  if (isSource && !source) return null;

  const isHighlight = type === "highlight";
  const isNote = type === "note";
  const highlight = isHighlight ? (item as HighlightsRecord) : null;
  const note = isNote ? (item as NotesRecord) : null;

  const canNavigate = !!effectiveUploadId && totalPages != null && totalPages > 1;
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

    const markClass = "px-0.5 rounded bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200";

    if (isSource && isOnOriginalPage && source && source.text) {
      const chunkText = source.text.trim();
      if (!chunkText) return <span>{markdown}</span>;

      let index = -1;
      let matchLen = chunkText.length;

      index = markdown.indexOf(chunkText);

      if (index === -1 && chunkText.length > 100) {
        const shortChunk = chunkText.slice(0, 100);
        index = markdown.indexOf(shortChunk);
        if (index !== -1) {
          matchLen = Math.min(chunkText.length, markdown.length - index);
        }
      }

      if (index === -1) {
        const lowerMarkdown = markdown.toLowerCase();
        const lowerChunk = chunkText.toLowerCase();
        index = lowerMarkdown.indexOf(lowerChunk);
        if (index !== -1) matchLen = chunkText.length;
      }

      if (index === -1) {
        const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
        const normMarkdown = normalizeWs(markdown);
        const normChunk = normalizeWs(chunkText);
        const normIndex = normMarkdown.indexOf(normChunk);
        if (normIndex !== -1) {
          let origPos = 0;
          let normPos = 0;
          while (origPos < markdown.length && /\s/.test(markdown[origPos])) origPos++;
          while (normPos < normIndex && origPos < markdown.length) {
            if (/\s/.test(markdown[origPos])) {
              while (origPos < markdown.length && /\s/.test(markdown[origPos])) origPos++;
              normPos++;
            } else {
              origPos++;
              normPos++;
            }
          }
          index = origPos;
          let endNormPos = normPos;
          let endOrigPos = origPos;
          while (endNormPos < normIndex + normChunk.length && endOrigPos < markdown.length) {
            if (/\s/.test(markdown[endOrigPos])) {
              while (endOrigPos < markdown.length && /\s/.test(markdown[endOrigPos])) endOrigPos++;
              endNormPos++;
            } else {
              endOrigPos++;
              endNormPos++;
            }
          }
          matchLen = endOrigPos - origPos;
        }
      }

      if (index === -1) {
        const normalizeAll = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
        const normMarkdown = normalizeAll(markdown);
        const normChunk = normalizeAll(chunkText);
        const normIndex = normMarkdown.indexOf(normChunk);
        if (normIndex !== -1) {
          const mdLower = markdown.toLowerCase();
          let origPos = 0;
          let normPos = 0;
          while (origPos < mdLower.length && /\s/.test(mdLower[origPos])) origPos++;
          while (normPos < normIndex && origPos < mdLower.length) {
            if (/\s/.test(mdLower[origPos])) {
              while (origPos < mdLower.length && /\s/.test(mdLower[origPos])) origPos++;
              normPos++;
            } else {
              origPos++;
              normPos++;
            }
          }
          index = origPos;
          let endNormPos = normPos;
          let endOrigPos = origPos;
          while (endNormPos < normIndex + normChunk.length && endOrigPos < markdown.length) {
            if (/\s/.test(markdown[endOrigPos])) {
              while (endOrigPos < markdown.length && /\s/.test(markdown[endOrigPos])) endOrigPos++;
              endNormPos++;
            } else {
              endOrigPos++;
              endNormPos++;
            }
          }
          matchLen = endOrigPos - origPos;
        }
      }

      if (index !== -1 && matchLen > 0) {
        const before = markdown.slice(0, index);
        const highlighted = markdown.slice(index, index + matchLen);
        const after = markdown.slice(index + matchLen);
        return (
          <>
            <span>{before}</span>
            <mark ref={highlightRef} className={markClass}>
              {highlighted}
            </mark>
            <span>{after}</span>
          </>
        );
      }
    }

    if (isOnOriginalPage && highlight && highlight.start_offset !== undefined && highlight.end_offset !== undefined) {
      const before = markdown.slice(0, highlight.start_offset);
      const highlighted = markdown.slice(highlight.start_offset, highlight.end_offset);
      const after = markdown.slice(highlight.end_offset);

      return (
        <>
          <span>{before}</span>
          <mark className={cn("px-0.5 rounded", HIGHLIGHT_PREVIEW_CLASSES[highlight.color || HighlightsColorOptions.yellow])}>{highlighted}</mark>
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
            {isUpload ? (
              <>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="truncate">{uploadTitle || "Document"}</span>
              </>
            ) : isSource ? (
              <>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="truncate">{source?.title || "Document"}</span>
              </>
            ) : isHighlight ? (
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
                {(item as BookmarksRecord)?.comment || "Bookmark Preview"}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            {isSource && effectivePageNumber != null && (
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                Page {effectivePageNumber}
              </span>
            )}
            {isSource && source?.score != null && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {Math.round(source.score * 100)}% Match
              </Badge>
            )}
            {isUpload && effectivePageNumber != null && (
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                Page {effectivePageNumber}
              </span>
            )}
            {!isSource && !isUpload && <>Page {effectivePageNumber ?? "?"}</>}
          </DialogDescription>
        </DialogHeader>
        {isSource && source?.text && (
          <div className="shrink-0 mb-2">
            <div className="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <p className="text-sm font-medium italic">"{source.text.length > 300 ? source.text.slice(0, 300) + "\u2026" : source.text}"</p>
            </div>
          </div>
        )}
        {isHighlight && highlight && (
          <div className="shrink-0 mb-2">
            <div className={cn("p-3 rounded-lg", HIGHLIGHT_PREVIEW_CLASSES[highlight.color || HighlightsColorOptions.yellow])}>
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
        <DialogFooter className="shrink-0 flex items-center justify-between!">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canNavigate && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevPage} disabled={!canGoPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-20 text-center">
                {currentPageNumber ?? "?"} / {totalPages ?? "?"}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextPage} disabled={!canGoNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {(isSource && source?.upload_id) || (isUpload && effectiveUploadId) ? (
            <Button asChild className="gap-2">
              <Link
                to="/workspace"
                search={{ id: (isUpload ? effectiveUploadId : source?.upload_id)!, type: "upload" }}
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4" />
                Open in Reader
              </Link>
            </Button>
          ) : onNavigate ? (
            <Button onClick={onNavigate} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Go to page
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
