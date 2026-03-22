import { useState, useEffect, useRef, useCallback } from "react";
import { usePages, useBookmarks, useNotes, useUploadById, useSummaryBySourcePage, useSummaryBySourceUpload } from "@/lib/api/queries";
import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight, useSummarizePage, useSummarizePages } from "@/lib/api/mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Sparkles, Volume2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { pb } from "@/lib/pocketbase";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getUserId } from "@/lib/utils";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";
import { DocumentSearchBar } from "@/components/reader/document-search-bar";
import { QuickFontSizeControl } from "./reader-settings-controls";
import { PageSlider } from "./page-slider";
import { PaginatedReader } from "./paginated-reader";
import { ScrollReader } from "./scroll-reader";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPageByNumber } from "@/lib/api/api";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma", ".webm", ".mp4"]);

function isAudioFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return AUDIO_EXTENSIONS.has(ext);
}

interface ReaderPaneProps {
  uploadId: string;
  tabId?: string;
  initialPage?: number;
  isActive?: boolean;
  showHeader?: boolean;
  onPageChange?: (page: number) => void;
  onTitleLoad?: (title: string) => void;
}

export function ReaderPane({ uploadId, tabId, initialPage, isActive = true, showHeader = true, onPageChange, onTitleLoad }: ReaderPaneProps) {
  const { data: upload } = useUploadById(uploadId);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [queuedSummaryPageId, setQueuedSummaryPageId] = useState<string | null>(null);
  const [isSummarizePopoverOpen, setIsSummarizePopoverOpen] = useState(false);
  const [rangeStartPage, setRangeStartPage] = useState<string>("");
  const [rangeEndPage, setRangeEndPage] = useState<string>("");
  const [isRangeSummaryPending, setIsRangeSummaryPending] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { setCurrentPageState, setCurrentUploadId, setNavigateToPage } = useReaderStore();
  const { splitMode, splitTabId, tabs, openOrUpdateSummarySplitTab, closeSummarySplitTab } = useWorkspaceTabsStore();
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const { settings, setSettings, applyTheme, resetSettings, cssVariables } = useReaderSettings();
  const { pageSettings, setCurrentPage, isLoaded: pageSettingsLoaded } = usePageSettings(uploadId, initialPage);

  const dbSyncedRef = useRef(false);
  useEffect(() => {
    if (pageSettingsLoaded && !dbSyncedRef.current) {
      dbSyncedRef.current = true;
      onPageChange?.(pageSettings.currentPage);
    }
  }, [pageSettingsLoaded, pageSettings.currentPage, onPageChange]);

  const { data: firstPageData } = usePages(uploadId, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;
  const firstPageId = firstPageData?.items[0]?.id ?? null;

  const { data: currentPageData } = usePages(uploadId, pageSettings.currentPage, 1);
  const currentPageId = currentPageData?.items[0]?.id;

  const isSummaryUpload = upload?.type === "summary";
  const isBookUpload = upload?.type === "book";
  const summarySourcePageId = isBookUpload ? currentPageId : firstPageId;
  const shouldPollForSummary = !isSummaryUpload && !!queuedSummaryPageId && queuedSummaryPageId === (isBookUpload ? currentPageId : uploadId);
  const { data: pageSummaryRecord } = useSummaryBySourcePage(currentPageId, {
    pollUntilFound: shouldPollForSummary && isBookUpload,
  });
  const { data: uploadSummaryRecord } = useSummaryBySourceUpload(uploadId, {
    pollUntilFound: shouldPollForSummary && !isBookUpload,
  });
  const activeSummaryRecord = isBookUpload ? pageSummaryRecord : uploadSummaryRecord;
  const hasExistingSummary = !!activeSummaryRecord?.summary_upload;

  const linkedSummaryTab = tabId ? tabs.find((tab) => tab.type === "reader" && !!tab.isSummary && tab.summarySourceTabId === tabId) : undefined;
  const isSummaryVisible = !!linkedSummaryTab && splitMode === "horizontal" && splitTabId === linkedSummaryTab.id;

  const openSummarySplit = useCallback(
    (summaryUploadId: string, sourcePageId: string) => {
      if (!tabId) return;
      const titleBase = upload?.title || "Untitled";
      openOrUpdateSummarySplitTab({
        sourceTabId: tabId,
        sourcePageId,
        summaryUploadId,
        title: `${titleBase} — Summary (Page ${pageSettings.currentPage})`,
      });
    },
    [tabId, upload?.title, pageSettings.currentPage, openOrUpdateSummarySplitTab],
  );

  useEffect(() => {
    if (!tabId || !isSummaryVisible || !summarySourcePageId) return;

    if (!activeSummaryRecord?.summary_upload) {
      closeSummarySplitTab(tabId);
      return;
    }

    openSummarySplit(activeSummaryRecord.summary_upload, summarySourcePageId);
  }, [tabId, isSummaryVisible, summarySourcePageId, activeSummaryRecord?.summary_upload, closeSummarySplitTab, openSummarySplit]);

  useEffect(() => {
    const queuedTarget = isBookUpload ? currentPageId : uploadId;
    if (!summarySourcePageId || queuedSummaryPageId !== queuedTarget || !activeSummaryRecord?.summary_upload) return;

    openSummarySplit(activeSummaryRecord.summary_upload, summarySourcePageId);
    setQueuedSummaryPageId(null);
  }, [
    queuedSummaryPageId,
    currentPageId,
    uploadId,
    summarySourcePageId,
    activeSummaryRecord?.summary_upload,
    isBookUpload,
    pageSettings.currentPage,
    openSummarySplit,
  ]);

  const setCurrentPageRef = useRef(setCurrentPage);
  const viewModeRef = useRef(settings.viewMode);
  setCurrentPageRef.current = setCurrentPage;
  viewModeRef.current = settings.viewMode;

  useEffect(() => {
    if (isActive) {
      setCurrentUploadId(uploadId ?? null);
      setCurrentPageState(currentPageId, pageSettings.currentPage);
    }
  }, [uploadId, currentPageId, pageSettings.currentPage, setCurrentUploadId, setCurrentPageState, isActive]);

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

  const { data: bookmarksData = [] } = useBookmarks(uploadId);
  const { data: notesData = [] } = useNotes(uploadId);
  const createHighlightMutation = useCreateHighlight();
  const updateHighlightMutation = useUpdateHighlight();
  const deleteHighlightMutation = useDeleteHighlight();
  const summarizePageMutation = useSummarizePage();
  const summarizePagesMutation = useSummarizePages();

  const bookmarks = bookmarksData?.map((b) => ({
    id: b.id,
    block_id: b.block_id || "",
    comment: b.comment || "",
    tags: b.tags || [],
  }));

  const notes = notesData?.map((n) => ({
    id: n.id,
    block_id: n.block_id || "",
    content: n.content || "",
    tags: n.tags || [],
  }));

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
        comment: data.note,
        tags: data.tags,
        start_offset: data.start_offset,
        end_offset: data.end_offset,
        user: getUserId(),
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

  const queueRangeSummary = useCallback(async () => {
    if (!isBookUpload || !uploadId || totalPages < 1) return;

    const parsedStart = Number.parseInt(rangeStartPage, 10);
    const parsedEnd = Number.parseInt(rangeEndPage, 10);

    if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
      toast.error("Enter valid page numbers.");
      return;
    }

    const boundedStart = Math.max(1, Math.min(totalPages, parsedStart));
    const boundedEnd = Math.max(1, Math.min(totalPages, parsedEnd));
    const start = Math.min(boundedStart, boundedEnd);
    const end = Math.max(boundedStart, boundedEnd);

    const pageNumbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    if (pageNumbers.length === 0) {
      toast.error("No pages selected.");
      return;
    }

    setIsRangeSummaryPending(true);

    try {
      const pageRecords = await Promise.all(
        pageNumbers.map(async (pageNumber) => {
          try {
            const page = await getPageByNumber(uploadId, pageNumber);
            return { pageNumber, pageId: page.id, ok: true };
          } catch {
            return { pageNumber, pageId: "", ok: false };
          }
        }),
      );

      const validPageRecords = pageRecords.filter((record) => record.ok && record.pageId);
      if (validPageRecords.length === 0) {
        toast.error("No valid pages found for that range.");
        return;
      }

      const selectedPageIDs = validPageRecords.map((record) => record.pageId);
      await summarizePagesMutation.mutateAsync(selectedPageIDs);
      const queuedCount = selectedPageIDs.length;

      if (currentPageId && selectedPageIDs.includes(currentPageId) && queuedCount > 0) {
        setQueuedSummaryPageId(currentPageId);
      }

      setIsSummarizePopoverOpen(false);
    } finally {
      setIsRangeSummaryPending(false);
    }
  }, [isBookUpload, uploadId, totalPages, rangeStartPage, rangeEndPage, summarizePagesMutation, currentPageId]);

  const onTitleLoadRef = useRef(onTitleLoad);
  onTitleLoadRef.current = onTitleLoad;

  useEffect(() => {
    if (upload) {
      onTitleLoadRef.current?.(upload.title || "Untitled");
    }
  }, [upload?.id, upload?.title]);

  useEffect(() => {
    if (upload?.file && isAudioFile(upload.file)) {
      pb.files
        .getToken()
        .then((token) => {
          const url = pb.files.getURL(upload, upload.file, { token });
          setAudioUrl(url);
        })
        .catch((err) => {
          console.error("Failed to get audio file URL:", err);
        });
    } else {
      setAudioUrl(null);
    }
  }, [upload?.id, upload?.file]);

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
      className={cn("h-full w-full flex flex-col transition-colors duration-300 overflow-hidden", isFullscreen && "bg-(--reader-bg-color)")}
      style={cssVariables}
    >
      {showHeader && (
        <header
          className={cn(
            "shrink-0 border-b z-20 transition-colors duration-300",
            "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-3 min-w-0 shrink">
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-semibold truncate max-w-30 md:max-w-45 lg:max-w-62" title={upload.title || "Untitled"}>
                  {upload.title || "Untitled"}
                </h1>
                <Badge variant="outline" className="text-xs shrink-0">
                  {upload.type}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isSummaryUpload && (
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
                      className="w-16 h-7 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="hidden xl:flex items-center gap-2 px-2 border-r">
                <Label htmlFor={`scroll-mode-${tabId}`} className="text-xs cursor-pointer whitespace-nowrap">
                  Scroll
                </Label>
                <Switch id={`scroll-mode-${tabId}`} checked={settings.viewMode === "scroll"} onCheckedChange={toggleScrollMode} />
              </div>
              <div className="hidden xl:flex items-center gap-1 px-2 border-r">
                <QuickFontSizeControl fontSize={settings.fontSize} onChange={(fontSize) => setSettings({ fontSize })} />
              </div>
              {!isSummaryUpload && (
                <DocumentSearchBar
                  uploadId={uploadId}
                  onNavigateToPage={(pageNumber) => {
                    handlePageChange(pageNumber);
                    if (settings.viewMode === "scroll") {
                      setTimeout(() => {
                        const el = document.getElementById(`page-${pageNumber}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }, 100);
                    }
                  }}
                />
              )}
              {!isSummaryUpload &&
                !hasExistingSummary &&
                (isBookUpload ? (
                  <Popover
                    open={isSummarizePopoverOpen}
                    onOpenChange={(open) => {
                      setIsSummarizePopoverOpen(open);
                      if (open) {
                        setRangeStartPage(String(pageSettings.currentPage));
                        setRangeEndPage(String(pageSettings.currentPage));
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={totalPages < 1 || isRangeSummaryPending || summarizePageMutation.isPending || summarizePagesMutation.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        {summarizePageMutation.isPending || summarizePagesMutation.isPending || shouldPollForSummary || isRangeSummaryPending
                          ? "Summarizing..."
                          : "Summarize"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 space-y-3 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Summarize page range</p>
                        <p className="text-xs text-muted-foreground">Defaults to the current page.</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="summary-range-start" className="text-xs">
                              Start page
                            </Label>
                            <Input
                              id="summary-range-start"
                              type="number"
                              min={1}
                              max={totalPages}
                              value={rangeStartPage}
                              onChange={(event) => setRangeStartPage(event.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="summary-range-end" className="text-xs">
                              End page
                            </Label>
                            <Input
                              id="summary-range-end"
                              type="number"
                              min={1}
                              max={totalPages}
                              value={rangeEndPage}
                              onChange={(event) => setRangeEndPage(event.target.value)}
                              className="h-8"
                            />
                          </div>
                          <Button
                            variant={"outline"}
                            className="h-8 px-3"
                            onClick={queueRangeSummary}
                            disabled={isRangeSummaryPending || summarizePageMutation.isPending || summarizePagesMutation.isPending || !currentPageId}
                          >
                            {isRangeSummaryPending || summarizePageMutation.isPending || summarizePagesMutation.isPending
                              ? "Summarizing..."
                              : "Summarize"}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={!currentPageId || summarizePageMutation.isPending || shouldPollForSummary}
                        onClick={() => {
                          if (!currentPageId) return;
                          summarizePageMutation.mutate(currentPageId, {
                            onSuccess: () => {
                              setQueuedSummaryPageId(uploadId);
                            },
                          });
                        }}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        {summarizePageMutation.isPending || shouldPollForSummary ? "Summarizing..." : "Summarize"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate summary for this document</TooltipContent>
                  </Tooltip>
                ))}
              {!isSummaryUpload && (!isBookUpload || hasExistingSummary) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSummaryVisible ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        if (!tabId) return;
                        if (isSummaryVisible) {
                          closeSummarySplitTab(tabId);
                          return;
                        }
                        if (!summarySourcePageId || !activeSummaryRecord?.summary_upload) {
                          toast.info(isBookUpload ? "No summary for this page yet" : "No summary for this document yet", {
                            description: isBookUpload
                              ? "Use Summarize first, then toggle summary view."
                              : "Use Summarize first, then toggle summary view.",
                          });
                          return;
                        }
                        openSummarySplit(activeSummaryRecord.summary_upload, summarySourcePageId);
                      }}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isSummaryVisible ? "Hide summary pane" : "Show summary pane"}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
              </Tooltip>
              <ReaderSettingsPanel settings={settings} onSettingsChange={setSettings} onApplyTheme={applyTheme} onReset={resetSettings} />
            </div>
          </div>
          <div className={cn("h-0.5", "bg-muted")}>
            <div
              className={cn("h-full transition-all duration-300", "bg-primary/50")}
              style={{
                width: `${(pageSettings.currentPage / (totalPages || 1)) * 100}%`,
              }}
            />
          </div>
        </header>
      )}
      {audioUrl && (
        <Collapsible open={isAudioOpen} onOpenChange={setIsAudioOpen} className="shrink-0 border-b bg-muted/30">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <Volume2 className="size-4" />
              <span>Audio Player</span>
              <ChevronDown className={cn("size-4 ml-auto transition-transform duration-200", isAudioOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-3 flex items-center gap-3 max-w-3xl mx-auto">
              <audio
                ref={audioRef}
                controls
                className="flex-1 min-w-0"
                preload="metadata"
                onRateChange={(e) => setPlaybackRate((e.target as HTMLAudioElement).playbackRate)}
              >
                <source src={audioUrl} />
                Your browser does not support the audio element.
              </audio>
              <div className="flex items-center gap-1 shrink-0">
                {[1, 1.5, 2, 3, 4].map((rate) => (
                  <Button
                    key={rate}
                    variant={playbackRate === rate ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.playbackRate = rate;
                        setPlaybackRate(rate);
                      }
                    }}
                  >
                    {rate}x
                  </Button>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
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
              data-reader-root
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
                  bookmarks={bookmarks || []}
                  notes={notes || []}
                  onCreateHighlight={handleCreateHighlight}
                  onUpdateHighlight={handleUpdateHighlight}
                  onDeleteHighlight={handleDeleteHighlight}
                />
              ) : (
                <PaginatedReader
                  uploadId={uploadId}
                  currentPage={pageSettings.currentPage}
                  onPageChange={handlePageChange}
                  totalPages={totalPages}
                  bookmarks={bookmarks || []}
                  notes={notes || []}
                  onCreateHighlight={handleCreateHighlight}
                  onUpdateHighlight={handleUpdateHighlight}
                  onDeleteHighlight={handleDeleteHighlight}
                />
              )}
            </div>
          </div>
        </ScrollArea>
      </main>
      {totalPages > 1 && (
        <footer
          className={cn(
            "shrink-0 border-t px-3 sm:px-6 py-4 transition-colors duration-300",
            "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
        >
          <div className="max-w-4xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
            <span className="opacity-60">1</span>
            <PageSlider
              currentPage={pageSettings.currentPage}
              totalPages={totalPages}
              onPageChange={(page) => {
                handlePageChange(page);
                if (settings.viewMode === "scroll") {
                  setTimeout(() => {
                    const el = document.getElementById(`page-${page}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }, 50);
                }
              }}
              uploadId={uploadId}
            />
            <span className="opacity-60">{totalPages}</span>
          </div>
        </footer>
      )}
    </div>
  );
}
