import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AnnotationsPanel } from "@/components/reader/annotations-panel";
import { HighlightEditorPanel } from "@/components/reader/highlight-editor-panel";
import { BookmarkEditorPanel, NoteEditorPanel } from "@/components/reader/bookmark-note-editor-panel";
import { WorkspacePanel } from "@/components/writer";
import { Highlighter, Layers, PenLine, Bookmark, StickyNote } from "lucide-react";
import { useWorkspaceTabsStore, type WriterTab } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

interface RightSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPageId?: string;
  currentPageNumber?: number;
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

export function RightSidebar({ currentPageId, currentPageNumber, onNavigateToPage, ...props }: RightSidebarProps) {
  const { activeTabId, getTab } = useWorkspaceTabsStore();
  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const isWriterTab = activeTab?.type === "writer";
  const writerTab = isWriterTab ? (activeTab as WriterTab) : null;
  const location = useLocation();
  const { setOpenRight } = useSidebar();

  const { data: project } = useWritingProject(writerTab?.projectId ?? null);
  const updateProject = useUpdateWritingProject();

  // Only show sidebar content when on the workspace route
  const isWorkspaceRoute = location.pathname.startsWith("/workspace");

  // Auto-close the right sidebar when leaving the workspace page
  useEffect(() => {
    if (!isWorkspaceRoute) {
      setOpenRight(false);
    }
  }, [isWorkspaceRoute, setOpenRight]);

  // Show empty sidebar when not on workspace route
  if (!isWorkspaceRoute) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarContent className="p-0" />
      </Sidebar>
    );
  }

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

  const pendingHighlight = useReaderStore((state) => state.pendingHighlight);
  const editingHighlight = useReaderStore((state) => state.editingHighlight);
  const pendingBookmark = useReaderStore((state) => state.pendingBookmark);
  const editingBookmark = useReaderStore((state) => state.editingBookmark);
  const pendingNote = useReaderStore((state) => state.pendingNote);
  const editingNote = useReaderStore((state) => state.editingNote);

  const isHighlightEditorOpen = !!pendingHighlight || !!editingHighlight;
  const isBookmarkEditorOpen = !!pendingBookmark || !!editingBookmark;
  const isNoteEditorOpen = !!pendingNote || !!editingNote;

  // Determine which header to show
  const getHeaderContent = () => {
    if (isHighlightEditorOpen) {
      return (
        <>
          <PenLine className="h-4 w-4" />
          <span className="font-semibold text-sm">{editingHighlight ? "Edit Highlight" : "New Highlight"}</span>
        </>
      );
    }
    if (isBookmarkEditorOpen) {
      return (
        <>
          <Bookmark className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">{editingBookmark ? "Edit Bookmark" : "New Bookmark"}</span>
        </>
      );
    }
    if (isNoteEditorOpen) {
      return (
        <>
          <StickyNote className="h-4 w-4 text-blue-500" />
          <span className="font-semibold text-sm">{editingNote ? "Edit Note" : "New Note"}</span>
        </>
      );
    }
    return (
      <>
        <Highlighter className="h-4 w-4" />
        <span className="font-semibold text-sm">Annotations</span>
      </>
    );
  };

  // Determine which content to show
  const getContent = () => {
    if (isHighlightEditorOpen) return <HighlightEditorPanel />;
    if (isBookmarkEditorOpen) return <BookmarkEditorPanel />;
    if (isNoteEditorOpen) return <NoteEditorPanel />;
    return (
      <AnnotationsPanel
        currentPageId={currentPageId}
        currentPageNumber={currentPageNumber}
        onNavigateToPage={onNavigateToPage}
      />
    );
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 px-2">{getHeaderContent()}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="p-0">{getContent()}</SidebarContent>
    </Sidebar>
  );
}
