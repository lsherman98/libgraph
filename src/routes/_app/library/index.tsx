import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Library, PenLine } from "lucide-react";
import { DocumentsTab } from "../../../components/library/documents-tab";
import { ProjectsTab } from "../../../components/library/projects-tab";
import { CollectionsTab } from "../../../components/library/collections-tab";

type DocumentsSearch = {
  tab?: "documents" | "projects" | "collections";
};

export const Route = createFileRoute("/_app/library/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): DocumentsSearch => {
    return {
      tab: (search.tab as "documents" | "projects" | "collections") || "documents",
    };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();

  return (
    <div className="p-6 w-full">
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ to: "/library", search: { tab: value as "documents" | "projects" | "collections" } })
        }
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
              <TabsTrigger value="collections" className="gap-2">
                <Library className="h-4 w-4" />
                Collections
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-2">
                <PenLine className="h-4 w-4" />
                Projects
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="documents" className="mt-0">
          <DocumentsTab />
        </TabsContent>
        <TabsContent value="collections" className="mt-0">
          <CollectionsTab />
        </TabsContent>
        <TabsContent value="projects" className="mt-0">
          <ProjectsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
