import { useState, useEffect, useRef, useCallback } from "react";
import { useInfinitePages, usePageMarkdown, usePages, usePageHighlights, useBookmarks } from "@/lib/api/queries";
import {
  useCreateHighlight,
  useUpdateHighlight,
  useDeleteHighlight,
  useCreateBookmark,
  useUpdateBookmark,
  useDeleteBookmark,
} from "@/lib/api/mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { BookOpen, BookMarked, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { Collections, HighlightsColorOptions, BookmarksTypeOptions } from "@/lib/pocketbase-types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel, QuickFontSizeControl } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, useDebouncedCallback } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useReaderStore } from "@/lib/stores/reader-store";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { HighlightPopover, ExistingHighlightPopover, HighlightMark } from "@/components/reader/highlight-popover";
import { BookmarkButton } from "@/components/reader/bookmark-button";
import {
  injectHighlightsIntoMarkdown,
  toHighlightRanges,
  findTextOffset,
  getSelectionInfo,
  findHighlightElement,
  type SelectionInfo,
  type HighlightRange,
} from "@/lib/highlight-utils";

interface ReaderPaneProps {
  uploadId: string;
  tabId?: string;
  isActive?: boolean;
  showHeader?: boolean;
  onPageChange?: (page: number) => void;
  onTitleLoad?: (title: string) => void;
}

// MarkdownContent component for rendering page content with highlights and bookmarks
function MarkdownContent({
  content,
  isLoading,
  pageId,
  highlights = [],
  bookmarks = [],
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}: {
  content: string | null | undefined;
  isLoading: boolean;
  pageId?: string;
  highlights?: HighlightRange[];
  bookmarks?: { id: string; block_id: string; label?: string; type?: BookmarksTypeOptions; tags?: string[] }[];
  onCreateHighlight?: (data: {
    color: HighlightsColorOptions;
    text: string;
    note?: string;
    tags?: string[];
    start_offset: number;
    end_offset: number;
  }) => void;
  onUpdateHighlight?: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight?: (id: string) => void;
  onCreateBookmark?: (data: {
    block_id: string;
    label: string;
    type: BookmarksTypeOptions;
    tags?: string[];
    preview_text: string;
  }) => void;
  onUpdateBookmark?: (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => void;
  onDeleteBookmark?: (id: string) => void;
}) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{ element: HTMLElement; highlight: HighlightRange } | null>(
    null,
  );
  const [tempHighlight, setTempHighlight] = useState<HighlightRange | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tempHighlight) {
      window.getSelection()?.removeAllRanges();
    }
  }, [tempHighlight]);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) {
        return;
      }

      const highlightEl = findHighlightElement(e.target as HTMLElement);
      if (highlightEl) {
        const highlightId = highlightEl.dataset.highlightId;
        const highlight = highlights.find((h) => h.id === highlightId);
        if (highlight) {
          setActiveHighlight({
            element: highlightEl,
            highlight,
          });
          setSelection(null);
          setTempHighlight(null);
          return;
        }
      }

      requestAnimationFrame(() => {
        const selectionInfo = getSelectionInfo();
        if (selectionInfo && selectionInfo.text.length > 0) {
          setSelection(selectionInfo);
          setActiveHighlight(null);

          if (content) {
            const offsets = findTextOffset(content, selectionInfo.text);
            if (offsets) {
              setTempHighlight({
                id: "temp-selection",
                text: selectionInfo.text,
                color: HighlightsColorOptions.yellow,
                startOffset: offsets.start,
                endOffset: offsets.end,
              });
            } else {
              setTempHighlight(null);
            }
          }
        } else {
          setSelection(null);
          setTempHighlight(null);
        }
      });
    },
    [highlights, content],
  );

  const handleHighlight = useCallback(
    (color: HighlightsColorOptions, note?: string, tags?: string[]) => {
      if (!selection || !content || !onCreateHighlight) return;

      let startOffset, endOffset;
      if (tempHighlight && tempHighlight.text === selection.text) {
        startOffset = tempHighlight.startOffset;
        endOffset = tempHighlight.endOffset;
      } else {
        const offsets = findTextOffset(content, selection.text);
        if (!offsets) {
          console.warn("Could not find text offset for selection");
          return;
        }
        startOffset = offsets.start;
        endOffset = offsets.end;
      }

      onCreateHighlight({
        color,
        text: selection.text,
        note,
        tags,
        start_offset: startOffset,
        end_offset: endOffset,
      });

      setSelection(null);
      setTempHighlight(null);
      window.getSelection()?.removeAllRanges();
    },
    [selection, content, onCreateHighlight, tempHighlight],
  );

  const handleUpdateHighlightColor = useCallback(
    (color: HighlightsColorOptions) => {
      if (!activeHighlight || !onUpdateHighlight) return;
      onUpdateHighlight(activeHighlight.highlight.id, { color });
    },
    [activeHighlight, onUpdateHighlight],
  );

  const handleUpdateHighlightNote = useCallback(
    (note: string) => {
      if (!activeHighlight || !onUpdateHighlight) return;
      onUpdateHighlight(activeHighlight.highlight.id, { note });
    },
    [activeHighlight, onUpdateHighlight],
  );

  const handleUpdateHighlightTags = useCallback(
    (tags: string[]) => {
      if (!activeHighlight || !onUpdateHighlight) return;
      onUpdateHighlight(activeHighlight.highlight.id, { tags });
    },
    [activeHighlight, onUpdateHighlight],
  );

  const handleDeleteActiveHighlight = useCallback(() => {
    if (!activeHighlight || !onDeleteHighlight) return;
    onDeleteHighlight(activeHighlight.highlight.id);
    setActiveHighlight(null);
  }, [activeHighlight, onDeleteHighlight]);

  const getBlockId = useCallback(
    (node: any) => {
      if (!pageId || !node?.position?.start?.line) return undefined;
      return `${pageId}-L${node.position.start.line}`;
    },
    [pageId],
  );

  const isBlockBookmarked = useCallback(
    (blockId: string) => {
      return bookmarks.some((b) => b.block_id === blockId);
    },
    [bookmarks],
  );

  const getBookmarkForBlock = useCallback(
    (blockId: string) => {
      return bookmarks.find((b) => b.block_id === blockId);
    },
    [bookmarks],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <span className="text-sm opacity-60">Loading content...</span>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="opacity-60">No content available</span>
      </div>
    );
  }

  const allHighlights = tempHighlight ? [...highlights, tempHighlight] : highlights;
  const processedContent = injectHighlightsIntoMarkdown(content, allHighlights);

  return (
    <div className="reader-content relative" ref={contentRef} onMouseUp={handleMouseUp}>
      <Markdown
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            return (
              <h1 id={blockId} className="text-2xl font-bold mt-8 mb-4 first:mt-0 group relative">
                {blockId && onCreateBookmark && (
                  <BookmarkButton
                    isBookmarked={isBookmarked}
                    blockId={blockId}
                    previewText={typeof children === "string" ? children : String(children)}
                    bookmarkLabel={bookmark?.label}
                    bookmarkType={bookmark?.type}
                    bookmarkTags={bookmark?.tags}
                    onAddBookmark={(label, type, tags) =>
                      onCreateBookmark({
                        block_id: blockId,
                        label,
                        type,
                        tags,
                        preview_text:
                          typeof children === "string" ? children.slice(0, 150) : String(children).slice(0, 150),
                      })
                    }
                    onUpdateBookmark={(label, type, tags) =>
                      bookmark &&
                      onUpdateBookmark?.(bookmark.id, {
                        label,
                        type,
                        tags,
                      })
                    }
                    onRemoveBookmark={() => bookmark && onDeleteBookmark?.(bookmark.id)}
                    className="absolute -left-8 top-1"
                  />
                )}
                {children}
              </h1>
            );
          },
          h2: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            return (
              <h2 id={blockId} className="text-xl font-semibold mt-6 mb-3 group relative">
                {blockId && onCreateBookmark && (
                  <BookmarkButton
                    isBookmarked={isBookmarked}
                    blockId={blockId}
                    previewText={typeof children === "string" ? children : String(children)}
                    bookmarkLabel={bookmark?.label}
                    bookmarkType={bookmark?.type}
                    bookmarkTags={bookmark?.tags}
                    onAddBookmark={(label, type, tags) =>
                      onCreateBookmark({
                        block_id: blockId,
                        label,
                        type,
                        tags,
                        preview_text:
                          typeof children === "string" ? children.slice(0, 150) : String(children).slice(0, 150),
                      })
                    }
                    onUpdateBookmark={(label, type, tags) =>
                      bookmark &&
                      onUpdateBookmark?.(bookmark.id, {
                        label,
                        type,
                        tags,
                      })
                    }
                    onRemoveBookmark={() => bookmark && onDeleteBookmark?.(bookmark.id)}
                    className="absolute -left-8 top-0.5"
                  />
                )}
                {children}
              </h2>
            );
          },
          h3: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <h3 id={blockId} className="text-lg font-medium mt-5 mb-2">
                {children}
              </h3>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm max-w-full whitespace-pre-wrap wrap-break-word">
              {children}
            </pre>
          ),
          code: ({ children }) => <code>{children}</code>,
          blockquote: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <blockquote id={blockId} className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">
                {children}
              </blockquote>
            );
          },
          ul: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <ul id={blockId} className="my-4 pl-6 list-disc space-y-1">
                {children}
              </ul>
            );
          },
          ol: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <ol id={blockId} className="my-4 pl-6 list-decimal space-y-1">
                {children}
              </ol>
            );
          },
          li: ({ children }) => <li>{children}</li>,
          p: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            return (
              <p id={blockId} className="reader-paragraph group relative">
                {blockId && onCreateBookmark && (
                  <BookmarkButton
                    isBookmarked={isBookmarked}
                    blockId={blockId}
                    previewText={typeof children === "string" ? children : String(children)}
                    bookmarkLabel={bookmark?.label}
                    bookmarkType={bookmark?.type}
                    bookmarkTags={bookmark?.tags}
                    onAddBookmark={(label, type, tags) =>
                      onCreateBookmark({
                        block_id: blockId,
                        label,
                        type,
                        tags,
                        preview_text:
                          typeof children === "string" ? children.slice(0, 150) : String(children).slice(0, 150),
                      })
                    }
                    onUpdateBookmark={(label, type, tags) =>
                      bookmark &&
                      onUpdateBookmark?.(bookmark.id, {
                        label,
                        type,
                        tags,
                      })
                    }
                    onRemoveBookmark={() => bookmark && onDeleteBookmark?.(bookmark.id)}
                    className="absolute -left-8 top-0"
                  />
                )}
                {children}
              </p>
            );
          },
          mark: ({ node, children, ...props }) => {
            const highlightId = (props as any)["data-highlight-id"];
            const className = (props as any).className || "highlight-yellow";
            const highlight = highlights.find((h) => h.id === highlightId);
            return (
              <HighlightMark
                highlightId={highlightId}
                className={className}
                note={highlight?.note}
                tags={highlight?.tags}
              >
                {children}
              </HighlightMark>
            );
          },
        }}
      >
        {processedContent}
      </Markdown>

      <div ref={popoverRef}>
        {selection && (
          <HighlightPopover
            selectedText={selection.text}
            position={selection.position}
            selectionRange={selection.range}
            onHighlight={handleHighlight}
            onDismiss={() => setSelection(null)}
          />
        )}

        {activeHighlight && (
          <ExistingHighlightPopover
            highlightId={activeHighlight.highlight.id}
            color={activeHighlight.highlight.color}
            note={activeHighlight.highlight.note}
            tags={activeHighlight.highlight.tags}
            text={activeHighlight.highlight.text}
            position={{
              x:
                activeHighlight.element.getBoundingClientRect().left +
                activeHighlight.element.getBoundingClientRect().width / 2,
              y: activeHighlight.element.getBoundingClientRect().top - 10,
            }}
            onUpdateColor={handleUpdateHighlightColor}
            onUpdateNote={handleUpdateHighlightNote}
            onUpdateTags={handleUpdateHighlightTags}
            onDelete={handleDeleteActiveHighlight}
            onDismiss={() => setActiveHighlight(null)}
          />
        )}
      </div>
    </div>
  );
}

// ScrollPageRenderer for infinite scroll mode
function ScrollPageRenderer({
  page,
  onInView,
  showPageIndicator = true,
  bookmarks = [],
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}: {
  page: any;
  onInView?: (pageNumber: number) => void;
  showPageIndicator?: boolean;
  bookmarks?: { id: string; block_id: string; label?: string; type?: BookmarksTypeOptions; tags?: string[] }[];
  onCreateHighlight?: (
    pageId: string,
    data: {
      color: HighlightsColorOptions;
      text: string;
      note?: string;
      tags?: string[];
      start_offset: number;
      end_offset: number;
    },
  ) => void;
  onUpdateHighlight?: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight?: (id: string) => void;
  onCreateBookmark?: (
    pageId: string,
    pageNumber: number,
    data: { block_id: string; label: string; type: BookmarksTypeOptions; tags?: string[]; preview_text: string },
  ) => void;
  onUpdateBookmark?: (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => void;
  onDeleteBookmark?: (id: string) => void;
}) {
  const { data: markdown, isLoading } = usePageMarkdown(page.id);
  const { data: pageHighlights = [] } = usePageHighlights(page.id);
  const ref = useRef<HTMLDivElement>(null);
  const hasReportedRef = useRef(false);

  const highlightRanges = toHighlightRanges(pageHighlights);
  const pageBookmarks = bookmarks.filter((b) => b.block_id?.startsWith(page.id));

  useEffect(() => {
    if (!onInView) return;

    hasReportedRef.current = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !hasReportedRef.current) {
          hasReportedRef.current = true;
          onInView(page.page);
        } else if (!entry.isIntersecting) {
          hasReportedRef.current = false;
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [page.page, onInView]);

  return (
    <article ref={ref} className="reader-page scroll-mt-4" id={`page-${page.page}`}>
      {showPageIndicator && (
        <div className="flex items-center justify-center py-4 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 text-xs font-medium opacity-60">
            <BookOpen className="h-3 w-3" />
            Page {page.page}
          </div>
        </div>
      )}
      <MarkdownContent
        content={markdown}
        isLoading={isLoading}
        pageId={page.id}
        highlights={highlightRanges}
        bookmarks={pageBookmarks}
        onCreateHighlight={onCreateHighlight ? (data) => onCreateHighlight(page.id, data) : undefined}
        onUpdateHighlight={onUpdateHighlight}
        onDeleteHighlight={onDeleteHighlight}
        onCreateBookmark={onCreateBookmark ? (data) => onCreateBookmark(page.id, page.page, data) : undefined}
        onUpdateBookmark={onUpdateBookmark}
        onDeleteBookmark={onDeleteBookmark}
      />
    </article>
  );
}

// ScrollReader component for infinite scroll mode
function ScrollReader({
  uploadId,
  startPage,
  onPageChange,
  bookmarks,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}: {
  uploadId: string;
  startPage: number;
  onPageChange: (page: number) => void;
  bookmarks: { id: string; block_id: string; label?: string; type?: BookmarksTypeOptions; tags?: string[] }[];
  onCreateHighlight: (
    pageId: string,
    data: {
      color: HighlightsColorOptions;
      text: string;
      note?: string;
      tags?: string[];
      start_offset: number;
      end_offset: number;
    },
  ) => void;
  onUpdateHighlight: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight: (id: string) => void;
  onCreateBookmark: (
    pageId: string,
    pageNumber: number,
    data: { block_id: string; label: string; type: BookmarksTypeOptions; tags?: string[]; preview_text: string },
  ) => void;
  onUpdateBookmark: (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => void;
  onDeleteBookmark: (id: string) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePages(uploadId, 5, 1);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const currentVisiblePageRef = useRef(startPage);

  const allPages = data?.pages.flatMap((p) => p.items) || [];

  const debouncedPageChange = useDebouncedCallback((page: number) => {
    if (page !== currentVisiblePageRef.current) {
      currentVisiblePageRef.current = page;
      onPageChange(page);
    }
  }, 150);

  useEffect(() => {
    if (!data) return;
    const lastLoadedPage = allPages[allPages.length - 1]?.page || 0;

    if (lastLoadedPage < startPage && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
      return;
    }

    if (!initialLoadDone && lastLoadedPage >= startPage) {
      setInitialLoadDone(true);
      setTimeout(() => {
        const el = document.getElementById(`page-${startPage}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } else if (!hasNextPage && !initialLoadDone) {
      setInitialLoadDone(true);
    }
  }, [data, hasNextPage, isFetchingNextPage, fetchNextPage, allPages, startPage, initialLoadDone]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "200px" },
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <span className="text-sm opacity-60">Loading document...</span>
        </div>
      </div>
    );
  }

  if (allPages.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <BookOpen className="h-12 w-12 mx-auto opacity-20 mb-4" />
          <p className="opacity-60">No pages found in this document.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {allPages.map((page) => (
        <ScrollPageRenderer
          key={page.id}
          page={page}
          onInView={debouncedPageChange}
          bookmarks={bookmarks}
          onCreateHighlight={onCreateHighlight}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={onDeleteHighlight}
          onCreateBookmark={onCreateBookmark}
          onUpdateBookmark={onUpdateBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
      ))}
      <div ref={observerTarget} className="py-8 flex items-center justify-center">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-sm opacity-60">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading more...
          </div>
        ) : hasNextPage ? (
          <Button variant="ghost" onClick={() => fetchNextPage()}>
            Load more pages
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="h-px w-16 bg-current opacity-20" />
            <span className="text-sm opacity-40">End of document</span>
          </div>
        )}
      </div>
    </div>
  );
}

// PaginatedPageContent for single page rendering
function PaginatedPageContent({
  pageId,
  pageNumber,
  bookmarks,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}: {
  pageId: string;
  pageNumber: number;
  bookmarks: { id: string; block_id: string; label?: string; type?: BookmarksTypeOptions; tags?: string[] }[];
  onCreateHighlight: (
    pageId: string,
    data: {
      color: HighlightsColorOptions;
      text: string;
      note?: string;
      tags?: string[];
      start_offset: number;
      end_offset: number;
    },
  ) => void;
  onUpdateHighlight: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight: (id: string) => void;
  onCreateBookmark: (
    pageId: string,
    pageNumber: number,
    data: { block_id: string; label: string; type: BookmarksTypeOptions; tags?: string[]; preview_text: string },
  ) => void;
  onUpdateBookmark: (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => void;
  onDeleteBookmark: (id: string) => void;
}) {
  const { data: markdown, isLoading } = usePageMarkdown(pageId);
  const { data: pageHighlights = [] } = usePageHighlights(pageId);

  const highlightRanges = toHighlightRanges(pageHighlights);
  const pageBookmarks = bookmarks.filter((b) => b.block_id?.startsWith(pageId));

  return (
    <MarkdownContent
      content={markdown}
      isLoading={isLoading}
      pageId={pageId}
      highlights={highlightRanges}
      bookmarks={pageBookmarks}
      onCreateHighlight={(data) => onCreateHighlight(pageId, data)}
      onUpdateHighlight={onUpdateHighlight}
      onDeleteHighlight={onDeleteHighlight}
      onCreateBookmark={(data) => onCreateBookmark(pageId, pageNumber, data)}
      onUpdateBookmark={onUpdateBookmark}
      onDeleteBookmark={onDeleteBookmark}
    />
  );
}

// PaginatedReader component for single page mode
function PaginatedReader({
  uploadId,
  currentPage,
  onPageChange,
  totalPages,
  bookmarks,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}: {
  uploadId: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  bookmarks: { id: string; block_id: string; label?: string; type?: BookmarksTypeOptions; tags?: string[] }[];
  onCreateHighlight: (
    pageId: string,
    data: {
      color: HighlightsColorOptions;
      text: string;
      note?: string;
      tags?: string[];
      start_offset: number;
      end_offset: number;
    },
  ) => void;
  onUpdateHighlight: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight: (id: string) => void;
  onCreateBookmark: (
    pageId: string,
    pageNumber: number,
    data: { block_id: string; label: string; type: BookmarksTypeOptions; tags?: string[]; preview_text: string },
  ) => void;
  onUpdateBookmark: (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => void;
  onDeleteBookmark: (id: string) => void;
}) {
  const { data, isLoading } = usePages(uploadId, currentPage, 1);

  usePages(uploadId, Math.max(1, currentPage - 1), 1);
  usePages(uploadId, Math.min(totalPages, currentPage + 1), 1);

  const page = data?.items[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        onPageChange(Math.max(1, currentPage - 1));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        onPageChange(Math.min(totalPages, currentPage + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        onPageChange(1);
      } else if (e.key === "End") {
        e.preventDefault();
        onPageChange(totalPages);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, totalPages, onPageChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <span className="text-sm opacity-60">Loading page...</span>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="opacity-60">Page not found</p>
      </div>
    );
  }

  return (
    <PaginatedPageContent
      pageId={page.id}
      pageNumber={page.page}
      bookmarks={bookmarks}
      onCreateHighlight={onCreateHighlight}
      onUpdateHighlight={onUpdateHighlight}
      onDeleteHighlight={onDeleteHighlight}
      onCreateBookmark={onCreateBookmark}
      onUpdateBookmark={onUpdateBookmark}
      onDeleteBookmark={onDeleteBookmark}
    />
  );
}

// Main ReaderPane component
export function ReaderPane({
  uploadId,
  tabId,
  isActive = true,
  showHeader = true,
  onPageChange,
  onTitleLoad,
}: ReaderPaneProps) {
  const [upload, setUpload] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isReadingMode, setReadingMode, setCurrentPageState, setNavigateToPage } = useReaderStore();
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const { setOpen, setOpenRight, open: leftSidebarOpen, openRight: rightSidebarOpen } = useSidebar();
  const previousSidebarState = useRef({ left: true, right: true });
  const { settings, setSettings, applyTheme, resetSettings, cssVariables } = useReaderSettings();
  const { pageSettings, setCurrentPage } = usePageSettings(uploadId);

  const { data: firstPageData } = usePages(uploadId ?? null, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;

  const { data: currentPageData } = usePages(uploadId ?? null, pageSettings.currentPage, 1);
  const currentPageId = currentPageData?.items[0]?.id ?? null;

  const setCurrentPageRef = useRef(setCurrentPage);
  const viewModeRef = useRef(settings.viewMode);
  setCurrentPageRef.current = setCurrentPage;
  viewModeRef.current = settings.viewMode;

  // Sync current page state to store for annotations panel (only when active)
  useEffect(() => {
    if (isActive) {
      setCurrentPageState(currentPageId, pageSettings.currentPage);
    }
  }, [currentPageId, pageSettings.currentPage, setCurrentPageState, isActive]);

  const navigateToPageFromAnnotation = useCallback((pageNumber: number, _blockId?: string) => {
    setCurrentPageRef.current(pageNumber);
    if (viewModeRef.current === "scroll") {
      setTimeout(() => {
        const el = document.getElementById(`page-${pageNumber}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      setNavigateToPage(navigateToPageFromAnnotation);
      return () => setNavigateToPage(null);
    }
  }, [navigateToPageFromAnnotation, setNavigateToPage, isActive]);

  // Highlights and bookmarks
  const { data: bookmarksData = [] } = useBookmarks(uploadId ?? null);
  const createHighlightMutation = useCreateHighlight();
  const updateHighlightMutation = useUpdateHighlight();
  const deleteHighlightMutation = useDeleteHighlight();
  const createBookmarkMutation = useCreateBookmark();
  const updateBookmarkMutation = useUpdateBookmark();
  const deleteBookmarkMutation = useDeleteBookmark();

  const bookmarks = bookmarksData.map((b) => ({
    id: b.id,
    block_id: b.block_id,
    label: b.label || "",
    type: b.type as BookmarksTypeOptions,
    tags: b.tags || [],
  }));

  // Highlight handlers
  const handleCreateHighlight = useCallback(
    (
      pageId: string,
      data: {
        color: HighlightsColorOptions;
        text: string;
        note?: string;
        tags?: string[];
        start_offset: number;
        end_offset: number;
      },
    ) => {
      if (!uploadId) return;
      createHighlightMutation.mutate({
        upload: uploadId,
        page: pageId,
        color: data.color,
        text: data.text,
        note: data.note,
        tags: data.tags,
        start_offset: data.start_offset,
        end_offset: data.end_offset,
      });
    },
    [uploadId, createHighlightMutation],
  );

  const handleUpdateHighlight = useCallback(
    (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => {
      updateHighlightMutation.mutate({ id, data });
    },
    [updateHighlightMutation],
  );

  const handleDeleteHighlight = useCallback(
    (id: string) => {
      deleteHighlightMutation.mutate(id);
    },
    [deleteHighlightMutation],
  );

  // Bookmark handlers
  const handleCreateBookmark = useCallback(
    (
      pageId: string,
      pageNumber: number,
      data: { block_id: string; label: string; type: BookmarksTypeOptions; tags?: string[]; preview_text: string },
    ) => {
      if (!uploadId) return;
      createBookmarkMutation.mutate({
        upload: uploadId,
        page: pageId,
        page_number: pageNumber,
        block_id: data.block_id,
        label: data.label,
        type: data.type,
        tags: data.tags,
        preview_text: data.preview_text,
      });
    },
    [uploadId, createBookmarkMutation],
  );

  const handleUpdateBookmark = useCallback(
    (id: string, data: { label?: string; type?: BookmarksTypeOptions; tags?: string[] }) => {
      updateBookmarkMutation.mutate({ id, data });
    },
    [updateBookmarkMutation],
  );

  const handleDeleteBookmark = useCallback(
    (id: string) => {
      deleteBookmarkMutation.mutate(id);
    },
    [deleteBookmarkMutation],
  );

  const onTitleLoadRef = useRef(onTitleLoad);
  onTitleLoadRef.current = onTitleLoad;

  useEffect(() => {
    if (uploadId) {
      pb.collection(Collections.Uploads)
        .getOne(uploadId, {
          expand: "author,topic,tags",
        })
        .then((data) => {
          setUpload(data);
          onTitleLoadRef.current?.(data.title || "Untitled");
        })
        .catch(console.error);
    }
  }, [uploadId]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      onPageChange?.(page);
    },
    [setCurrentPage, onPageChange],
  );

  const toggleScrollMode = (enabled: boolean) => {
    setSettings({ viewMode: enabled ? "scroll" : "paginate" });
  };

  const toggleReadingMode = () => {
    if (!isReadingMode) {
      previousSidebarState.current = { left: leftSidebarOpen, right: rightSidebarOpen };
      setOpen(false);
      setOpenRight(false);
    } else {
      setOpen(previousSidebarState.current.left);
      setOpenRight(previousSidebarState.current.right);
    }
    setReadingMode(!isReadingMode);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      readerContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const navigatePage = (direction: "prev" | "next") => {
    let target = pageSettings.currentPage;
    if (direction === "prev") target = Math.max(1, pageSettings.currentPage - 1);
    if (direction === "next") target = Math.min(totalPages, pageSettings.currentPage + 1);

    if (target !== pageSettings.currentPage) {
      handlePageChange(target);
      if (settings.viewMode === "scroll") {
        const el = document.getElementById(`page-${target}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  };

  if (!upload) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading document...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={readerContainerRef}
      className={cn(
        "h-full w-full flex flex-col transition-colors duration-300 overflow-hidden",
        (isFullscreen || isReadingMode) && "bg-(--reader-bg-color)",
      )}
      style={cssVariables}
    >
      {showHeader && (
        <header
          className={cn(
            "shrink-0 border-b z-20 transition-colors duration-300",
            isReadingMode
              ? "bg-(--reader-bg-color) border-(--reader-text-color)/10"
              : "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
          style={isReadingMode ? { color: settings.textColor } : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-3 min-w-0 shrink">
              <div className="hidden sm:block min-w-0">
                <h1 className="text-sm font-semibold truncate max-w-30 md:max-w-45 lg:max-w-62">
                  {upload.title || "Untitled"}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs">
                    {upload.type}
                  </Badge>
                  {totalPages > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{totalPages} pages</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pageSettings.currentPage <= 1}
                  onClick={() => navigatePage("prev")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5 px-1">
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageSettings.currentPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value, 10);
                      if (page >= 1 && page <= totalPages) {
                        handlePageChange(page);
                        if (settings.viewMode === "scroll") {
                          setTimeout(() => {
                            const el = document.getElementById(`page-${page}`);
                            if (el) {
                              el.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }
                          }, 50);
                        }
                      }
                    }}
                    className="w-12 h-7 text-center text-sm"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">/ {totalPages || "–"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pageSettings.currentPage >= totalPages}
                  onClick={() => navigatePage("next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="hidden xl:flex items-center gap-2 px-2 border-r">
                <Label htmlFor={`scroll-mode-${tabId}`} className="text-xs cursor-pointer whitespace-nowrap">
                  Scroll
                </Label>
                <Switch
                  id={`scroll-mode-${tabId}`}
                  checked={settings.viewMode === "scroll"}
                  onCheckedChange={toggleScrollMode}
                />
              </div>
              <div className="hidden xl:flex items-center gap-1 px-2 border-r">
                <QuickFontSizeControl fontSize={settings.fontSize} onChange={(fontSize) => setSettings({ fontSize })} />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isReadingMode ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={toggleReadingMode}
                  >
                    <BookMarked className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isReadingMode ? "Exit Reading Mode" : "Reading Mode"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
              </Tooltip>
              <ReaderSettingsPanel
                settings={settings}
                onSettingsChange={setSettings}
                onApplyTheme={applyTheme}
                onReset={resetSettings}
              />
            </div>
          </div>
          <div className={cn("h-0.5", isReadingMode ? "bg-(--reader-text-color)/10" : "bg-muted")}>
            <div
              className={cn(
                "h-full transition-all duration-300",
                isReadingMode ? "bg-(--reader-text-color)/30" : "bg-primary/50",
              )}
              style={{
                width: `${(pageSettings.currentPage / (totalPages || 1)) * 100}%`,
              }}
            />
          </div>
        </header>
      )}
      <main
        className="flex-1 min-h-0 overflow-hidden transition-colors duration-300"
        style={{
          backgroundColor: settings.backgroundColor,
          color: settings.textColor,
        }}
      >
        <ScrollArea className="h-full w-full">
          <div className="w-full max-w-full overflow-hidden">
            <div
              className="mx-auto px-4 sm:pl-10 sm:pr-6 py-6 sm:py-8 max-w-4xl wrap-break-word overflow-wrap-anywhere"
              style={{
                fontFamily: FONT_FAMILIES[settings.fontFamily].value,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                letterSpacing: `${settings.letterSpacing}em`,
                textAlign: settings.textAlign,
                hyphens: settings.hyphenation ? "auto" : "manual",
                WebkitHyphens: settings.hyphenation ? "auto" : "manual",
              }}
            >
              <style>{`
                .reader-paragraph {
                  margin-bottom: ${settings.paragraphSpacing}em;
                }
                .reader-paragraph:last-child {
                  margin-bottom: 0;
                }
                .reader-page + .reader-page {
                  padding-top: 2rem;
                  border-top: 1px solid currentColor;
                  border-top-color: color-mix(in srgb, currentColor 10%, transparent);
                }
              `}</style>
              {settings.viewMode === "scroll" ? (
                <ScrollReader
                  uploadId={uploadId}
                  startPage={pageSettings.currentPage}
                  onPageChange={handlePageChange}
                  bookmarks={bookmarks}
                  onCreateHighlight={handleCreateHighlight}
                  onUpdateHighlight={handleUpdateHighlight}
                  onDeleteHighlight={handleDeleteHighlight}
                  onCreateBookmark={handleCreateBookmark}
                  onUpdateBookmark={handleUpdateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                />
              ) : (
                <PaginatedReader
                  uploadId={uploadId}
                  currentPage={pageSettings.currentPage}
                  onPageChange={handlePageChange}
                  totalPages={totalPages}
                  bookmarks={bookmarks}
                  onCreateHighlight={handleCreateHighlight}
                  onUpdateHighlight={handleUpdateHighlight}
                  onDeleteHighlight={handleDeleteHighlight}
                  onCreateBookmark={handleCreateBookmark}
                  onUpdateBookmark={handleUpdateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                />
              )}
            </div>
          </div>
        </ScrollArea>
      </main>
      {settings.viewMode === "paginate" && (
        <footer
          className={cn(
            "shrink-0 border-t px-2 sm:px-4 py-2 transition-colors duration-300",
            isReadingMode
              ? "bg-(--reader-bg-color) border-(--reader-text-color)/10"
              : "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
          style={isReadingMode ? { color: settings.textColor } : undefined}
        >
          <div className="flex items-center justify-between gap-1 max-w-3xl mx-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigatePage("prev")}
              disabled={pageSettings.currentPage <= 1}
              className="gap-1 px-2 sm:px-3"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="hidden sm:inline text-sm opacity-60">Page</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={pageSettings.currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value, 10);
                  if (page >= 1 && page <= totalPages) {
                    handlePageChange(page);
                  }
                }}
                className="w-12 sm:w-16 h-8 sm:h-9 text-center text-sm"
              />
              <span className="text-sm opacity-60 whitespace-nowrap">of {totalPages}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigatePage("next")}
              disabled={pageSettings.currentPage >= totalPages}
              className="gap-1 px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
