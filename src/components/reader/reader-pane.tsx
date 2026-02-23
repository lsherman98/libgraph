import { useState, useEffect, useRef, useCallback } from "react";
import { usePages, useBookmarks, useNotes, useUploadById } from "@/lib/api/queries";
import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight } from "@/lib/api/mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { BookMarked, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Volume2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { pb } from "@/lib/pocketbase";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useReaderSettings, usePageSettings, FONT_FAMILIES } from "@/lib/hooks/use-reader-settings";
import { ReaderSettingsPanel } from "@/components/reader/reader-settings-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getUserId } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useReaderStore } from "@/lib/stores/reader-store";
import { DocumentSearchBar } from "@/components/reader/document-search-bar";
import { QuickFontSizeControl } from "./reader-settings-controls";
import { PageSlider } from "./page-slider";
import { PaginatedReader } from "./paginated-reader";
import { ScrollReader } from "./scroll-reader";

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isReadingMode, setReadingMode, setCurrentPageState, setCurrentUploadId, setNavigateToPage } = useReaderStore();
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const { setOpen, setOpenRight, open: leftSidebarOpen, openRight: rightSidebarOpen } = useSidebar();
  const previousSidebarState = useRef({ left: true, right: true });
  const { settings, setSettings, applyTheme, resetSettings, cssVariables } = useReaderSettings();
  const { pageSettings, setCurrentPage, isLoaded: pageSettingsLoaded } = usePageSettings(uploadId, initialPage);

  const dbSyncedRef = useRef(false);
  useEffect(() => {
    if (pageSettingsLoaded && !dbSyncedRef.current) {
      dbSyncedRef.current = true;
      onPageChange?.(pageSettings.currentPage);
    }
  }, [pageSettingsLoaded, pageSettings.currentPage, onPageChange]);

  const { data: firstPageData } = usePages(uploadId ?? null, 1, 1);
  const totalPages = firstPageData?.totalItems || 0;

  const { data: currentPageData } = usePages(uploadId ?? null, pageSettings.currentPage, 1);
  const currentPageId = currentPageData?.items[0]?.id ?? null;

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

  const { data: bookmarksData = [] } = useBookmarks(uploadId ?? null);
  const { data: notesData = [] } = useNotes(uploadId ?? null);
  const createHighlightMutation = useCreateHighlight();
  const updateHighlightMutation = useUpdateHighlight();
  const deleteHighlightMutation = useDeleteHighlight();

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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pageSettings.currentPage <= 1} onClick={() => navigatePage("prev")}>
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
                isReadingMode={isReadingMode}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={isReadingMode ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={toggleReadingMode}>
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
              <ReaderSettingsPanel settings={settings} onSettingsChange={setSettings} onApplyTheme={applyTheme} onReset={resetSettings} />
            </div>
          </div>
          <div className={cn("h-0.5", isReadingMode ? "bg-(--reader-text-color)/10" : "bg-muted")}>
            <div
              className={cn("h-full transition-all duration-300", isReadingMode ? "bg-(--reader-text-color)/30" : "bg-primary/50")}
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
            "shrink-0 border-t px-3 sm:px-6 py-2 transition-colors duration-300",
            isReadingMode
              ? "bg-(--reader-bg-color) border-(--reader-text-color)/10"
              : "bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
          )}
          style={isReadingMode ? { color: settings.textColor } : undefined}
        >
          <div className="max-w-4xl mx-auto flex flex-col gap-1">
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
              isReadingMode={isReadingMode}
              textColor={settings.textColor}
              uploadId={uploadId}
            />
            <div className="flex items-center justify-between text-xs opacity-50">
              <span>1</span>
              <span>{totalPages}</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
