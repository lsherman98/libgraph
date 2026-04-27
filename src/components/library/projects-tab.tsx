import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useWritingProjects } from "@/lib/api/queries";
import { useCreateWritingProject, useDeleteWritingProject, useUpdateWritingProject } from "@/lib/api/mutations";
import { WritingProjectsStatusOptions } from "@/lib/pocketbase-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getUserId } from "@/lib/utils";

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

export function ProjectsTab() {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useWritingProjects();
  const createProject = useCreateWritingProject();
  const updateProject = useUpdateWritingProject();
  const deleteProject = useDeleteWritingProject();

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreateProject = () => {
    createProject.mutate({
      title: newTitle || "Untitled",
      status: WritingProjectsStatusOptions.draft,
      content: "",
      user: getUserId(),
    });
    setNewProjectOpen(false);
    setNewTitle("");
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-end mb-4 shrink-0">
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
      {isLoading ? (
        <ProjectsTableSkeleton />
      ) : projects?.length === 0 ? (
        <ProjectsEmptyState onCreateClick={() => setNewProjectOpen(true)} />
      ) : (
        <Card className="flex flex-col flex-1 min-h-0 overflow-hidden py-0 gap-0">
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%] sticky top-0 z-20 bg-card">Project</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Status</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Updated</TableHead>
                  <TableHead className="w-12 sticky top-0 z-20 bg-card"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects?.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate({ to: "/workspace", search: { id: project.id, type: "project" } })}
                  >
                    <TableCell className="overflow-hidden">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                          <PenLine className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col min-w-0 overflow-hidden flex-1">
                          <span className="font-medium truncate block w-full text-left">{project.title || "Untitled"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={project.status}
                        onValueChange={(value: WritingProjectsStatusOptions) => {
                          updateProject.mutate({ id: project.id, data: { status: value } });
                        }}
                      >
                        <SelectTrigger className="w-30 h-8 capitalize" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent onClick={(e) => e.stopPropagation()}>
                          {Object.values(WritingProjectsStatusOptions).map((status) => (
                            <SelectItem key={status} value={status} className="capitalize">
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDistanceToNow(new Date(project.updated), { addSuffix: true })}</TableCell>
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
          </div>
        </Card>
      )}
    </div>
  );
}
