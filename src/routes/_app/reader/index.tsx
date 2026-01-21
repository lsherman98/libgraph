import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useInfinitePages, usePageMarkdown, usePages } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, ScrollText } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { Collections } from "@/lib/pocketbase-types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ReaderSearch = {
  uploadId?: string;
};

export const Route = createFileRoute("/_app/reader/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): ReaderSearch => {
    return {
      uploadId: search.uploadId as string | undefined,
    };
  },
});

function PageRenderer({ page, onInView }: { page: any; onInView?: (pageNumber: number) => void }) {
  const { data: markdown, isLoading } = usePageMarkdown(page.id);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onInView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onInView(page.page);
        }
      },
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [page.page, onInView]);

  return (
    <div ref={ref} className="mb-8 min-h-[500px]" id={`page-${page.page}`}>
      <div className="flex justify-between items-center mb-4 text-xs text-muted-foreground border-b pb-2">
        <span>Page {page.page}</span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading page content...</div>
      ) : (
        <pre className="whitespace-pre-wrap font-mono text-sm max-w-full overflow-x-auto">{markdown}</pre>
      )}
    </div>
  );
}

function ScrollReader({
  uploadId,
  startPage,
  onPageChange,
}: {
  uploadId: string;
  startPage: number;
  onPageChange: (page: number) => void;
}) {
  // We use infinite pages but we try to jump to startPage
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePages(uploadId, 5, 1);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const allPages = data?.pages.flatMap((p) => p.items) || [];

  // Auto-scroll and fetch logic
  useEffect(() => {
    if (!data) return;
    const lastLoadedPage = allPages[allPages.length - 1]?.page || 0;

    // If the target page (startPage) is beyond what we have, load more
    if (lastLoadedPage < startPage && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
      return;
    }

    // If we have the page, and we haven't done the initial scroll yet, do it.
    // We only auto-scroll on initial load to avoid hijacking user scroll later,
    // unless the user explicitly requested it via props (which we can't easily distinguish here
    // from a user just scrolling down and updating onPageChange).
    // ACTUALLY: The parent updates `startPage` when user scrolls (via onPageChange).
    // So `startPage` tracks view.
    // If user clicks "Next" in parent, `startPage` increments.
    // If `startPage` increments beyond view, we should scroll?
    // This circular dependency (Scroll -> onPageChange -> startPage -> Scroll) is dangerous.
    // We should treat `startPage` as "Initial Page" or "Target Page".
    // But for this simple implementation, let's stick to: only strict auto-scroll on initial load.
    // If user CLICKS next, the parent `navigatePage` function tries to scroll by ID.
    // If ID missing, we just need to ensure it gets loaded.

    if (!initialLoadDone && lastLoadedPage >= startPage) {
      setInitialLoadDone(true);
      setTimeout(() => {
        const el = document.getElementById(`page-${startPage}`);
        if (el) el.scrollIntoView();
      }, 100);
    } else if (!hasNextPage && !initialLoadDone) {
      setInitialLoadDone(true);
    }
  }, [data, hasNextPage, isFetchingNextPage, fetchNextPage, allPages, startPage, initialLoadDone]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading && !data) return <div className="p-6">Loading pages...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      {allPages.length === 0 ? (
        <div className="text-muted-foreground py-10 text-center">No pages found.</div>
      ) : (
        allPages.map((page) => <PageRenderer key={page.id} page={page} onInView={onPageChange} />)
      )}
      <div ref={observerTarget} className="py-4 text-center text-muted-foreground">
        {isFetchingNextPage ? "Loading more pages..." : hasNextPage ? "Load more" : "End of document"}
      </div>
    </div>
  );
}

function PaginatedReader({
  uploadId,
  currentPage,
  onPageChange,
  totalPages,
}: {
  uploadId: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}) {
  const { data, isLoading } = usePages(uploadId, currentPage, 1);
  const page = data?.items[0];

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex-1">
        {isLoading ? (
          <div className="p-6">Loading page...</div>
        ) : !page ? (
          <div className="p-6 text-center text-muted-foreground">Page not found</div>
        ) : (
          <PageRenderer page={page} />
        )}
      </div>

      {/* Pagination Controls embedded at bottom for convenience */}
      <div className="py-4 flex justify-between items-center border-t mt-4">
        <Button
          variant="outline"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <div className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </div>
        <Button
          variant="outline"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function RouteComponent() {
  const navigate = useNavigate();
  const { uploadId } = Route.useSearch();
  const [upload, setUpload] = useState<any>(null);

  // Local storage for current page and mode
  const pageStorageKey = `reader-page-${uploadId}`;
  const modeStorageKey = `reader-mode-${uploadId}`;

  const [currentPage, setCurrentPage] = useState<number>(() => {
    return parseInt(localStorage.getItem(pageStorageKey) || "1", 10);
  });

  const [mode, setMode] = useState<"scroll" | "paginate">(() => {
    return (localStorage.getItem(modeStorageKey) as "scroll" | "paginate") || "scroll";
  });

  // Need total pages info for header/validation
  // We can fetch just the first page to get total count
  const { data: firstPageData } = usePages(uploadId ?? null, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;

  useEffect(() => {
    if (uploadId) {
      pb.collection(Collections.Uploads)
        .getOne(uploadId, {
          expand: "author,topic,tags",
        })
        .then(setUpload)
        .catch(console.error);
    }
  }, [uploadId]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      localStorage.setItem(pageStorageKey, page.toString());
    },
    [pageStorageKey],
  );

  const handleModeChange = (val: string) => {
    if (!val) return;
    const newMode = val as "scroll" | "paginate";
    setMode(newMode);
    localStorage.setItem(modeStorageKey, newMode);
  };

  // Header Navigation (Shared)
  const navigatePage = (direction: "prev" | "next") => {
    let target = currentPage;
    if (direction === "prev") target = Math.max(1, currentPage - 1);
    if (direction === "next") target = Math.min(totalPages, currentPage + 1);

    if (target !== currentPage) {
      handlePageChange(target);
      if (mode === "scroll") {
        // For scroll mode, we might need to manually scroll if the list is long
        // But handlePageChange updates state which implementation uses to scroll?
        // The ScrollReader implementation watches for scroll events to update state.
        // Updating state manually SHOULD imply we want to go there.
        // But ScrollReader only auto-scrolls on mount.
        // Let's rely on standard ID scrolling
        const el = document.getElementById(`page-${target}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
        // If not loaded, ScrollReader would ideally handle it, but it's tricky.
        // Ideally we just update state and let user scroll or component react.
      }
    }
  };

  if (!uploadId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No document selected</p>
          <Button onClick={() => navigate({ to: "/documents" })}>Go to Documents</Button>
        </div>
      </div>
    );
  }

  if (!upload) {
    return <div className="p-6">Loading document...</div>;
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="p-6 border-b flex justify-between items-start bg-background z-10">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 pl-0" onClick={() => navigate({ to: "/documents" })}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
          <h1 className="text-2xl font-bold">{upload.title || "Untitled"}</h1>
          <div className="flex items-center gap-2 mt-2">
            <ToggleGroup type="single" value={mode} onValueChange={handleModeChange} size="sm" variant="outline">
              <ToggleGroupItem value="scroll" aria-label="Scroll Mode">
                <ScrollText className="h-4 w-4 mr-2" /> Scroll
              </ToggleGroupItem>
              <ToggleGroupItem value="paginate" aria-label="Pagination Mode">
                <FileText className="h-4 w-4 mr-2" /> Slide
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="h-4 w-px bg-border mx-2"></div>

            <Badge variant="outline">{upload.type}</Badge>
            <Badge
              variant={
                upload.status === "SUCCESS" ? "default" : upload.status === "PROCESSING" ? "secondary" : "destructive"
              }
            >
              {upload.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages || "?"}
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={currentPage <= 1} onClick={() => navigatePage("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => navigatePage("next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {mode === "scroll" ? (
          <ScrollReader uploadId={uploadId} startPage={currentPage} onPageChange={handlePageChange} />
        ) : (
          <PaginatedReader
            uploadId={uploadId}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            totalPages={totalPages}
          />
        )}
      </ScrollArea>
    </div>
  );
}
