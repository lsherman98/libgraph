import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePages,
  usePageByNumber,
  usePage,
  useSummary,
  useBookmarks,
  useNotes,
  useUploadById,
  useTranscriptUploadForAudio,
} from "@/lib/api/queries";
import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight, useSummarizeUpload, useSummarizePages } from "@/lib/api/mutations";
import { queryKeys } from "@/lib/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Sparkles, Volume2, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { pb } from "@/lib/pocketbase";
import { Collections, HighlightsColorOptions } from "@/lib/pocketbase-types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn, getUserId } from "@/lib/utils";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";
import { DocumentSearchBar } from "@/components/reader/document-search-bar";
import { QuickFontSizeControl } from "./reader-settings-controls";
import { PageSlider } from "./page-slider";
import { PaginatedReader } from "./paginated-reader";
import { ScrollReader } from "./scroll-reader";
import { toast } from "sonner";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wma", ".webm", ".mp4"]);

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
  const queryClient = useQueryClient();
  const { data: upload } = useUploadById(uploadId);
  const isAudioUpload = !!(upload?.file && isAudioFile(upload.file));
  const { data: transcriptUpload } = useTranscriptUploadForAudio(uploadId, { enabled: isAudioUpload });
  const contentUploadId = transcriptUpload?.id || uploadId;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [queuedSummaryPageId, setQueuedSummaryPageId] = useState<string | null>(null);
  const [queuedBookSummaryPageId, setQueuedBookSummaryPageId] = useState<string | null>(null);
  const [queuedRangePageIds, setQueuedRangePageIds] = useState<Set<string>>(new Set());
  const [isRangeSubmitting, setIsRangeSubmitting] = useState(false);
  const [isSummarizeRangeDialogOpen, setIsSummarizeRangeDialogOpen] = useState(false);
  const [summaryRangeStart, setSummaryRangeStart] = useState("");
  const [summaryRangeEnd, setSummaryRangeEnd] = useState("");
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

  const { data: firstPageData } = usePages(contentUploadId, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;
  const firstPageId = firstPageData?.items[0]?.id ?? null;

  const { data: currentPageData } = usePageByNumber(contentUploadId, pageSettings.currentPage);
  const currentPageId = currentPageData?.id;
  const resolvedCurrentPageId = currentPageData?.page === pageSettings.currentPage ? currentPageData.id : undefined;

  const isSummaryUpload = upload?.type === "summary";
  const isBookUpload = upload?.type === "book";
  const isScrollMode = !isBookUpload && !isSummaryUpload && settings.viewMode === "scroll";
  const showScrollToggle = !isBookUpload && !isSummaryUpload;
  const summarySourcePageId = isBookUpload ? currentPageId : firstPageId;
  const shouldPollForBookSummary = !isSummaryUpload && isBookUpload && !!queuedBookSummaryPageId;
  const shouldPollCurrentQueuedRangePage =
    !isSummaryUpload && isBookUpload && !!currentPageId && queuedRangePageIds.has(currentPageId) && !currentPageData?.summary;
  const { data: currentQueuedRangePage } = usePage(shouldPollCurrentQueuedRangePage ? currentPageId : undefined, {
    pollUntilSummary: shouldPollCurrentQueuedRangePage,
  });
  const currentBookSummaryRecordId = currentQueuedRangePage?.summary || currentPageData?.summary;
  const shouldPollForUploadSummary = !isSummaryUpload && !isBookUpload && !!queuedSummaryPageId && queuedSummaryPageId === contentUploadId;
  const { data: queuedBookSummaryPage } = usePage(queuedBookSummaryPageId || undefined, {
    pollUntilSummary: shouldPollForBookSummary,
  });
  const queuedBookSummaryRecordId = queuedBookSummaryPage?.summary;
  const { data: queuedBookSummaryRecord } = useSummary(queuedBookSummaryRecordId, {
    pollUntilUpload: shouldPollForBookSummary,
  });
  const queuedUploadSummaryPageId = shouldPollForUploadSummary ? firstPageId : undefined;
  const { data: queuedUploadSummaryPage } = usePage(queuedUploadSummaryPageId || undefined, {
    pollUntilSummary: shouldPollForUploadSummary,
  });
  const queuedUploadSummaryRecordId = queuedUploadSummaryPage?.summary;
  const activeSummaryRecordId = isBookUpload ? currentBookSummaryRecordId : queuedUploadSummaryRecordId || firstPageData?.items[0]?.summary;
  const { data: activeSummaryRecord } = useSummary(activeSummaryRecordId, {
    pollUntilUpload: !!activeSummaryRecordId,
  });
  const activeSummaryUploadId = activeSummaryRecord?.summary_upload;
  const { data: queuedUploadSummaryRecord } = useSummary(queuedUploadSummaryRecordId, {
    pollUntilUpload: shouldPollForUploadSummary,
  });
  const hasExistingSummary = !!activeSummaryRecordId;

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

    if (!activeSummaryUploadId) return;

    openSummarySplit(activeSummaryUploadId, summarySourcePageId);
  }, [tabId, isSummaryVisible, summarySourcePageId, activeSummaryUploadId, openSummarySplit]);

  useEffect(() => {
    if (isBookUpload) {
      if (!queuedBookSummaryPageId || !queuedBookSummaryRecord?.summary_upload) return;
      openSummarySplit(queuedBookSummaryRecord.summary_upload, queuedBookSummaryPageId);
      setQueuedBookSummaryPageId(null);
    } else {
      if (!firstPageId || !queuedUploadSummaryRecord?.summary_upload) return;
      if (!queuedSummaryPageId || queuedSummaryPageId !== contentUploadId) return;
      openSummarySplit(queuedUploadSummaryRecord.summary_upload, firstPageId);
      setQueuedSummaryPageId(null);
    }
  }, [
    isBookUpload,
    contentUploadId,
    queuedSummaryPageId,
    queuedBookSummaryPageId,
    firstPageId,
    queuedBookSummaryRecord?.summary_upload,
    queuedUploadSummaryRecord?.summary_upload,
    openSummarySplit,
  ]);

  useEffect(() => {
    if (!isBookUpload || !currentPageId) return;
    if (!queuedRangePageIds.has(currentPageId)) return;
    if (!currentBookSummaryRecordId) return;

    setQueuedRangePageIds((prev) => {
      const next = new Set(prev);
      next.delete(currentPageId);
      return next;
    });
  }, [isBookUpload, currentPageId, currentBookSummaryRecordId, queuedRangePageIds]);

  const setCurrentPageRef = useRef(setCurrentPage);
  const viewModeRef = useRef(settings.viewMode);
  setCurrentPageRef.current = setCurrentPage;
  viewModeRef.current = settings.viewMode;

  useEffect(() => {
    if (isActive) {
      setCurrentUploadId(contentUploadId ?? null);
      setCurrentPageState(resolvedCurrentPageId, pageSettings.currentPage);
    }
  }, [
    contentUploadId,
    resolvedCurrentPageId,
    pageSettings.currentPage,
    setCurrentUploadId,
    setCurrentPageState,
    isActive,
    upload?.type,
    currentPageData,
  ]);

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

  const { data: bookmarksData = [] } = useBookmarks(contentUploadId);
  const { data: notesData = [] } = useNotes(contentUploadId);
  const createHighlightMutation = useCreateHighlight();
  const updateHighlightMutation = useUpdateHighlight();
  const deleteHighlightMutation = useDeleteHighlight();
  const summarizeUploadMutation = useSummarizeUpload();
  const summarizePagesMutation = useSummarizePages();
  const isSummaryLoading = summarizeUploadMutation.isPending || shouldPollForUploadSummary || (!!activeSummaryRecordId && !activeSummaryUploadId);
  const isCurrentQueuedRangePagePending = !!currentPageId && queuedRangePageIds.has(currentPageId) && !currentBookSummaryRecordId;
  const isBookSummaryLoading =
    summarizePagesMutation.isPending ||
    isRangeSubmitting ||
    shouldPollForBookSummary ||
    shouldPollCurrentQueuedRangePage ||
    isCurrentQueuedRangePagePending ||
    (!!activeSummaryRecordId && !activeSummaryUploadId);

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
      if (!contentUploadId) return;
      createHighlightMutation.mutate({
        upload: contentUploadId,
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
    [contentUploadId, createHighlightMutation],
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
    if (isBookUpload) return;
    setSettings({ viewMode: enabled ? "scroll" : "paginate" });
  };

  useEffect(() => {
    if (isBookUpload && settings.viewMode === "scroll") {
      setSettings({ viewMode: "paginate" });
    }
  }, [isBookUpload, settings.viewMode, setSettings]);

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
      if (isScrollMode) {
        const el = document.getElementById(`page-${target}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  };

  const handleSummarizePageRange = useCallback(async () => {
    if (!contentUploadId) return;

    const start = Number.parseInt(summaryRangeStart, 10);
    const end = Number.parseInt(summaryRangeEnd, 10);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      toast.error("Enter a valid page range.");
      return;
    }

    const minPage = 1;
    const maxPage = Math.max(1, totalPages);
    const normalizedStart = Math.max(minPage, Math.min(start, maxPage));
    const normalizedEnd = Math.max(minPage, Math.min(end, maxPage));

    if (normalizedEnd < normalizedStart) {
      toast.error("End page must be greater than or equal to start page.");
      return;
    }

    setIsRangeSubmitting(true);

    try {
      const pagesInRange = await pb.collection(Collections.Pages).getFullList({
        filter: `upload = "${contentUploadId}" && page >= ${normalizedStart} && page <= ${normalizedEnd}`,
        sort: "page",
      });

      const pageIds = pagesInRange.map((page) => page.id);
      if (pageIds.length === 0) {
        toast.error("No pages found in that range.");
        return;
      }

      const response = await summarizePagesMutation.mutateAsync(pageIds);

      const anchorPageId = response.page_ids?.[0] || pageIds[0];
      if (anchorPageId) {
        setQueuedBookSummaryPageId(anchorPageId);
      }
      setQueuedRangePageIds(new Set(pageIds));

      setIsSummarizeRangeDialogOpen(false);
      toast.success(
        normalizedStart === normalizedEnd
          ? `Summary queued for page ${normalizedStart}.`
          : `Summary queued for pages ${normalizedStart}-${normalizedEnd}.`,
      );
    } catch {
      toast.error("Failed to summarize selected page range.");
    } finally {
      setIsRangeSubmitting(false);
    }
  }, [contentUploadId, summaryRangeStart, summaryRangeEnd, totalPages, summarizePagesMutation]);

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
                          if (isScrollMode) {
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
              {showScrollToggle && (
                <div className="hidden xl:flex items-center gap-2 px-2">
                  <Label htmlFor={`scroll-mode-${tabId}`} className="text-xs cursor-pointer whitespace-nowrap">
                    Scroll
                  </Label>
                  <Switch id={`scroll-mode-${tabId}`} checked={settings.viewMode === "scroll"} onCheckedChange={toggleScrollMode} />
                </div>
              )}
              {showScrollToggle && <Separator orientation="vertical" className="hidden xl:block data-[orientation=vertical]:h-5" />}
              <div className="hidden xl:flex items-center gap-1 px-2">
                <QuickFontSizeControl fontSize={settings.fontSize} onChange={(fontSize) => setSettings({ fontSize })} />
              </div>
              <Separator orientation="vertical" className="hidden xl:block data-[orientation=vertical]:h-5" />
              {!isSummaryUpload && (
                <DocumentSearchBar
                  uploadId={contentUploadId}
                  onNavigateToPage={({ pageId, pageNumber }) => {
                    const cachedPage = queryClient.getQueryData(queryKeys.pages.detail(pageId));
                    if (cachedPage) {
                      queryClient.setQueryData(queryKeys.pages.byNumber(contentUploadId, pageNumber), cachedPage);
                    }

                    handlePageChange(pageNumber);
                    if (isScrollMode) {
                      const tryScroll = (attempt: number) => {
                        if (attempt > 30) return;
                        const el = document.getElementById(`page-${pageNumber}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        } else {
                          setTimeout(() => tryScroll(attempt + 1), 100);
                        }
                      };
                      setTimeout(() => tryScroll(0), 50);
                    }
                  }}
                />
              )}
              {!isSummaryUpload &&
                (isBookUpload ? (
                  hasExistingSummary ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isSummaryVisible ? "secondary" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          disabled={!currentPageId || isBookSummaryLoading}
                          onClick={() => {
                            if (!summarySourcePageId || !activeSummaryUploadId) return;
                            if (!tabId) {
                              toast.info("Open this document from a workspace tab to view summary pane.");
                              return;
                            }
                            if (isSummaryVisible) {
                              closeSummarySplitTab(tabId);
                              return;
                            }
                            openSummarySplit(activeSummaryUploadId, summarySourcePageId);
                          }}
                        >
                          {isBookSummaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isBookSummaryLoading ? "Summarizing..." : isSummaryVisible ? "Close summary" : "Open summary"}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Popover
                      open={isSummarizeRangeDialogOpen}
                      onOpenChange={(open) => {
                        setIsSummarizeRangeDialogOpen(open);
                        if (open) {
                          const currentPage = pageSettings.currentPage || 1;
                          setSummaryRangeStart(String(currentPage));
                          setSummaryRangeEnd(String(currentPage));
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!currentPageId || isBookSummaryLoading}>
                          {isBookSummaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 space-y-3 p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Summarize Page Range</p>
                          <p className="text-xs text-muted-foreground">Select a start and end page to summarize.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 py-1">
                          <div className="space-y-1.5">
                            <Label htmlFor="summary-range-start" className="text-xs text-muted-foreground">
                              Start page
                            </Label>
                            <Input
                              id="summary-range-start"
                              type="number"
                              min={1}
                              max={totalPages || 1}
                              value={summaryRangeStart}
                              onChange={(event) => setSummaryRangeStart(event.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="summary-range-end" className="text-xs text-muted-foreground">
                              End page
                            </Label>
                            <Input
                              id="summary-range-end"
                              type="number"
                              min={1}
                              max={totalPages || 1}
                              value={summaryRangeEnd}
                              onChange={(event) => setSummaryRangeEnd(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" onClick={() => setIsSummarizeRangeDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleSummarizePageRange} disabled={isBookSummaryLoading}>
                            {isBookSummaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Summarize"}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSummaryVisible ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        disabled={!currentPageId || isSummaryLoading}
                        onClick={() => {
                          if (!currentPageId) return;

                          if (hasExistingSummary) {
                            if (!summarySourcePageId || !activeSummaryUploadId) return;
                            if (!tabId) {
                              toast.info("Open this document from a workspace tab to view summary pane.");
                              return;
                            }
                            if (isSummaryVisible) {
                              closeSummarySplitTab(tabId);
                              return;
                            }
                            openSummarySplit(activeSummaryUploadId, summarySourcePageId);
                            return;
                          }

                          summarizeUploadMutation.mutate(contentUploadId, {
                            onSuccess: () => {
                              setQueuedSummaryPageId(contentUploadId);
                            },
                            onError: () => {
                              toast.error("Failed to summarize document.");
                            },
                          });
                        }}
                      >
                        {isSummaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isSummaryLoading
                        ? "Summarizing..."
                        : hasExistingSummary
                          ? isSummaryVisible
                            ? "Close summary"
                            : "Open summary"
                          : "Summarize document"}
                    </TooltipContent>
                  </Tooltip>
                ))}
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
                  white-space: pre-wrap;
                  margin-bottom: ${settings.paragraphSpacing}em;
                }
                .reader-content li {
                  white-space: pre-wrap;
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
              {isScrollMode ? (
                <ScrollReader
                  uploadId={contentUploadId}
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
                  uploadId={contentUploadId}
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
                if (isScrollMode) {
                  setTimeout(() => {
                    const el = document.getElementById(`page-${page}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }, 50);
                }
              }}
              uploadId={contentUploadId}
            />
            <span className="opacity-60">{totalPages}</span>
          </div>
        </footer>
      )}
    </div>
  );
}
