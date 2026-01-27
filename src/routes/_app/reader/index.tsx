import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useCallback } from "react";
import { BookOpen, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useReaderTabsStore } from "@/lib/stores/reader-tabs-store";
import { useWriterTabsStore } from "@/lib/stores/writer-tabs-store";
import { ReaderTabBar } from "@/components/reader/reader-tab-bar";
import { UnifiedTabBar } from "@/components/unified-tab-bar";
import { SplitReaderView } from "@/components/reader/split-reader-view";
import { ReaderPane } from "@/components/reader/reader-pane";

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

function RouteComponent() {
  const navigate = useNavigate();
  const { uploadId } = Route.useSearch();
  const { tabs, activeTabId, addTab, updateTabTitle } = useReaderTabsStore();

  // Sync URL uploadId to tabs
  useEffect(() => {
    if (uploadId) {
      addTab(uploadId, "Loading...");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId]);

  const handleTitleLoad = useCallback(
    (title: string) => {
      if (activeTabId) {
        updateTabTitle(activeTabId, title);
      }
    },
    [activeTabId, updateTabTitle],
  );

  const handleAddTab = useCallback(() => {
    navigate({ to: "/documents" });
  }, [navigate]);

  // No upload selected and no tabs - show empty state
  if (!uploadId && tabs.length === 0) {
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

  // Get writer tabs to determine if we should show unified tab bar
  const writerTabs = useWriterTabsStore((state) => state.tabs);
  const showUnifiedTabs = tabs.length > 0 && writerTabs.length > 0;

  // Has tabs - show tabbed interface
  if (tabs.length > 0) {
    return (
      <TooltipProvider>
        <div className="h-full w-full flex flex-col overflow-hidden">
          {showUnifiedTabs ? <UnifiedTabBar /> : <ReaderTabBar onAddTab={handleAddTab} />}
          <div className="flex-1 min-h-0">
            <SplitReaderView className="h-full" />
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // Single document without tabs (fallback for direct URL access)
  if (uploadId) {
    return (
      <TooltipProvider>
        <div className="h-full w-full flex flex-col overflow-hidden">
          <ReaderPane uploadId={uploadId} isActive={true} showHeader={true} onTitleLoad={handleTitleLoad} />
        </div>
      </TooltipProvider>
    );
  }

  return null;
}
