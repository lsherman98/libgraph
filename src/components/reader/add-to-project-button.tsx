import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderPlus, Check, Loader2, PenLine } from "lucide-react";
import { useWritingProjects } from "@/lib/api/queries";
import { useUpdateWritingProject } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";

type ItemType = "upload" | "highlight" | "bookmark" | "note";

interface AddToProjectButtonProps {
  itemId: string;
  itemType: ItemType;
  variant?: "icon" | "default";
  className?: string;
}

export function AddToProjectButton({ itemId, itemType, variant = "icon", className }: AddToProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const { data: projects = [], isLoading } = useWritingProjects();
  const updateProject = useUpdateWritingProject();

  // Get the field name for this item type
  const getFieldName = (): "uploads" | "highlights" | "bookmarks" | "notes" => {
    switch (itemType) {
      case "upload":
        return "uploads";
      case "highlight":
        return "highlights";
      case "bookmark":
        return "bookmarks";
      case "note":
        return "notes";
    }
  };

  // Check if item is already in a project
  const getProjectsContainingItem = () => {
    const fieldName = getFieldName();
    return projects.filter((p) => {
      const items = (p as any)[fieldName] as string[] | undefined;
      return items?.includes(itemId);
    });
  };

  const projectsWithItem = getProjectsContainingItem();
  const isInAnyProject = projectsWithItem.length > 0;

  const handleAddToProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const fieldName = getFieldName();
    const currentItems = ((project as any)[fieldName] as string[]) || [];

    // Toggle - if already in project, remove it
    if (currentItems.includes(itemId)) {
      updateProject.mutate({
        id: projectId,
        data: {
          [fieldName]: currentItems.filter((id: string) => id !== itemId),
        },
      });
    } else {
      updateProject.mutate({
        id: projectId,
        data: {
          [fieldName]: [...currentItems, itemId],
        },
      });
    }
  };

  if (variant === "icon") {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", isInAnyProject && "text-primary", className)}
            title={isInAnyProject ? "In project(s)" : "Add to project"}
          >
            <FolderPlus className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Add to Writing Project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              <PenLine className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p>No writing projects yet</p>
              <p className="mt-1">Create one in the Library</p>
            </div>
          ) : (
            projects.map((project) => {
              const fieldName = getFieldName();
              const isInProject = ((project as any)[fieldName] as string[] | undefined)?.includes(itemId);
              return (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleAddToProject(project.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-sm border",
                        isInProject ? "bg-primary border-primary" : "border-muted-foreground/30",
                      )}
                    >
                      {isInProject && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="flex-1 truncate">{project.title || "Untitled"}</span>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(isInAnyProject && "border-primary text-primary", className)}>
          <FolderPlus className="h-3 w-3 mr-1" />
          {isInAnyProject ? "In Project" : "Add to Project"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Add to Writing Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            <PenLine className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p>No writing projects yet</p>
            <p className="mt-1">Create one in the Library</p>
          </div>
        ) : (
          projects.map((project) => {
            const fieldName = getFieldName();
            const isInProject = ((project as any)[fieldName] as string[] | undefined)?.includes(itemId);
            return (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleAddToProject(project.id)}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <div
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border",
                      isInProject ? "bg-primary border-primary" : "border-muted-foreground/30",
                    )}
                  >
                    {isInProject && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className="flex-1 truncate">{project.title || "Untitled"}</span>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
