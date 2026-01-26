import { useCallback } from "react";
import { useReaderTabsStore } from "@/lib/stores/reader-tabs-store";
import { ReaderPane } from "@/components/reader/reader-pane";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

interface SplitReaderViewProps {
  className?: string;
}

export function SplitReaderView({ className }: SplitReaderViewProps) {
  const { tabs, activeTabId, splitMode, splitTabId, panelSizes, updateTabPage, updateTabTitle } = useReaderTabsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const splitTab = splitTabId ? tabs.find((t) => t.id === splitTabId) : null;

  const handlePageChange = useCallback(
    (tabId: string) => (page: number) => {
      updateTabPage(tabId, page);
    },
    [updateTabPage],
  );

  const handleTitleLoad = useCallback(
    (tabId: string) => (title: string) => {
      updateTabTitle(tabId, title);
    },
    [updateTabTitle],
  );

  if (!activeTab) {
    return null;
  }

  // Single view mode
  if (splitMode === "none" || !splitTab) {
    return (
      <div className={className}>
        <ReaderPane
          key={activeTab.id}
          uploadId={activeTab.uploadId}
          tabId={activeTab.id}
          isActive={true}
          showHeader={true}
          onPageChange={handlePageChange(activeTab.id)}
          onTitleLoad={handleTitleLoad(activeTab.id)}
        />
      </div>
    );
  }

  // Split view mode - always horizontal (side-by-side)
  return (
    <ResizablePanelGroup className={className}>
      <ResizablePanel defaultSize={panelSizes[0]} minSize={25}>
        <div className="h-full w-full overflow-hidden">
          <ReaderPane
            key={activeTab.id}
            uploadId={activeTab.uploadId}
            tabId={activeTab.id}
            isActive={true}
            showHeader={true}
            onPageChange={handlePageChange(activeTab.id)}
            onTitleLoad={handleTitleLoad(activeTab.id)}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={panelSizes[1]} minSize={25}>
        <div className="h-full w-full overflow-hidden">
          <ReaderPane
            key={splitTab.id}
            uploadId={splitTab.uploadId}
            tabId={splitTab.id}
            isActive={false}
            showHeader={true}
            onPageChange={handlePageChange(splitTab.id)}
            onTitleLoad={handleTitleLoad(splitTab.id)}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
