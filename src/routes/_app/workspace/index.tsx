import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useCallback, useState } from "react";
import { BookOpen, BookMarked, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";
import { useWritingProject, useWritingProjects } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { SplitWorkspaceView, WorkspaceTabBar } from "@/components/workspace";

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
  const navigate = useNavigate();
  const { id, type } = Route.useSearch();
  const { tabs, activeTabId, addReaderTab, addWriterTab, updateTabTitle, setWriterTabDirty, getTab } =
    useWorkspaceTabsStore();

  const { data: projects } = useWritingProjects();
  const updateProject = useUpdateWritingProject();

  // Get active tab and determine its type
  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const activeWriterTab = activeTab?.type === "writer" ? activeTab : null;

  // Get active project for writer tabs
  const { data: activeProject } = useWritingProject(activeWriterTab?.projectId ?? null);

  // Local content state for debounced saving (writer)
  const [localContent, setLocalContent] = useState<string>("");

  // Sync URL params to tabs
  useEffect(() => {
    if (id && type === "upload") {
      addReaderTab(id, "Loading...");
    } else if (id && type === "project") {
      const project = projects?.find((p) => p.id === id);
      if (project) {
        addWriterTab(id, project.title);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, projects]);

  // Sync active project content to local state
  useEffect(() => {
    if (activeProject) {
      setLocalContent(activeProject.content || "");
    }
  }, [activeProject?.id, activeProject?.content]);

  // Update tab title when project loads
  useEffect(() => {
    if (activeProject && activeTabId) {
      updateTabTitle(activeTabId, activeProject.title);
    }
  }, [activeProject?.title, activeTabId, updateTabTitle]);

  const handleReaderTitleLoad = useCallback(
    (title: string) => {
      if (activeTabId) {
        updateTabTitle(activeTabId, title);
      }
    },
    [activeTabId, updateTabTitle],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (activeTabId) {
        setWriterTabDirty(activeTabId, true);
      }
    },
    [activeTabId, setWriterTabDirty],
  );

  const handleSave = useCallback(async () => {
    if (!activeWriterTab?.projectId) return;

    await updateProject.mutateAsync({
      id: activeWriterTab.projectId,
      data: {
        content: localContent,
      },
    });

    setWriterTabDirty(activeWriterTab.id, false);
  }, [activeWriterTab, localContent, updateProject, setWriterTabDirty]);

  // Keyboard shortcut for save
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

  // No tabs - show empty state
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
            <Button size="lg" onClick={() => navigate({ to: "/documents" })}>
              <BookMarked className="mr-2 h-4 w-4" />
              Browse Documents
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate({ to: "/documents", search: { tab: "projects" } })}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Writing Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Has tabs - show workspace with split view support
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
