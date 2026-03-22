import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { AnnotationsPanel } from "@/components/reader/annotations-panel";
import { HighlightEditorPanel } from "@/components/reader/highlight-editor-panel";
import { BookmarkEditorPanel } from "@/components/reader/bookmark-note-editor-panel";
import { NoteEditorPanel } from "@/components/reader/note-editor-panel";
import { Highlighter, Layers, PenLine, Bookmark, BookMarked, StickyNote, Pencil, Bot } from "lucide-react";
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

  const { data: project } = useWritingProject(writerTab?.projectId || "");
  const { data: allHighlights = [] } = useHighlights(readerTab?.uploadId || "");
  const { data: allBookmarks = [] } = useBookmarks(readerTab?.uploadId || "");
  const { data: allNotes = [] } = useNotes(readerTab?.uploadId || "");

  const annotationTab = useReaderStore((state) => state.annotationTab);
  const setAnnotationTab = useReaderStore((state) => state.setAnnotationTab);
  const editorState = useReaderStore((state) => state.editorState);
  const isHighlightEditorOpen = editorState?.mode === "pending-highlight" || editorState?.mode === "editing-highlight";
  const isBookmarkEditorOpen = editorState?.mode === "pending-bookmark" || editorState?.mode === "editing-bookmark";
  const isNoteEditorOpen = editorState?.mode === "pending-note" || editorState?.mode === "editing-note";

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
          <span className="font-semibold text-sm">{editorState?.mode === "editing-highlight" ? "Edit Highlight" : "New Highlight"}</span>
        </>
      );
    }
    if (isBookmarkEditorOpen) {
      return (
        <>
          <Bookmark className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">{editorState?.mode === "editing-bookmark" ? "Edit Bookmark" : "New Bookmark"}</span>
        </>
      );
    }
    if (isNoteEditorOpen) {
      return (
        <>
          <StickyNote className="h-4 w-4 text-blue-500" />
          <span className="font-semibold text-sm">{editorState?.mode === "editing-note" ? "Edit Note" : "New Note"}</span>
        </>
      );
    }

    return (
      <Tabs value={annotationTab} onValueChange={(v) => setAnnotationTab(v as "highlights" | "bookmarks" | "notes" | "ai")} className="w-full">
        <TabsList className="w-full h-8">
          <TabsTrigger value="highlights" className="flex-1 gap-1 text-xs h-7">
            <Highlighter className="h-3.5 w-3.5" />
            Highlights
            {(allHighlights ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allHighlights ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="flex-1 gap-1 text-xs h-7">
            <BookMarked className="h-3.5 w-3.5" />
            Bookmarks
            {(allBookmarks ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allBookmarks ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1 gap-1 text-xs h-7">
            <Pencil className="h-3.5 w-3.5" />
            Notes
            {(allNotes ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {(allNotes ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1 gap-1 text-xs h-7">
            <Bot className="h-3.5 w-3.5" />
            AI
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  };

  const getContent = () => {
    if (isHighlightEditorOpen) return <HighlightEditorPanel />;
    if (isBookmarkEditorOpen) return <BookmarkEditorPanel />;
    if (isNoteEditorOpen) return <NoteEditorPanel />;
    if (annotationTab === "ai") return <ReaderAiChatPanel />;

    return <AnnotationsPanel activeTab={annotationTab} onNavigateToPage={onNavigateToPage} />;
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 px-2">{getHeaderContent()}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className={cn("p-0", annotationTab === "ai" && "overflow-hidden")}>{getContent()}</SidebarContent>
    </Sidebar>
  );
}
