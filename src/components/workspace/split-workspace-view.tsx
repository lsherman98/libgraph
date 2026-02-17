import { useCallback, useState, useEffect, useRef } from "react";
import { useWorkspaceTabsStore, type ReaderTab, type WriterTab, type WorkspaceTab } from "@/lib/stores/workspace-tabs-store";
import { ReaderPane } from "@/components/reader/reader-pane";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";
import { WriterEditorPane } from "./editor-pane";

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
  const { tabs, activeTabId, splitMode, splitTabId, panelSizes, updateReaderTabPage, updateTabTitle, setWriterTabDirty } = useWorkspaceTabsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const splitTab = splitTabId ? tabs.find((t) => t.id === splitTabId) : null;

  const [splitLocalContent, setSplitLocalContent] = useState<string>("");
  const { data: splitProject } = useWritingProject(splitTab?.type === "writer" ? (splitTab as WriterTab).projectId : undefined);
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

  const renderPane = (tab: WorkspaceTab, isActive: boolean, localContent?: string, project?: any, onContentChange?: (content: string) => void) => {
    if (tab.type === "reader") {
      const readerTab = tab as ReaderTab;
      return (
        <ReaderPane
          key={tab.id}
          uploadId={readerTab.uploadId}
          tabId={tab.id}
          initialPage={readerTab.currentPage}
          isActive={isActive}
          showHeader={true}
          onPageChange={handlePageChange(tab.id)}
          onTitleLoad={handleTitleLoad(tab.id)}
        />
      );
    } else {
      const writerTab = tab as WriterTab;
      return <WriterPane key={tab.id} tab={writerTab} localContent={localContent || ""} project={project} onContentChange={onContentChange} />;
    }
  };

  if (splitMode === "none" || !splitTab) {
    return (
      <div className={className}>
        {renderPane(
          activeTab,
          true,
          activeTab.type === "writer" ? parentLocalContent : undefined,
          activeTab.type === "writer" ? parentActiveProject : undefined,
          activeTab.type === "writer" ? parentOnContentChange : undefined,
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup className={cn("flex h-full w-full", className)}>
      <ResizablePanel defaultSize={panelSizes[0]} minSize={20}>
        <div className="h-full w-full overflow-hidden">
          {renderPane(
            activeTab,
            true,
            activeTab.type === "writer" ? parentLocalContent : undefined,
            activeTab.type === "writer" ? parentActiveProject : undefined,
            activeTab.type === "writer" ? parentOnContentChange : undefined,
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={panelSizes[1]} minSize={20}>
        <div className="h-full w-full overflow-hidden">
          {renderPane(
            splitTab,
            false,
            splitTab.type === "writer" ? splitLocalContent : undefined,
            splitTab.type === "writer" ? splitProject : undefined,
            splitTab.type === "writer" ? handleSplitContentChange : undefined,
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

interface WriterPaneProps {
  tab: WriterTab;
  localContent: string;
  project: any;
  onContentChange?: (content: string) => void;
}

function WriterPane({ tab, localContent, project, onContentChange }: WriterPaneProps) {
  if (!project) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading project...</div>;
  }

  return <WriterEditorPane projectId={tab.projectId} content={localContent} onContentChange={onContentChange ?? (() => {})} className="h-full" />;
}
