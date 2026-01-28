import { useCallback, useState, useEffect } from "react";
import {
  useWorkspaceTabsStore,
  type ReaderTab,
  type WriterTab,
  type WorkspaceTab,
} from "@/lib/stores/workspace-tabs-store";
import { ReaderPane } from "@/components/reader/reader-pane";
import { WriterEditorPane, WorkspacePanel } from "@/components/writer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";

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
    panelSizes,
    workspacePanelOpen,
    workspacePanelSize,
    updateReaderTabPage,
    updateTabTitle,
    setWriterTabDirty,
    setPanelSizes,
    setWorkspacePanelSize,
  } = useWorkspaceTabsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const splitTab = splitTabId ? tabs.find((t) => t.id === splitTabId) : null;

  // For split tab that's a writer, we need separate local content
  const [splitLocalContent, setSplitLocalContent] = useState<string>("");
  const { data: splitProject } = useWritingProject(
    splitTab?.type === "writer" ? (splitTab as WriterTab).projectId : null,
  );

  // Sync split project content
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
      // Only call parent callback for active tab
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
    },
    [splitTabId, setWriterTabDirty],
  );

  if (!activeTab) {
    return null;
  }

  // Render a single pane (reader or writer)
  const renderPane = (
    tab: WorkspaceTab,
    isActive: boolean,
    localContent?: string,
    project?: any,
    onContentChange?: (content: string) => void,
  ) => {
    if (tab.type === "reader") {
      const readerTab = tab as ReaderTab;
      return (
        <ReaderPane
          key={tab.id}
          uploadId={readerTab.uploadId}
          tabId={tab.id}
          isActive={isActive}
          showHeader={true}
          onPageChange={handlePageChange(tab.id)}
          onTitleLoad={handleTitleLoad(tab.id)}
        />
      );
    } else {
      const writerTab = tab as WriterTab;
      return (
        <WriterPaneWithWorkspace
          key={tab.id}
          tab={writerTab}
          localContent={localContent || ""}
          project={project}
          onContentChange={onContentChange}
          workspacePanelOpen={workspacePanelOpen}
          workspacePanelSize={workspacePanelSize}
          setWorkspacePanelSize={setWorkspacePanelSize}
        />
      );
    }
  };

  // Single view mode
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

  // Split view mode - can mix reader and writer panes
  return (
    <ResizablePanelGroup
      className={className}
      onLayoutChange={(layout) => {
        const sizes = Object.values(layout);
        setPanelSizes(sizes);
      }}
    >
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

// Helper component to render writer pane with optional workspace panel
interface WriterPaneWithWorkspaceProps {
  tab: WriterTab;
  localContent: string;
  project: any;
  onContentChange?: (content: string) => void;
  workspacePanelOpen: boolean;
  workspacePanelSize: number[];
  setWorkspacePanelSize: (sizes: number[]) => void;
}

function WriterPaneWithWorkspace({
  tab,
  localContent,
  project,
  onContentChange,
  workspacePanelOpen,
  workspacePanelSize,
  setWorkspacePanelSize,
}: WriterPaneWithWorkspaceProps) {
  const updateProject = useUpdateWritingProject();

  if (!project) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading project...</div>;
  }

  return (
    <ResizablePanelGroup
      onLayoutChange={(layout) => {
        const sizes = Object.values(layout);
        setWorkspacePanelSize(sizes);
      }}
    >
      <ResizablePanel defaultSize={workspacePanelOpen ? workspacePanelSize[0] : 100} minSize={40}>
        <WriterEditorPane
          projectId={tab.projectId}
          content={localContent}
          onContentChange={onContentChange ?? (() => {})}
          className="h-full"
        />
      </ResizablePanel>
      {workspacePanelOpen && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={workspacePanelSize[1]} minSize={20} maxSize={50}>
            <WorkspacePanel
              projectId={tab.projectId}
              linkedUploads={project?.uploads || []}
              linkedHighlights={project?.highlights || []}
              linkedBookmarks={project?.bookmarks || []}
              linkedNotes={project?.notes || []}
              onLinkUpload={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    uploads: [...(project?.uploads || []), id],
                  },
                })
              }
              onUnlinkUpload={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    uploads: (project?.uploads || []).filter((u: string) => u !== id),
                  },
                })
              }
              onLinkHighlight={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    highlights: [...(project?.highlights || []), id],
                  },
                })
              }
              onUnlinkHighlight={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    highlights: (project?.highlights || []).filter((h: string) => h !== id),
                  },
                })
              }
              onLinkBookmark={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    bookmarks: [...(project?.bookmarks || []), id],
                  },
                })
              }
              onUnlinkBookmark={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    bookmarks: (project?.bookmarks || []).filter((b: string) => b !== id),
                  },
                })
              }
              onLinkNote={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    notes: [...(project?.notes || []), id],
                  },
                })
              }
              onUnlinkNote={(id) =>
                updateProject.mutate({
                  id: tab.projectId,
                  data: {
                    notes: (project?.notes || []).filter((n: string) => n !== id),
                  },
                })
              }
              className="h-full"
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
