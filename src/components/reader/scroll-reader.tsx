import { useState, useEffect, useRef } from "react";
import { useInfinitePages, usePageMarkdown, usePageHighlights } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useDebouncedCallback } from "@/lib/utils";
import { MarkdownContent } from "@/components/reader/markdown-content";

function ScrollPageRenderer({
  page,
  onInView,
  showPageIndicator = true,
  bookmarks = [],
  notes = [],
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  page: any;
  onInView?: (pageNumber: number) => void;
  showPageIndicator?: boolean;
  bookmarks?: { id: string; block_id: string; comment?: string; tags?: string[] }[];
  notes?: { id: string; block_id: string; content?: string; tags?: string[] }[];
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
}) {
  const { data: markdown, isLoading } = usePageMarkdown(page.id);
  const { data: pageHighlights = [] } = usePageHighlights(page.id);
  const ref = useRef<HTMLDivElement>(null);
  const hasReportedRef = useRef(false);

  const highlightRanges = pageHighlights;
  const pageBookmarks = bookmarks.filter((b) => b.block_id?.startsWith(page.id));
  const pageNotes = notes.filter((n) => n.block_id?.startsWith(page.id));

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
        pageNumber={page.page}
        highlights={highlightRanges}
        bookmarks={pageBookmarks}
        notes={pageNotes}
        onCreateHighlight={onCreateHighlight ? (data) => onCreateHighlight(page.id, data) : undefined}
        onUpdateHighlight={onUpdateHighlight}
        onDeleteHighlight={onDeleteHighlight}
      />
    </article>
  );
}

export function ScrollReader({
  uploadId,
  startPage,
  onPageChange,
  bookmarks,
  notes,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  uploadId: string;
  startPage: number;
  onPageChange: (page: number) => void;
  bookmarks: { id: string; block_id: string; comment?: string; tags?: string[] }[];
  notes: { id: string; block_id: string; content?: string; tags?: string[] }[];
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
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePages(uploadId, 5, 1);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const currentVisiblePageRef = useRef(startPage);

  const allPages = data?.pages.flatMap((p) => p?.items) || [];

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
          key={page?.id}
          page={page}
          onInView={debouncedPageChange}
          bookmarks={bookmarks}
          notes={notes}
          onCreateHighlight={onCreateHighlight}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={onDeleteHighlight}
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
