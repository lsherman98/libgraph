import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { AnnotationsPanel } from "@/components/reader/annotations-panel";
import { Highlighter, Layers, BookMarked, Pencil, Bot } from "lucide-react";
import { ReaderAiChatPanel } from "@/components/reader/reader-ai-chat-panel";
import { useWorkspaceTabsStore, type WriterTab, type ReaderTab } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject, useHighlights, useBookmarks, useNotes } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { WorkspacePanel } from "./workspace";
import { cn } from "@/lib/utils";

interface RightSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPageId?: string;
  currentPageNumber?: number;
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

export function RightSidebar({ currentPageId, currentPageNumber, onNavigateToPage, ...props }: RightSidebarProps) {
  const { activeTabId, splitMode, splitTabId, focusedPane, getTab } = useWorkspaceTabsStore();

  const { setOpenRight } = useSidebar();
  const updateProject = useUpdateWritingProject();

  const location = useLocation();
  const isWorkspaceRoute = location.pathname.startsWith("/workspace");

  const focusedTabId = splitMode === "horizontal" && splitTabId && focusedPane === "secondary" ? splitTabId : activeTabId;
  const focusedTab = focusedTabId ? getTab(focusedTabId) : null;
  const isWriterTab = focusedTab?.type === "writer";
  const readerTab = focusedTab?.type === "reader" ? (focusedTab as ReaderTab) : null;
  const writerTab = isWriterTab ? (focusedTab as WriterTab) : null;

  const { data: project } = useWritingProject(writerTab?.projectId);
  const { data: allHighlights = [] } = useHighlights(readerTab?.uploadId);
  const { data: allBookmarks = [] } = useBookmarks(readerTab?.uploadId);
  const { data: allNotes = [] } = useNotes(readerTab?.uploadId);

  const annotationTab = useReaderStore((state) => state.annotationTab);
  const setAnnotationTab = useReaderStore((state) => state.setAnnotationTab);

  useEffect(() => {
    if (!isWorkspaceRoute || !focusedTab) {
      setOpenRight(false);
    }
  }, [isWorkspaceRoute, focusedTab, setOpenRight]);

  if (!isWorkspaceRoute || !focusedTab) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarContent className="p-0" />
      </Sidebar>
    );
  }

  if (isWriterTab && writerTab) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader className="border-b p-0 gap-0">
          <SidebarMenu className="gap-0">
            <SidebarMenuItem className="flex h-11.75 items-center gap-2 px-3">
              <Layers className="h-4 w-4" />
              <span className="font-semibold text-sm">Workspace</span>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <WorkspacePanel
            projectId={writerTab.projectId}
            linkedUploads={project?.uploads || []}
            linkedHighlights={project?.highlights || []}
            linkedBookmarks={project?.bookmarks || []}
            linkedNotes={project?.notes || []}
            onUnlinkUpload={(id: string) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  uploads: (project?.uploads || []).filter((u: string) => u !== id),
                },
              })
            }
            onUnlinkHighlight={(id: string) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  highlights: (project?.highlights || []).filter((h: string) => h !== id),
                },
              })
            }
            onUnlinkBookmark={(id: string) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  bookmarks: (project?.bookmarks || []).filter((b: string) => b !== id),
                },
              })
            }
            onUnlinkNote={(id: string) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  notes: (project?.notes || []).filter((n: string) => n !== id),
                },
              })
            }
            className="border-l-0"
          />
        </SidebarContent>
      </Sidebar>
    );
  }

  const getHeaderContent = () => {
    return (
      <Tabs value={annotationTab} onValueChange={(v) => setAnnotationTab(v as "highlights" | "bookmarks" | "notes" | "ai")} className="w-full gap-0">
        <TabsList className="h-12 w-full rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="ai"
            className="h-full flex-1 gap-1 rounded-none border-0 border-r border-border px-2 text-xs shadow-none data-[state=active]:border-b data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:shadow-none"
          >
            <Bot className="h-3.5 w-3.5" />
            Chat
          </TabsTrigger>
          <TabsTrigger
            value="highlights"
            className="h-full flex-1 gap-1 rounded-none border-0 border-r border-border px-2 text-xs shadow-none data-[state=active]:border-b data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:shadow-none"
          >
            <Highlighter className="h-3.5 w-3.5" />
            Highlights
            {(allHighlights ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allHighlights ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="bookmarks"
            className="h-full flex-1 gap-1 rounded-none border-0 border-r border-border px-2 text-xs shadow-none data-[state=active]:border-b data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:shadow-none"
          >
            <BookMarked className="h-3.5 w-3.5" />
            Bookmarks
            {(allBookmarks ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allBookmarks ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="h-full flex-1 gap-1 rounded-none border-0 px-2 text-xs shadow-none data-[state=active]:border-b data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:shadow-none"
          >
            <Pencil className="h-3.5 w-3.5" />
            Notes
            {(allNotes ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allNotes ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  };

  const getContent = () => {
    if (annotationTab === "ai") return <ReaderAiChatPanel />;

    return <AnnotationsPanel activeTab={annotationTab} onNavigateToPage={onNavigateToPage} />;
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem className="flex items-center gap-2 px-0">{getHeaderContent()}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className={cn("p-0", annotationTab === "ai" && "overflow-hidden")}>{getContent()}</SidebarContent>
    </Sidebar>
  );
}
