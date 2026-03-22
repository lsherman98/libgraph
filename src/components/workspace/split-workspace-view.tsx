import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceTabsStore, type ReaderTab, type WriterTab, type WorkspaceTab } from "@/lib/stores/workspace-tabs-store";
import { ReaderPane } from "@/components/reader/reader-pane";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";
import { WriterPane } from "./writer-pane";

interface SplitWorkspaceViewProps {
  className?: string;
  localContent?: string;
  activeProject?: any;
  onContentChange?: (content: string) => void;
  onTitleLoad?: (title: string) => void;
}

export function SplitWorkspaceView({
  className,
  localContent: parentLocalContent,
  activeProject: parentActiveProject,
  onContentChange: parentOnContentChange,
  onTitleLoad,
}: SplitWorkspaceViewProps) {
  const {
    tabs,
    activeTabId,
    splitMode,
    splitTabId,
    focusedPane,
    setFocusedPane,
    panelSizes,
    updateReaderTabPage,
    updateTabTitle,
    setWriterTabDirty,
  } = useWorkspaceTabsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const splitTab = splitTabId ? tabs.find((t) => t.id === splitTabId) : null;

  const [splitLocalContent, setSplitLocalContent] = useState<string>("");

  const { data: splitProject } = useWritingProject(splitTab?.type === "writer" ? (splitTab as WriterTab).projectId : "");
  const splitAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSplitProject = useUpdateWritingProject();

  useEffect(() => {
    if (splitProject) {
      setSplitLocalContent(splitProject.content || "");
    }
  }, [splitProject?.id, splitProject?.content]);

  const handlePageChange = useCallback(
    (tabId: string) => (page: number) => {
      updateReaderTabPage(tabId, page);
    },
    [updateReaderTabPage],
  );

  const handleTitleLoad = useCallback(
    (tabId: string) => (title: string) => {
      updateTabTitle(tabId, title);
      if (tabId === activeTabId && onTitleLoad) {
        onTitleLoad(title);
      }
    },
    [updateTabTitle, activeTabId, onTitleLoad],
  );

  const handleSplitContentChange = useCallback(
    (content: string) => {
      setSplitLocalContent(content);
      if (splitTabId) {
        setWriterTabDirty(splitTabId, true);
      }

      if (splitAutoSaveTimerRef.current) {
        clearTimeout(splitAutoSaveTimerRef.current);
      }
      const splitWriterTab = splitTab as WriterTab | undefined;
      if (splitWriterTab?.projectId) {
        splitAutoSaveTimerRef.current = setTimeout(async () => {
          await updateSplitProject.mutateAsync({
            id: splitWriterTab.projectId,
            data: { content },
          });
          if (splitTabId) {
            setWriterTabDirty(splitTabId, false);
          }
        }, 1000);
      }
    },
    [splitTabId, splitTab, setWriterTabDirty, updateSplitProject],
  );

  useEffect(() => {
    return () => {
      if (splitAutoSaveTimerRef.current) {
        clearTimeout(splitAutoSaveTimerRef.current);
      }
    };
  }, []);

  if (!activeTab) {
    return null;
  }

  const renderPane = (
    tab: WorkspaceTab,
    isActive: boolean,
    writerProps?: { localContent: string; project: any; onContentChange?: (c: string) => void },
  ) => {
    if (tab.type === "reader") {
      return (
        <ReaderPane
          key={tab.id}
          uploadId={(tab as ReaderTab).uploadId}
          tabId={tab.id}
          initialPage={(tab as ReaderTab).currentPage}
          isActive={isActive}
          showHeader={true}
          onPageChange={handlePageChange(tab.id)}
          onTitleLoad={handleTitleLoad(tab.id)}
        />
      );
    }
    return (
      <WriterPane
        key={tab.id}
        tab={tab as WriterTab}
        localContent={writerProps?.localContent || ""}
        project={writerProps?.project}
        onContentChange={writerProps?.onContentChange}
      />
    );
  };

  const activeWriterProps =
    activeTab.type === "writer"
      ? { localContent: parentLocalContent || "", project: parentActiveProject, onContentChange: parentOnContentChange }
      : undefined;

  const splitWriterProps =
    splitTab?.type === "writer" ? { localContent: splitLocalContent, project: splitProject, onContentChange: handleSplitContentChange } : undefined;

  if (splitMode === "none" || !splitTab) {
    return (
      <div className={className} onMouseDown={() => setFocusedPane("primary")} onFocusCapture={() => setFocusedPane("primary")}>
        {renderPane(activeTab, true, activeWriterProps)}
      </div>
    );
  }

  const resolvedFocusedTabId = focusedPane === "secondary" ? splitTab.id : activeTab.id;

  return (
    <ResizablePanelGroup className={cn("flex h-full w-full", className)}>
      <ResizablePanel defaultSize={panelSizes[0]} minSize={20}>
        <div
          className={cn(
            "h-full w-full overflow-hidden ring-1 ring-inset ring-transparent transition-shadow duration-150",
            resolvedFocusedTabId === activeTab.id && "ring-primary/40",
          )}
          onMouseDown={() => setFocusedPane("primary")}
          onFocusCapture={() => setFocusedPane("primary")}
        >
          {renderPane(activeTab, resolvedFocusedTabId === activeTab.id, activeWriterProps)}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={panelSizes[1]} minSize={20}>
        <div
          className={cn(
            "h-full w-full overflow-hidden ring-1 ring-inset ring-transparent transition-shadow duration-150",
            resolvedFocusedTabId === splitTab.id && "ring-primary/40",
          )}
          onMouseDown={() => setFocusedPane("secondary")}
          onFocusCapture={() => setFocusedPane("secondary")}
        >
          {renderPane(splitTab, resolvedFocusedTabId === splitTab.id, splitWriterProps)}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
