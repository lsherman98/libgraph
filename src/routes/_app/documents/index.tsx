import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useUploads, useWritingProjects, useCollections } from "@/lib/api/queries";
import {
  useCreateWritingProject,
  useDeleteWritingProject,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useDeleteUpload,
} from "@/lib/api/mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Pencil,
  Link2,
  Library,
  Search,
} from "lucide-react";
import type { UploadsResponse, CollectionsResponse } from "@/lib/pocketbase-types";
import { WritingProjectsStatusOptions } from "@/lib/pocketbase-types";
import { formatDistanceToNow } from "date-fns";
import { EditUploadDialog } from "@/components/edit-upload-dialog";

type DocumentsSearch = {
  tab?: "documents" | "projects" | "collections";
};

export const Route = createFileRoute("/_app/documents/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): DocumentsSearch => {
    return {
      tab: (search.tab as "documents" | "projects" | "collections") || "documents",
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

function DocumentRow({
  upload,
  onEdit,
  onDelete,
}: {
  upload: UploadsResponse;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const TypeIcon = typeIcons[upload.type] || FileText;
  const status = statusConfig[upload.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;

  const isClickable = upload.status === "SUCCESS";
  const linkedCount = upload.upload?.length || 0;

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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">{upload.type}</span>
              {linkedCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  {linkedCount} linked
                </span>
              )}
            </div>
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
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RouteComponent() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const { data: uploads, isLoading: uploadsLoading } = useUploads();
  const { data: projects, isLoading: projectsLoading } = useWritingProjects();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const createProject = useCreateWritingProject();
  const deleteProject = useDeleteWritingProject();
  const createCollection = useCreateCollection();
  const updateCollectionMutation = useUpdateCollection();
  const deleteCollectionMutation = useDeleteCollection();
  const deleteUploadMutation = useDeleteUpload();

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingUpload, setEditingUpload] = useState<UploadsResponse | null>(null);

  // Collections state
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionsResponse | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionUploads, setCollectionUploads] = useState<string[]>([]);
  const [uploadSearch, setUploadSearch] = useState("");

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

  const resetCollectionForm = () => {
    setCollectionName("");
    setCollectionDescription("");
    setCollectionUploads([]);
    setUploadSearch("");
  };

  const handleCreateCollection = () => {
    createCollection.mutate({
      name: collectionName || "Untitled Collection",
      description: collectionDescription || undefined,
      uploads: collectionUploads.length > 0 ? (collectionUploads as any) : undefined,
    });
    setNewCollectionOpen(false);
    resetCollectionForm();
  };

  const handleEditCollection = (collection: CollectionsResponse) => {
    setEditingCollection(collection);
    setCollectionName(collection.name || "");
    setCollectionDescription(collection.description || "");
    setCollectionUploads(
      Array.isArray(collection.uploads) ? collection.uploads : collection.uploads ? [collection.uploads] : [],
    );
  };

  const handleSaveCollection = () => {
    if (!editingCollection) return;
    updateCollectionMutation.mutate({
      id: editingCollection.id,
      data: {
        name: collectionName || "Untitled Collection",
        description: collectionDescription || undefined,
        uploads: collectionUploads.length > 0 ? (collectionUploads as any) : undefined,
      },
    });
    setEditingCollection(null);
    resetCollectionForm();
  };

  const toggleUploadInCollection = (uploadId: string) => {
    setCollectionUploads((prev) =>
      prev.includes(uploadId) ? prev.filter((id) => id !== uploadId) : [...prev, uploadId],
    );
  };

  const successUploads = uploads?.filter((u) => u.status === "SUCCESS") || [];

  return (
    <div className="p-6 w-full">
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ to: "/documents", search: { tab: value as "documents" | "projects" | "collections" } })
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
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads?.map((upload) => (
                    <DocumentRow
                      key={upload.id}
                      upload={upload}
                      onEdit={() => setEditingUpload(upload)}
                      onDelete={() => {
                        if (
                          confirm(
                            "Are you sure you want to delete this document? This will also remove its graph data and indexed content.",
                          )
                        ) {
                          deleteUploadMutation.mutate(upload.id);
                        }
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <EditUploadDialog
            upload={editingUpload}
            open={!!editingUpload}
            onOpenChange={(open) => {
              if (!open) setEditingUpload(null);
            }}
          />
        </TabsContent>

        <TabsContent value="collections" className="mt-0">
          <div className="flex items-center justify-end mb-4">
            <Dialog
              open={newCollectionOpen}
              onOpenChange={(open) => {
                setNewCollectionOpen(open);
                if (!open) resetCollectionForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Collection
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Collection</DialogTitle>
                  <DialogDescription>Group documents together to quickly set context for AI chat.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="col-name">Name</Label>
                    <Input
                      id="col-name"
                      placeholder="e.g. Biology Research, ML Papers"
                      value={collectionName}
                      onChange={(e) => setCollectionName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="col-desc">Description (optional)</Label>
                    <Textarea
                      id="col-desc"
                      placeholder="What is this collection for?"
                      value={collectionDescription}
                      onChange={(e) => setCollectionDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Documents ({collectionUploads.length} selected)</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search documents..."
                        value={uploadSearch}
                        onChange={(e) => setUploadSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="p-2 space-y-1">
                        {successUploads
                          .filter(
                            (u) => !uploadSearch || (u.title || "").toLowerCase().includes(uploadSearch.toLowerCase()),
                          )
                          .map((upload) => (
                            <label
                              key={upload.id}
                              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent cursor-pointer"
                            >
                              <Checkbox
                                checked={collectionUploads.includes(upload.id)}
                                onCheckedChange={() => toggleUploadInCollection(upload.id)}
                              />
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate">{upload.title || "Untitled"}</span>
                            </label>
                          ))}
                        {successUploads.filter(
                          (u) => !uploadSearch || (u.title || "").toLowerCase().includes(uploadSearch.toLowerCase()),
                        ).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No documents found</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewCollectionOpen(false);
                      resetCollectionForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCollection} disabled={!collectionName.trim()}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Edit collection dialog */}
          <Dialog
            open={!!editingCollection}
            onOpenChange={(open) => {
              if (!open) {
                setEditingCollection(null);
                resetCollectionForm();
              }
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Collection</DialogTitle>
                <DialogDescription>Update collection details and documents.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-col-name">Name</Label>
                  <Input
                    id="edit-col-name"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-col-desc">Description (optional)</Label>
                  <Textarea
                    id="edit-col-desc"
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Documents ({collectionUploads.length} selected)</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search documents..."
                      value={uploadSearch}
                      onChange={(e) => setUploadSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <ScrollArea className="h-48 rounded-md border">
                    <div className="p-2 space-y-1">
                      {successUploads
                        .filter(
                          (u) => !uploadSearch || (u.title || "").toLowerCase().includes(uploadSearch.toLowerCase()),
                        )
                        .map((upload) => (
                          <label
                            key={upload.id}
                            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={collectionUploads.includes(upload.id)}
                              onCheckedChange={() => toggleUploadInCollection(upload.id)}
                            />
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{upload.title || "Untitled"}</span>
                          </label>
                        ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCollection(null);
                    resetCollectionForm();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveCollection} disabled={!collectionName.trim()}>
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {collectionsLoading ? (
            <CollectionsTableSkeleton />
          ) : collections?.length === 0 ? (
            <CollectionsEmptyState onCreateClick={() => setNewCollectionOpen(true)} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collections?.map((collection) => {
                const uploadCount = Array.isArray(collection.uploads)
                  ? collection.uploads.length
                  : collection.uploads
                    ? 1
                    : 0;
                return (
                  <Card key={collection.id} className="group relative">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Library className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{collection.name || "Untitled"}</h3>
                            {collection.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {collection.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleEditCollection(collection)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => {
                              if (confirm("Delete this collection? Documents won't be removed.")) {
                                deleteCollectionMutation.mutate(collection.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {uploadCount} document{uploadCount !== 1 ? "s" : ""}
                        </span>
                        <span>Updated {formatDistanceToNow(new Date(collection.updated), { addSuffix: true })}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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

function CollectionsTableSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex gap-4 mt-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CollectionsEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Library className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="mb-2">No collections yet</CardTitle>
        <CardDescription className="text-center mb-6 max-w-sm">
          Create a collection to group documents together. Use collections as shortcuts to set AI chat context
          instantly.
        </CardDescription>
        <Button onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          New Collection
        </Button>
      </CardContent>
    </Card>
  );
}
