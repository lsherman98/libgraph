import { useEffect } from "react";
import { usePages, usePageMarkdown, usePageHighlights } from "@/lib/api/queries";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { MarkdownContent } from "@/components/reader/markdown-content";

function PaginatedPageContent({
  pageId,
  pageNumber,
  bookmarks,
  notes,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  pageId: string;
  pageNumber: number;
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
  const { data: markdown, isLoading } = usePageMarkdown(pageId);
  const { data: pageHighlights = [] } = usePageHighlights(pageId);

  const highlightRanges = pageHighlights;
  const pageBookmarks = bookmarks.filter((b) => b.block_id?.startsWith(pageId));
  const pageNotes = notes.filter((n) => n.block_id?.startsWith(pageId));

  return (
    <div id={`page-${pageNumber}`} className="reader-page">
      <MarkdownContent
        content={markdown}
        isLoading={isLoading}
        pageId={pageId}
        pageNumber={pageNumber}
        highlights={highlightRanges}
        bookmarks={pageBookmarks}
        notes={pageNotes}
        onCreateHighlight={(data) => onCreateHighlight(pageId, data)}
        onUpdateHighlight={onUpdateHighlight}
        onDeleteHighlight={onDeleteHighlight}
      />
    </div>
  );
}

export function PaginatedReader({
  uploadId,
  currentPage,
  onPageChange,
  totalPages,
  bookmarks,
  notes,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  uploadId: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
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
      notes={notes}
      onCreateHighlight={onCreateHighlight}
      onUpdateHighlight={onUpdateHighlight}
      onDeleteHighlight={onDeleteHighlight}
    />
  );
}
