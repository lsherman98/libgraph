import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { FileText, PenLine } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useUploads, useWritingProjects } from "@/lib/api/queries";
import type { UploadsResponse, WritingProjectsResponse } from "@/lib/pocketbase-types";

interface NewTabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "documents" | "projects";
}

export function NewTabDialog({ open, onOpenChange, initialTab = "documents" }: NewTabDialogProps) {
  const navigate = useNavigate();
  const { data: uploads } = useUploads();
  const { data: projects } = useWritingProjects();

  const handleSelectUpload = (upload: UploadsResponse) => {
    onOpenChange(false);
    navigate({ to: "/workspace", search: { id: upload.id, type: "upload" } });
  };

  const handleSelectProject = (project: WritingProjectsResponse) => {
    onOpenChange(false);
    navigate({ to: "/workspace", search: { id: project.id, type: "project" } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-150 p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Open New Tab</DialogTitle>
          <DialogDescription>Select a document or writing project to open in a new tab.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab} key={initialTab} className="w-full">
          <div className="px-4 pb-2">
            <TabsList>
              <TabsTrigger value="documents">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="projects">
                <PenLine className="h-4 w-4" />
                Writing Projects
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="documents" className="m-0 border-t-0 p-0">
            <Command className="border-t-0 rounded-none shadow-none">
              <CommandInput placeholder="Search documents..." className="border-none focus:ring-0" />
              <CommandList className="max-h-75">
                <CommandEmpty>No documents found.</CommandEmpty>
                <CommandGroup>
                  {uploads?.map((upload) => (
                    <CommandItem
                      key={upload.id}
                      value={upload.title || "Untitled"}
                      onSelect={() => handleSelectUpload(upload)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      <span>{upload.title || "Untitled"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>

          <TabsContent value="projects" className="m-0 border-t-0 p-0">
            <Command className="border-t-0 rounded-none shadow-none">
              <CommandInput placeholder="Search projects..." className="border-none focus:ring-0" />
              <CommandList className="max-h-75">
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup>
                  {projects?.map((project) => (
                    <CommandItem
                      key={project.id}
                      value={project.title || "Untitled"}
                      onSelect={() => handleSelectProject(project)}
                    >
                      <PenLine className="mr-2 h-4 w-4" />
                      <span>{project.title || "Untitled"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
