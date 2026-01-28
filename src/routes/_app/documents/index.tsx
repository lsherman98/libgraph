import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useUploads, useWritingProjects } from "@/lib/api/queries";
import { useCreateWritingProject, useDeleteWritingProject } from "@/lib/api/mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookText,
  FileText,
  Headphones,
  Video,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import type { UploadsResponse } from "@/lib/pocketbase-types";
import { WritingProjectsStatusOptions } from "@/lib/pocketbase-types";
import { formatDistanceToNow } from "date-fns";

type DocumentsSearch = {
  tab?: "documents" | "projects";
};

export const Route = createFileRoute("/_app/documents/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): DocumentsSearch => {
    return {
      tab: (search.tab as "documents" | "projects") || "documents",
    };
  },
});

const typeIcons: Record<string, typeof FileText> = {
  book: BookText,
  article: FileText,
  podcast: Headphones,
  lecture: Video,
};

const statusConfig = {
  SUCCESS: {
    icon: CheckCircle2,
    variant: "default" as const,
    label: "Processed",
    className: "text-green-600 dark:text-green-400",
  },
  PROCESSING: {
    icon: Loader2,
    variant: "secondary" as const,
    label: "Processing",
    className: "text-blue-600 dark:text-blue-400 animate-spin",
  },
  PENDING: {
    icon: Clock,
    variant: "outline" as const,
    label: "Pending",
    className: "text-yellow-600 dark:text-yellow-400",
  },
  FAILED: {
    icon: AlertCircle,
    variant: "destructive" as const,
    label: "Failed",
    className: "text-red-600 dark:text-red-400",
  },
};

function DocumentsTableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-50" />
            <Skeleton className="h-3 w-25" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="mb-2">No documents yet</CardTitle>
        <CardDescription className="text-center mb-6 max-w-sm">
          Upload your first document to get started. We support books, articles, podcasts, and lectures.
        </CardDescription>
        <Button asChild>
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ upload }: { upload: UploadsResponse }) {
  const navigate = useNavigate();
  const TypeIcon = typeIcons[upload.type] || FileText;
  const status = statusConfig[upload.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;

  const isClickable = upload.status === "SUCCESS";

  return (
    <TableRow
      className={isClickable ? "cursor-pointer hover:bg-muted/50" : "opacity-75"}
      onClick={() => {
        if (isClickable) {
          navigate({ to: "/workspace", search: { id: upload.id, type: "upload" } });
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium">{upload.title || "Untitled"}</span>
            <span className="text-xs text-muted-foreground capitalize">{upload.type}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${status.className}`} />
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(upload.created).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </TableCell>
    </TableRow>
  );
}

function RouteComponent() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const { data: uploads, isLoading: uploadsLoading } = useUploads();
  const { data: projects, isLoading: projectsLoading } = useWritingProjects();
  const createProject = useCreateWritingProject();
  const deleteProject = useDeleteWritingProject();

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreateProject = () => {
    createProject.mutate({
      title: newTitle || "Untitled",
      status: WritingProjectsStatusOptions.draft,
      content: "",
    });
    setNewProjectOpen(false);
    setNewTitle("");
  };

  const handleOpenProject = (projectId: string) => {
    navigate({ to: "/workspace", search: { id: projectId, type: "project" } });
  };

  return (
    <div className="p-6 w-full">
      <Tabs
        value={tab}
        onValueChange={(value) => navigate({ to: "/documents", search: { tab: value as "documents" | "projects" } })}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Library</h1>
            <p className="text-muted-foreground mt-1">Manage your documents and writing projects</p>
          </div>
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-2">
                <PenLine className="h-4 w-4" />
                Projects
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="documents" className="mt-0">
          <div className="flex items-center justify-end mb-4">
            <Button asChild>
              <Link to="/upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Link>
            </Button>
          </div>
          {uploadsLoading ? (
            <DocumentsTableSkeleton />
          ) : uploads?.length === 0 ? (
            <EmptyState />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads?.map((upload) => (
                    <DocumentRow key={upload.id} upload={upload} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-0">
          <div className="flex items-center justify-end mb-4">
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
                  <DialogDescription>
                    Start a new writing project. You can change these settings later.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Enter project title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCreateProject();
                        }
                      }}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateProject}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {projectsLoading ? (
            <ProjectsTableSkeleton />
          ) : projects?.length === 0 ? (
            <ProjectsEmptyState onCreateClick={() => setNewProjectOpen(true)} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.map((project) => (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenProject(project.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <PenLine className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{project.title || "Untitled"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(project.updated), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Are you sure you want to delete this project?")) {
                              deleteProject.mutate(project.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectsTableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-50" />
            <Skeleton className="h-3 w-25" />
          </div>
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function ProjectsEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <PenLine className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="mb-2">No writing projects yet</CardTitle>
        <CardDescription className="text-center mb-6 max-w-sm">
          Create your first writing project to start composing with your research materials.
        </CardDescription>
        <Button onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </CardContent>
    </Card>
  );
}
