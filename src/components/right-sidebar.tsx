import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { AnnotationsPanel } from "@/components/reader/annotations-panel";
import { WorkspacePanel } from "@/components/writer";
import { Highlighter, Layers } from "lucide-react";
import { useWorkspaceTabsStore, type WriterTab } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";

interface RightSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPageId?: string;
  currentPageNumber?: number;
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

export function RightSidebar({ currentPageId, currentPageNumber, onNavigateToPage, ...props }: RightSidebarProps) {
  const { tabs, activeTabId, getTab } = useWorkspaceTabsStore();
  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const isWriterTab = activeTab?.type === "writer";
  const writerTab = isWriterTab ? (activeTab as WriterTab) : null;

  const { data: project } = useWritingProject(writerTab?.projectId ?? null);
  const updateProject = useUpdateWritingProject();

  // Show workspace panel for writer tabs, annotations panel for reader tabs
  if (isWriterTab && writerTab) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader className="border-b">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2 px-2 py-1.5">
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
            onLinkUpload={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  uploads: [...(project?.uploads || []), id],
                },
              })
            }
            onUnlinkUpload={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  uploads: (project?.uploads || []).filter((u: string) => u !== id),
                },
              })
            }
            onLinkHighlight={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  highlights: [...(project?.highlights || []), id],
                },
              })
            }
            onUnlinkHighlight={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  highlights: (project?.highlights || []).filter((h: string) => h !== id),
                },
              })
            }
            onLinkBookmark={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  bookmarks: [...(project?.bookmarks || []), id],
                },
              })
            }
            onUnlinkBookmark={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  bookmarks: (project?.bookmarks || []).filter((b: string) => b !== id),
                },
              })
            }
            onLinkNote={(id) =>
              updateProject.mutate({
                id: writerTab.projectId,
                data: {
                  notes: [...(project?.notes || []), id],
                },
              })
            }
            onUnlinkNote={(id) =>
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

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 px-2 py-1.5">
            <Highlighter className="h-4 w-4" />
            <span className="font-semibold text-sm">Annotations</span>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="p-0">
        <AnnotationsPanel
          currentPageId={currentPageId}
          currentPageNumber={currentPageNumber}
          onNavigateToPage={onNavigateToPage}
        />
      </SidebarContent>
    </Sidebar>
  );
}
