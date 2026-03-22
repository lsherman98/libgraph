import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useCallback, useState, useRef } from "react";
import { BookOpen, BookMarked, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject, useWritingProjects } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { SplitWorkspaceView, WorkspaceTabBar } from "@/components/workspace";
import { NewTabDialog } from "@/components/workspace/new-tab-dialog";
import { useWorkspaceTabsSync } from "@/lib/hooks/use-workspace-tabs-sync";

type WorkspaceSearch = {
  id?: string;
  type?: "upload" | "project";
};

export const Route = createFileRoute("/_app/workspace/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => {
    return {
      id: search.id as string | undefined,
      type: search.type as "upload" | "project" | undefined,
    };
  },
});

function RouteComponent() {
  const { id, type } = Route.useSearch();
  const { tabs, activeTabId, addReaderTab, addWriterTab, updateTabTitle, setWriterTabDirty, getTab } = useWorkspaceTabsStore();

  useWorkspaceTabsSync();

  const { data: projects } = useWritingProjects();
  const updateProject = useUpdateWritingProject();

  const [newTabOpen, setNewTabOpen] = useState(false);
  const [initialDialogTab, setInitialDialogTab] = useState<"documents" | "projects">("documents");

  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const activeWriterTab = activeTab?.type === "writer" ? activeTab : null;

  const { data: activeProject } = useWritingProject(activeWriterTab?.projectId);

  const [localContent, setLocalContent] = useState<string>("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (id && type === "upload") {
      addReaderTab(id, "Loading...");
    } else if (id && type === "project") {
      const project = projects?.find((p) => p.id === id);
      if (project) {
        addWriterTab(id, project.title);
      }
    }
  }, [id, type, projects]);

  useEffect(() => {
    if (activeProject) {
      setLocalContent(activeProject.content || "");
    }
  }, [activeProject?.id, activeProject?.content]);

  useEffect(() => {
    if (activeWriterTab && activeProject && activeProject.id === activeWriterTab.projectId) {
      updateTabTitle(activeWriterTab.id, activeProject.title);
    }
  }, [activeProject?.id, activeProject?.title, activeWriterTab?.id, activeWriterTab?.projectId, updateTabTitle]);

  const handleReaderTitleLoad = useCallback(
    (title: string) => {
      if (activeTabId) {
        updateTabTitle(activeTabId, title);
      }
    },
    [activeTabId, updateTabTitle],
  );

  const saveContent = useCallback(
    async (content: string) => {
      if (!activeWriterTab?.projectId) return;

      await updateProject.mutateAsync({
        id: activeWriterTab.projectId,
        data: { content },
      });

      setWriterTabDirty(activeWriterTab.id, false);
    },
    [activeWriterTab, updateProject, setWriterTabDirty],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (activeTabId) {
        setWriterTabDirty(activeTabId, true);
      }

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        saveContent(content);
      }, 1000);
    },
    [activeTabId, setWriterTabDirty, saveContent],
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await saveContent(localContent);
  }, [saveContent, localContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 w-full items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Welcome to Your Workspace</h2>
          <p className="text-muted-foreground mb-8">Open a document to read or start a new writing project.</p>
          <div className="flex gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => {
                setInitialDialogTab("documents");
                setNewTabOpen(true);
              }}
            >
              <BookMarked className="mr-2 h-4 w-4" />
              Browse Documents
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setInitialDialogTab("projects");
                setNewTabOpen(true);
              }}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Writing Projects
            </Button>
          </div>
        </div>
        <NewTabDialog open={newTabOpen} onOpenChange={setNewTabOpen} initialTab={initialDialogTab} />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-full w-full flex flex-col overflow-hidden">
        <WorkspaceTabBar onSave={handleSave} />
        <div className="flex-1 min-h-0">
          <SplitWorkspaceView
            className="h-full"
            localContent={localContent}
            activeProject={activeProject}
            onContentChange={handleContentChange}
            onTitleLoad={handleReaderTitleLoad}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
