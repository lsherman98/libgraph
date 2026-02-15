import { useState } from "react";
import { useUploads, useCollections } from "@/lib/api/queries";
import { useCreateCollection, useUpdateCollection, useDeleteCollection } from "@/lib/api/mutations";
import type { CollectionsResponse } from "@/lib/pocketbase-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FileText, Plus, Trash2, Pencil, Library, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getUserRecord } from "@/lib/utils";

function CollectionsGridSkeleton() {
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

function UploadPicker({
  uploads,
  selectedIds,
  onToggle,
  search,
  onSearchChange,
}: {
  uploads: { id: string; title?: string; status: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const filtered = uploads.filter(
    (u) => !search || (u.title || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="grid gap-2">
      <Label>Documents ({selectedIds.length} selected)</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <ScrollArea className="h-48 rounded-md border">
        <div className="p-2 space-y-1">
          {filtered.map((upload) => (
            <label
              key={upload.id}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={selectedIds.includes(upload.id)}
                onCheckedChange={() => onToggle(upload.id)}
              />
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{upload.title || "Untitled"}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No documents found</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function CollectionsTab() {
  const { data: allUploads } = useUploads();
  const { data: collections, isLoading } = useCollections();
  const createCollection = useCreateCollection();
  const updateCollectionMutation = useUpdateCollection();
  const deleteCollectionMutation = useDeleteCollection();

  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionsResponse | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionUploads, setCollectionUploads] = useState<string[]>([]);
  const [uploadSearch, setUploadSearch] = useState("");

  const successUploads = allUploads?.filter((u) => u.status === "SUCCESS") || [];

  const resetForm = () => {
    setCollectionName("");
    setCollectionDescription("");
    setCollectionUploads([]);
    setUploadSearch("");
  };

  const toggleUpload = (uploadId: string) => {
    setCollectionUploads((prev) =>
      prev.includes(uploadId) ? prev.filter((id) => id !== uploadId) : [...prev, uploadId],
    );
  };

  const handleCreate = () => {
    createCollection.mutate({
      name: collectionName || "Untitled Collection",
      description: collectionDescription || undefined,
      uploads: collectionUploads.length > 0 ? (collectionUploads as any) : undefined,
      user: getUserRecord().id,
    });
    setNewCollectionOpen(false);
    resetForm();
  };

  const handleEdit = (collection: CollectionsResponse) => {
    setEditingCollection(collection);
    setCollectionName(collection.name || "");
    setCollectionDescription(collection.description || "");
    setCollectionUploads(
      Array.isArray(collection.uploads) ? collection.uploads : collection.uploads ? [collection.uploads] : [],
    );
  };

  const handleSave = () => {
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
    resetForm();
  };

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <Dialog
          open={newCollectionOpen}
          onOpenChange={(open) => {
            setNewCollectionOpen(open);
            if (!open) resetForm();
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
              <UploadPicker
                uploads={successUploads}
                selectedIds={collectionUploads}
                onToggle={toggleUpload}
                search={uploadSearch}
                onSearchChange={setUploadSearch}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewCollectionOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!collectionName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={!!editingCollection}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCollection(null);
            resetForm();
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
            <UploadPicker
              uploads={successUploads}
              selectedIds={collectionUploads}
              onToggle={toggleUpload}
              search={uploadSearch}
              onSearchChange={setUploadSearch}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingCollection(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!collectionName.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <CollectionsGridSkeleton />
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
                        onClick={() => handleEdit(collection)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={() => deleteCollectionMutation.mutate(collection.id)}
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
    </>
  );
}
