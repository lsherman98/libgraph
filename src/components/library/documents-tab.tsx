import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useUploads, useTags, useTopics, usePeople, usePublications, useCollections } from "@/lib/api/queries";
import { useDeleteUpload, useUpdateCollection } from "@/lib/api/mutations";
import { useCreateCollection } from "@/lib/api/mutations";
import type { UploadFilters } from "@/lib/api/api";
import type { CollectionsResponse, UploadsResponse } from "@/lib/pocketbase-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Upload, Search, Library, X } from "lucide-react";
import { EditUploadDialog } from "@/components/upload/edit-upload-dialog";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { AdvancedFilters } from "./advanced-filters";
import { DocumentRow } from "./document-row";
import { getUserId } from "@/lib/utils";

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

function DocumentsEmptyState() {
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

export function DocumentsTab() {
  const [filters, setFilters] = useState<UploadFilters>({});
  const [addingToCollectionUpload, setAddingToCollectionUpload] = useState<UploadsResponse | null>(null);
  const debouncedSearch = useDebounce(filters.search, 300);

  const queryFilters = useMemo<UploadFilters>(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);

  const { data: uploads, isLoading } = useUploads(queryFilters);
  const { data: tags } = useTags();
  const { data: topics } = useTopics();
  const { data: people } = usePeople();
  const { data: publications } = usePublications();
  const { data: collections } = useCollections({ enabled: !!addingToCollectionUpload });
  const deleteUploadMutation = useDeleteUpload();
  const createCollectionMutation = useCreateCollection();
  const updateCollectionMutation = useUpdateCollection();

  const [editingUpload, setEditingUpload] = useState<UploadsResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");

  const hasActiveFilters = Object.keys(filters).filter((k) => k !== "sortBy" && k !== "sortOrder" && filters[k as keyof UploadFilters]).length > 0;

  const successUploads = uploads?.filter((u) => u.status === "success") || [];
  const allSelected = successUploads.length > 0 && successUploads.every((u) => selectedIds.has(u.id));
  const someSelected = successUploads.some((u) => selectedIds.has(u.id));
  const filteredCollections = useMemo(() => {
    const term = collectionSearch.trim().toLowerCase();
    if (!term) return collections || [];
    return (collections || []).filter((collection) => (collection.name || "").toLowerCase().includes(term));
  }, [collections, collectionSearch]);
  const personNamesById = useMemo(() => new Map((people || []).map((person) => [person.id, person.name || "Unknown"])), [people]);
  const publicationNamesById = useMemo(
    () => new Map((publications || []).map((publication) => [publication.id, publication.name || "Unknown"])),
    [publications],
  );
  const tagTitlesById = useMemo(() => new Map((tags || []).map((tag) => [tag.id, tag.title || "Untitled"])), [tags]);

  const getCollectionUploadIds = (collection: CollectionsResponse) =>
    Array.isArray(collection.uploads) ? collection.uploads : collection.uploads ? [collection.uploads] : [];

  const isUploadInCollection = (collection: CollectionsResponse, uploadId: string) => getCollectionUploadIds(collection).includes(uploadId);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(successUploads.map((u) => u.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleCollectionMembership = (collection: CollectionsResponse, checked: boolean) => {
    if (!addingToCollectionUpload) return;

    const currentUploadIds = getCollectionUploadIds(collection);
    const nextUploadIds = checked
      ? currentUploadIds.includes(addingToCollectionUpload.id)
        ? currentUploadIds
        : [...currentUploadIds, addingToCollectionUpload.id]
      : currentUploadIds.filter((id) => id !== addingToCollectionUpload.id);

    updateCollectionMutation.mutate({
      id: collection.id,
      data: {
        uploads: nextUploadIds.length > 0 ? (nextUploadIds as any) : undefined,
      },
    });
  };

  const handleCreateCollection = () => {
    createCollectionMutation.mutate(
      {
        name: collectionName || "Untitled Collection",
        description: collectionDescription || undefined,
        uploads: Array.from(selectedIds) as string[],
        user: getUserId(),
      },
      {
        onSuccess: () => {
          setCreateCollectionOpen(false);
          setCollectionName("");
          setCollectionDescription("");
          clearSelection();
        },
      },
    );
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="mb-4 shrink-0">
        <AdvancedFilters
          filters={filters}
          onFiltersChange={setFilters}
          tags={tags || []}
          topics={topics || []}
          people={people || []}
          publications={publications || []}
          actions={
            <>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                  <Button variant="outline" size="sm" onClick={clearSelection}>
                    <X className="mr-1 h-3 w-3" />
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setCreateCollectionOpen(true)}>
                    <Library className="mr-2 h-4 w-4" />
                    Create Collection
                  </Button>
                </>
              )}
              <Button asChild>
                <Link to="/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Link>
              </Button>
            </>
          }
        />
      </div>
      {isLoading ? (
        <DocumentsTableSkeleton />
      ) : uploads?.length === 0 ? (
        hasActiveFilters ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle className="mb-2">No matching documents</CardTitle>
              <CardDescription className="text-center mb-6 max-w-sm">
                No documents match your current filters. Try adjusting or clearing your filters.
              </CardDescription>
              <Button variant="outline" onClick={() => setFilters({})}>
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <DocumentsEmptyState />
        )
      ) : (
        <Card className="overflow-hidden flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto flex-1 min-h-0">
            <Table className="w-full">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10 pr-0">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all documents"
                    />
                  </TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="w-36 hidden lg:table-cell">Author</TableHead>
                  <TableHead className="w-40 hidden xl:table-cell">People</TableHead>
                  <TableHead className="w-32 hidden lg:table-cell">Publication</TableHead>
                  <TableHead className="w-36 hidden xl:table-cell">Tags</TableHead>
                  <TableHead className="w-28 hidden md:table-cell">Created</TableHead>
                  <TableHead className="w-36"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads?.map((upload) => (
                  <DocumentRow
                    key={upload.id}
                    upload={upload}
                    personNamesById={personNamesById}
                    publicationNamesById={publicationNamesById}
                    tagTitlesById={tagTitlesById}
                    selected={selectedIds.has(upload.id)}
                    onSelect={(checked) => toggleSelect(upload.id, checked)}
                    onEdit={() => setEditingUpload(upload)}
                    onDelete={() => {
                      if (confirm("Are you sure you want to delete this document? This will also remove its graph data and indexed content.")) {
                        deleteUploadMutation.mutate(upload.id);
                      }
                    }}
                    onAddToCollection={() => {
                      setAddingToCollectionUpload(upload);
                      setCollectionSearch("");
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <Dialog
        open={createCollectionOpen}
        onOpenChange={(open) => {
          setCreateCollectionOpen(open);
          if (!open) {
            setCollectionName("");
            setCollectionDescription("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new collection with {selectedIds.size} selected document{selectedIds.size !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-col-name">Name</Label>
              <Input
                id="new-col-name"
                placeholder="e.g. Biology Research, ML Papers"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-col-desc">Description (optional)</Label>
              <Textarea
                id="new-col-desc"
                placeholder="What is this collection for?"
                value={collectionDescription}
                onChange={(e) => setCollectionDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateCollectionOpen(false);
                setCollectionName("");
                setCollectionDescription("");
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
      <Dialog
        open={!!addingToCollectionUpload}
        onOpenChange={(open) => {
          if (!open) {
            setAddingToCollectionUpload(null);
            setCollectionSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Collection</DialogTitle>
            <DialogDescription>Add {addingToCollectionUpload?.title || "this document"} to one or more collections.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search collections..."
                value={collectionSearch}
                onChange={(e) => setCollectionSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {filteredCollections.map((collection) => (
                  <label key={collection.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={addingToCollectionUpload ? isUploadInCollection(collection, addingToCollectionUpload.id) : false}
                      onCheckedChange={(checked) => toggleCollectionMembership(collection, !!checked)}
                      disabled={updateCollectionMutation.isPending}
                    />
                    <span className="truncate">{collection.name || "Untitled"}</span>
                  </label>
                ))}
                {filteredCollections.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No collections found</p>}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddingToCollectionUpload(null);
                setCollectionSearch("");
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EditUploadDialog
        upload={editingUpload}
        open={!!editingUpload}
        onOpenChange={(open) => {
          if (!open) setEditingUpload(null);
        }}
      />
    </div>
  );
}
