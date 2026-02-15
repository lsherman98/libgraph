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
import { DocumentInfoPanel } from "@/components/reader/document-info-panel";
import { Highlighter, Layers, PenLine, Bookmark, StickyNote, Info } from "lucide-react";
import { useWorkspaceTabsStore, type WriterTab, type ReaderTab } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePanel } from "./workspace";

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

  const { data: project } = useWritingProject(writerTab?.projectId);
  const updateProject = useUpdateWritingProject();

  const isWorkspaceRoute = location.pathname.startsWith("/workspace");

  const editorState = useReaderStore((state) => state.editorState);

  const isHighlightEditorOpen = editorState?.mode === "pending-highlight" || editorState?.mode === "editing-highlight";
  const isBookmarkEditorOpen = editorState?.mode === "pending-bookmark" || editorState?.mode === "editing-bookmark";
  const isNoteEditorOpen = editorState?.mode === "pending-note" || editorState?.mode === "editing-note";

  const readerTab = activeTab?.type === "reader" ? (activeTab as ReaderTab) : null;
  const readerUploadId = readerTab?.uploadId ?? null;

  const [sidebarTab, setSidebarTab] = useState<"annotations" | "info">("annotations");

  useEffect(() => {
    if (!isWorkspaceRoute) {
      setOpenRight(false);
    }
  }, [isWorkspaceRoute]);

  useEffect(() => {
    if (editorState) {
      setSidebarTab("annotations");
    }
  }, [editorState]);

  if (!isWorkspaceRoute) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarContent className="p-0" />
      </Sidebar>
    );
  }

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

  const getHeaderContent = () => {
    if (isHighlightEditorOpen) {
      return (
        <>
          <PenLine className="h-4 w-4" />
          <span className="font-semibold text-sm">
            {editorState?.mode === "editing-highlight" ? "Edit Highlight" : "New Highlight"}
          </span>
        </>
      );
    }
    if (isBookmarkEditorOpen) {
      return (
        <>
          <Bookmark className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">
            {editorState?.mode === "editing-bookmark" ? "Edit Bookmark" : "New Bookmark"}
          </span>
        </>
      );
    }
    if (isNoteEditorOpen) {
      return (
        <>
          <StickyNote className="h-4 w-4 text-blue-500" />
          <span className="font-semibold text-sm">
            {editorState?.mode === "editing-note" ? "Edit Note" : "New Note"}
          </span>
        </>
      );
    }

    return (
      <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "annotations" | "info")} className="w-full">
        <TabsList className="w-full h-8">
          <TabsTrigger value="annotations" className="flex-1 gap-1 text-xs h-7">
            <Highlighter className="h-3.5 w-3.5" />
            Annotations
          </TabsTrigger>
          <TabsTrigger value="info" className="flex-1 gap-1 text-xs h-7">
            <Info className="h-3.5 w-3.5" />
            Document
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  };

  const getContent = () => {
    if (isHighlightEditorOpen) return <HighlightEditorPanel />;
    if (isBookmarkEditorOpen) return <BookmarkEditorPanel />;
    if (isNoteEditorOpen) return <NoteEditorPanel />;

    if (sidebarTab === "info" && readerUploadId) {
      return <DocumentInfoPanel uploadId={readerUploadId} />;
    }

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
