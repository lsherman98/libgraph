import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useCallback, useState } from "react";
import { PenLine, Plus, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useWriterTabsStore } from "@/lib/stores/writer-tabs-store";
import { useReaderTabsStore } from "@/lib/stores/reader-tabs-store";
import { WriterTabBar, WriterEditorPane, WorkspacePanel } from "@/components/writer";
import { UnifiedTabBar } from "@/components/unified-tab-bar";
import { useWritingProjects, useWritingProject } from "@/lib/api/queries";
import { useCreateWritingProject, useUpdateWritingProject, useDeleteWritingProject } from "@/lib/api/mutations";
import { WritingProjectsStatusOptions } from "@/lib/pocketbase-types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type WriterSearch = {
  projectId?: string;
};

export const Route = createFileRoute("/_app/writer/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): WriterSearch => {
    return {
      projectId: search.projectId as string | undefined,
    };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const { projectId } = Route.useSearch();
  const { tabs, activeTabId, workspacePanelOpen, addTab, updateTabTitle, setTabDirty, getTab } = useWriterTabsStore();

  const { data: projects, isLoading: projectsLoading } = useWritingProjects();
  const createProject = useCreateWritingProject();
  const updateProject = useUpdateWritingProject();
  const deleteProject = useDeleteWritingProject();

  // Get active project
  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const { data: activeProject } = useWritingProject(activeTab?.projectId ?? null);

  // Local content state for debounced saving
  const [localContent, setLocalContent] = useState<string>("");

  // Sync URL projectId to tabs
  useEffect(() => {
    if (projectId) {
      const project = projects?.find((p) => p.id === projectId);
      if (project) {
        addTab(projectId, project.title);
      }
    }
  }, [projectId, projects, addTab]);

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

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (activeTabId) {
        setTabDirty(activeTabId, true);
      }
    },
    [activeTabId, setTabDirty],
  );

  const handleSave = useCallback(async () => {
    if (!activeTab?.projectId) return;

    await updateProject.mutateAsync({
      id: activeTab.projectId,
      data: {
        content: localContent,
      },
    });

    setTabDirty(activeTab.id, false);
  }, [activeTab, localContent, updateProject, setTabDirty]);

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

  const handleAddTab = useCallback(() => {
    // Navigate to writer without projectId to show project list
    navigate({ to: "/writer" });
  }, [navigate]);

  const handleOpenProject = useCallback(
    (projectId: string) => {
      navigate({ to: "/writer", search: { projectId } });
    },
    [navigate],
  );

  // Get reader tabs to determine if we should show unified tab bar
  const readerTabs = useReaderTabsStore((state) => state.tabs);
  const showUnifiedTabs = tabs.length > 0 && readerTabs.length > 0;

  // No project selected and no tabs - show project list
  if (!projectId && tabs.length === 0) {
    return (
      <TooltipProvider>
        <div className="flex flex-1 w-full flex-col h-full">
          <WriterTabBar onAddTab={handleAddTab} />
          <ProjectListView
            projects={projects || []}
            isLoading={projectsLoading}
            onOpen={handleOpenProject}
            onCreate={createProject.mutate}
            onDelete={deleteProject.mutate}
          />
        </div>
      </TooltipProvider>
    );
  }

  // Has tabs - show tabbed editor interface
  if (tabs.length > 0) {
    return (
      <TooltipProvider>
        <div className="h-full w-full flex flex-col overflow-hidden">
          {showUnifiedTabs ? <UnifiedTabBar /> : <WriterTabBar onAddTab={handleAddTab} onSave={handleSave} />}
          <div className="flex-1 min-h-0">
            <ResizablePanelGroup>
              <ResizablePanel defaultSize={workspacePanelOpen ? 70 : 100} minSize={40}>
                {activeTab && activeProject ? (
                  <WriterEditorPane
                    projectId={activeTab.projectId}
                    content={localContent}
                    onContentChange={handleContentChange}
                    className="h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Select a project to start writing
                  </div>
                )}
              </ResizablePanel>
              {workspacePanelOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                    <WorkspacePanel
                      projectId={activeTab?.projectId || ""}
                      linkedUploads={activeProject?.uploads || []}
                      linkedHighlights={activeProject?.highlights || []}
                      linkedBookmarks={activeProject?.bookmarks || []}
                      linkedNotes={activeProject?.notes || []}
                      onLinkUpload={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            uploads: [...(activeProject?.uploads || []), id],
                          },
                        })
                      }
                      onUnlinkUpload={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            uploads: (activeProject?.uploads || []).filter((u) => u !== id),
                          },
                        })
                      }
                      onLinkHighlight={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            highlights: [...(activeProject?.highlights || []), id],
                          },
                        })
                      }
                      onUnlinkHighlight={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            highlights: (activeProject?.highlights || []).filter((h) => h !== id),
                          },
                        })
                      }
                      onLinkBookmark={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            bookmarks: [...(activeProject?.bookmarks || []), id],
                          },
                        })
                      }
                      onUnlinkBookmark={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            bookmarks: (activeProject?.bookmarks || []).filter((b) => b !== id),
                          },
                        })
                      }
                      onLinkNote={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            notes: [...(activeProject?.notes || []), id],
                          },
                        })
                      }
                      onUnlinkNote={(id) =>
                        activeTab &&
                        updateProject.mutate({
                          id: activeTab.projectId,
                          data: {
                            notes: (activeProject?.notes || []).filter((n) => n !== id),
                          },
                        })
                      }
                      className="h-full"
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return null;
}

// Project list view component
interface ProjectListViewProps {
  projects: any[];
  isLoading: boolean;
  onOpen: (projectId: string) => void;
  onCreate: (data: any) => void;
  onDelete: (id: string) => void;
}

function ProjectListView({ projects, isLoading, onOpen, onCreate, onDelete }: ProjectListViewProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = () => {
    onCreate({
      title: newTitle || "Untitled",
      status: WritingProjectsStatusOptions.draft,
      content: "",
    });
    setNewProjectOpen(false);
    setNewTitle("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-2xl font-semibold">Writing Projects</h1>
            <p className="text-muted-foreground">Create and manage your writing projects</p>
          </div>
          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Start a new writing project. You can change these settings later.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter project title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="h-[calc(100%-120px)]">
        <div className="p-6 max-w-4xl mx-auto">
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <PenLine className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
              <p className="text-muted-foreground mb-6">Create your first writing project to get started</p>
              <Button onClick={() => setNewProjectOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors",
                  )}
                  onClick={() => onOpen(project.id)}
                >
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{project.title}</h3>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {project.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {project.excerpt || "No content yet"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {project.word_count > 0 && <span>{project.word_count} words</span>}
                      <span>
                        Updated{" "}
                        {formatDistanceToNow(new Date(project.updated), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Are you sure you want to delete this project?")) {
                        onDelete(project.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
