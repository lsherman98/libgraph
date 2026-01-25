import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useInfinitePages, usePageMarkdown, usePages } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { BookOpen, BookMarked, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { Collections } from "@/lib/pocketbase-types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel, QuickFontSizeControl } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, useDebouncedCallback } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useReaderStore } from "@/lib/stores/reader-store";
import Markdown from "react-markdown";

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

  return (
    <div className="reader-content">
      <Markdown
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-medium mt-5 mb-2">{children}</h3>,
          pre: ({ children }) => (
            <pre className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm">
              {children}
            </pre>
          ),
          code: ({ children }) => <code>{children}</code>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">{children}</blockquote>
          ),
          ul: ({ children }) => <ul className="my-4 pl-6 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 pl-6 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          p: ({ children }) => <p className="reader-paragraph">{children}</p>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

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
      <MarkdownContent content={markdown} isLoading={isLoading} />
    </article>
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

  return <PaginatedPageContent pageId={page.id} />;
}

function PaginatedPageContent({ pageId }: { pageId: string }) {
  const { data: markdown, isLoading } = usePageMarkdown(pageId);
  return <MarkdownContent content={markdown} isLoading={isLoading} />;
}

function RouteComponent() {
  const navigate = useNavigate();
  const { uploadId } = Route.useSearch();
  const [upload, setUpload] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isReadingMode, setReadingMode } = useReaderStore();
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const { setOpen, setOpenRight, open: leftSidebarOpen, openRight: rightSidebarOpen } = useSidebar();
  const previousSidebarState = useRef({ left: true, right: true });
  const { settings, setSettings, applyTheme, resetSettings, cssVariables } = useReaderSettings();
  const { pageSettings, setCurrentPage } = usePageSettings(uploadId);

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
    },
    [setCurrentPage],
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

  if (!uploadId) {
    return (
      <div className="flex flex-1 w-full items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">No Document Selected</h2>
          <p className="text-muted-foreground mb-8">
            Select a document from your library to start reading, or browse your collection to find something new.
          </p>
          <Button size="lg" onClick={() => navigate({ to: "/documents" })}>
            <BookMarked className="mr-2 h-4 w-4" />
            Browse Documents
          </Button>
        </div>
      </div>
    );
  }

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
        className={cn(
          "h-full w-full flex flex-col transition-colors duration-300 overflow-hidden",
          (isFullscreen || isReadingMode) && "bg-(--reader-bg-color)",
        )}
        style={cssVariables}
      >
        <header
          className={cn(
            "shrink-0 border-b z-20 transition-colors duration-300",
            isReadingMode
              ? "bg-(--reader-bg-color) border-(--reader-text-color)/10"
              : "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
          style={isReadingMode ? { color: settings.textColor } : undefined}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4 flex-1">
              <div className="hidden md:block">
                <h1 className="text-sm font-semibold line-clamp-1 max-w-75">{upload.title || "Untitled"}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs">
                    {upload.type}
                  </Badge>
                  {totalPages > 0 && <span className="text-xs text-muted-foreground">{totalPages} pages</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="hidden lg:flex items-center gap-2 px-2 border-r">
                <Label htmlFor="scroll-mode-right" className="text-xs cursor-pointer">
                  Scroll
                </Label>
                <Switch
                  id="scroll-mode-right"
                  checked={settings.viewMode === "scroll"}
                  onCheckedChange={toggleScrollMode}
                />
              </div>
              <div className="hidden lg:flex items-center gap-1 px-2 border-r">
                <QuickFontSizeControl fontSize={settings.fontSize} onChange={(fontSize) => setSettings({ fontSize })} />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isReadingMode ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={toggleReadingMode}
                  >
                    <BookMarked className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isReadingMode ? "Exit Reading Mode" : "Reading Mode"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleFullscreen}>
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
        <main
          className="flex-1 min-h-0 overflow-hidden transition-colors duration-300"
          style={{
            backgroundColor: settings.backgroundColor,
            color: settings.textColor,
          }}
        >
          <ScrollArea className="h-full w-full">
            <div className="w-full">
              <div
                className="mx-auto px-6 py-8"
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
        {settings.viewMode === "paginate" && (
          <footer
            className={cn(
              "shrink-0 border-t px-4 py-3 transition-colors duration-300",
              isReadingMode
                ? "bg-(--reader-bg-color) border-(--reader-text-color)/10"
                : "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
            )}
            style={isReadingMode ? { color: settings.textColor } : undefined}
          >
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              <Button
                variant="ghost"
                onClick={() => navigatePage("prev")}
                disabled={pageSettings.currentPage <= 1}
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
                  value={pageSettings.currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value, 10);
                    if (page >= 1 && page <= totalPages) {
                      handlePageChange(page);
                    }
                  }}
                  className="w-16 h-9 text-center"
                />
                <span className="text-sm opacity-60">of {totalPages}</span>
              </div>
              <Button
                variant="ghost"
                onClick={() => navigatePage("next")}
                disabled={pageSettings.currentPage >= totalPages}
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </footer>
        )}
      </div>
    </TooltipProvider>
  );
}
