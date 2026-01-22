import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useInfinitePages, usePageMarkdown, usePages } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  ScrollText,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { Collections } from "@/lib/pocketbase-types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel, QuickFontSizeControl } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Debounce helper
function useDebouncedCallback<T extends (...args: any[]) => void>(callback: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay],
  );
}

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

// Markdown content renderer with proper styling
function MarkdownContent({ content, isLoading }: { content: string | null | undefined; isLoading: boolean }) {
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

  // Split content into paragraphs and render
  const paragraphs = content.split(/\n\n+/);

  return (
    <div className="reader-content">
      {paragraphs.map((paragraph, index) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        // Check for headings
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={index} className="text-2xl font-bold mt-8 mb-4 first:mt-0">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="text-xl font-semibold mt-6 mb-3">
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={index} className="text-lg font-medium mt-5 mb-2">
              {trimmed.slice(4)}
            </h3>
          );
        }

        // Check for code blocks
        if (trimmed.startsWith("```")) {
          const lines = trimmed.split("\n");
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre
              key={index}
              className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm"
            >
              <code>{code}</code>
            </pre>
          );
        }

        // Check for blockquotes
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={index} className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">
              {trimmed.slice(2)}
            </blockquote>
          );
        }

        // Check for lists
        if (trimmed.match(/^[-*]\s/)) {
          const items = trimmed.split(/\n/).filter((line) => line.trim());
          return (
            <ul key={index} className="my-4 pl-6 list-disc space-y-1">
              {items.map((item, i) => (
                <li key={i}>{item.replace(/^[-*]\s/, "")}</li>
              ))}
            </ul>
          );
        }

        if (trimmed.match(/^\d+\.\s/)) {
          const items = trimmed.split(/\n/).filter((line) => line.trim());
          return (
            <ol key={index} className="my-4 pl-6 list-decimal space-y-1">
              {items.map((item, i) => (
                <li key={i}>{item.replace(/^\d+\.\s/, "")}</li>
              ))}
            </ol>
          );
        }

        // Regular paragraph
        return (
          <p key={index} className="reader-paragraph">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

// Page component for scroll mode
function ScrollPageRenderer({
  page,
  onInView,
  showPageIndicator = true,
}: {
  page: any;
  onInView?: (pageNumber: number) => void;
  showPageIndicator?: boolean;
}) {
  const { data: markdown, isLoading } = usePageMarkdown(page.id);
  const ref = useRef<HTMLDivElement>(null);
  const hasReportedRef = useRef(false);

  useEffect(() => {
    if (!onInView) return;

    // Reset reported status when page changes
    hasReportedRef.current = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only report when becoming visible and at a significant threshold
        // and only report once per scroll direction change
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !hasReportedRef.current) {
          hasReportedRef.current = true;
          onInView(page.page);
        } else if (!entry.isIntersecting) {
          // Reset when page leaves view
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
      <MarkdownContent content={markdown} isLoading={isLoading} />
    </article>
  );
}

// Infinite scroll reader
function ScrollReader({
  uploadId,
  startPage,
  onPageChange,
}: {
  uploadId: string;
  startPage: number;
  onPageChange: (page: number) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePages(uploadId, 5, 1);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const currentVisiblePageRef = useRef(startPage);

  const allPages = data?.pages.flatMap((p) => p.items) || [];

  // Debounced page change to prevent flickering
  const debouncedPageChange = useDebouncedCallback((page: number) => {
    if (page !== currentVisiblePageRef.current) {
      currentVisiblePageRef.current = page;
      onPageChange(page);
    }
  }, 150);

  // Handle initial scroll to startPage
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

  // Infinite scroll observer
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
        <ScrollPageRenderer key={page.id} page={page} onInView={debouncedPageChange} />
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

// Paginated reader (single page at a time)
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

  // Prefetch adjacent pages
  usePages(uploadId, Math.max(1, currentPage - 1), 1);
  usePages(uploadId, Math.min(totalPages, currentPage + 1), 1);

  const page = data?.items[0];

  // Keyboard navigation
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

  return (
    <div className="flex flex-col min-h-full">
      {/* Page content */}
      <div className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
              <span className="text-sm opacity-60">Loading page...</span>
            </div>
          </div>
        ) : !page ? (
          <div className="flex items-center justify-center py-16">
            <p className="opacity-60">Page not found</p>
          </div>
        ) : (
          <PaginatedPageContent pageId={page.id} />
        )}
      </div>

      {/* Bottom pagination */}
      <div className="flex-shrink-0 border-t mt-8 pt-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-sm opacity-60">Page</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value, 10);
                if (page >= 1 && page <= totalPages) {
                  onPageChange(page);
                }
              }}
              className="w-16 h-9 text-center"
            />
            <span className="text-sm opacity-60">of {totalPages}</span>
          </div>

          <Button
            variant="ghost"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-current opacity-30 transition-all duration-300"
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Paginated reader inner content (for markdown fetching)
function PaginatedPageContent({ pageId }: { pageId: string }) {
  const { data: markdown, isLoading } = usePageMarkdown(pageId);
  return <MarkdownContent content={markdown} isLoading={isLoading} />;
}

// Main reader component
function RouteComponent() {
  const navigate = useNavigate();
  const { uploadId } = Route.useSearch();
  const [upload, setUpload] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const readerContainerRef = useRef<HTMLDivElement>(null);

  // Use our new hooks
  const { settings, setSettings, applyTheme, resetSettings, cssVariables } = useReaderSettings();
  const { pageSettings, setCurrentPage } = usePageSettings(uploadId);

  // Get total pages
  const { data: firstPageData } = usePages(uploadId ?? null, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;

  // Load document info
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
    },
    [setCurrentPage],
  );

  const handleModeChange = (value: string) => {
    if (!value) return;
    setSettings({ viewMode: value as "scroll" | "paginate" });
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

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Handle navigation with keyboard in scroll mode
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

  // No upload selected state
  if (!uploadId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <h2 className="text-xl font-semibold mb-2">No Document Selected</h2>
          <p className="text-muted-foreground mb-6">Select a document from your library to start reading.</p>
          <Button onClick={() => navigate({ to: "/documents" })}>Browse Documents</Button>
        </div>
      </div>
    );
  }

  // Loading state
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
    <TooltipProvider>
      <div
        ref={readerContainerRef}
        className={cn("h-full flex flex-col", isFullscreen && "bg-[var(--reader-bg-color)]")}
        style={cssVariables}
      >
        {/* Header */}
        <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-20">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left section */}
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/documents" })} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>

              <div className="hidden md:block">
                <h1 className="text-sm font-semibold line-clamp-1 max-w-[300px]">{upload.title || "Untitled"}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs">
                    {upload.type}
                  </Badge>
                  {totalPages > 0 && <span className="text-xs text-muted-foreground">{totalPages} pages</span>}
                </div>
              </div>
            </div>

            {/* Center section - View mode & Page navigation */}
            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <ToggleGroup type="single" value={settings.viewMode} onValueChange={handleModeChange} size="sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="scroll" aria-label="Scroll Mode">
                      <ScrollText className="h-4 w-4" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>Infinite Scroll</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="paginate" aria-label="Page Mode">
                      <FileText className="h-4 w-4" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>Page by Page</TooltipContent>
                </Tooltip>
              </ToggleGroup>

              {/* Page navigation */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={pageSettings.currentPage <= 1}
                  onClick={() => navigatePage("prev")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5 px-2">
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
                    className="w-14 h-8 text-center text-sm"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">/ {totalPages || "–"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={pageSettings.currentPage >= totalPages}
                  onClick={() => navigatePage("next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right section - Quick controls & Settings */}
            <div className="flex items-center gap-2">
              {/* Quick font size */}
              <div className="hidden lg:flex items-center gap-1 px-2 border-r">
                <QuickFontSizeControl fontSize={settings.fontSize} onChange={(fontSize) => setSettings({ fontSize })} />
              </div>

              {/* Fullscreen toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
              </Tooltip>

              {/* Settings panel */}
              <ReaderSettingsPanel
                settings={settings}
                onSettingsChange={setSettings}
                onApplyTheme={applyTheme}
                onReset={resetSettings}
              />
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-muted">
            <div
              className="h-full bg-primary/50 transition-all duration-300"
              style={{
                width: `${(pageSettings.currentPage / (totalPages || 1)) * 100}%`,
              }}
            />
          </div>
        </header>

        {/* Reader content area */}
        <main
          className="flex-1 overflow-hidden transition-colors duration-300"
          style={{
            backgroundColor: settings.backgroundColor,
            color: settings.textColor,
          }}
        >
          <ScrollArea className="h-full">
            <div
              className="w-full"
              style={{
                padding: `${settings.paddingVertical}px ${settings.paddingHorizontal}px`,
              }}
            >
              <div
                className="mx-auto"
                style={{
                  maxWidth: `${settings.maxWidth}px`,
                  fontFamily: FONT_FAMILIES[settings.fontFamily].value,
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  letterSpacing: `${settings.letterSpacing}em`,
                  textAlign: settings.textAlign,
                  hyphens: settings.hyphenation ? "auto" : "manual",
                  WebkitHyphens: settings.hyphenation ? "auto" : "manual",
                }}
              >
                {/* Reader paragraph spacing style */}
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
                  />
                ) : (
                  <PaginatedReader
                    uploadId={uploadId}
                    currentPage={pageSettings.currentPage}
                    onPageChange={handlePageChange}
                    totalPages={totalPages}
                  />
                )}
              </div>
            </div>
          </ScrollArea>
        </main>
      </div>
    </TooltipProvider>
  );
}
