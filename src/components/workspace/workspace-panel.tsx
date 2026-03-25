import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Highlighter, Bookmark, StickyNote } from "lucide-react";
import { useWorkspaceMaterials } from "@/lib/api/queries";
import type { UploadsResponse, HighlightsResponse, NotesResponse, HighlightsRecord, BookmarksRecord, NotesRecord } from "@/lib/pocketbase-types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";
import { PreviewDialog } from "@/components/workspace/preview-dialog";
import { CollapsibleSection } from "./collapsible-section";
import { UploadItem } from "./upload-item";
import { HighlightItem } from "./highlight-item";
import { BookmarkItem } from "./bookmark-item";
import { NoteItem } from "./note-item";

interface WorkspacePanelProps {
  projectId: string;
  linkedUploads?: string[];
  linkedHighlights?: string[];
  linkedBookmarks?: string[];
  linkedNotes?: string[];
  onUnlinkUpload?: (uploadId: string) => void;
  onUnlinkHighlight?: (highlightId: string) => void;
  onUnlinkBookmark?: (bookmarkId: string) => void;
  onUnlinkNote?: (noteId: string) => void;
  className?: string;
}

export function WorkspacePanel({
  linkedUploads = [],
  linkedHighlights = [],
  linkedBookmarks = [],
  linkedNotes = [],
  onUnlinkUpload,
  onUnlinkHighlight,
  onUnlinkBookmark,
  onUnlinkNote,
  className,
}: WorkspacePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["uploads", "highlights", "bookmarks", "notes"]));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note" | "upload">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewUploadId, setPreviewUploadId] = useState<string | undefined>();
  const [previewUploadTitle, setPreviewUploadTitle] = useState<string | undefined>();
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: materials, isLoading } = useWorkspaceMaterials();
  const navigate = useNavigate();
  const addReaderTab = useWorkspaceTabsStore((state) => state.addReaderTab);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  const filterBySearch = <T extends { id: string }>(items: T[], searchFields: (keyof T)[]): T[] => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      searchFields.some((field) => {
        const value = item[field];
        return typeof value === "string" && value.toLowerCase().includes(query);
      }),
    );
  };

  const linkedUploadItems = useMemo(() => {
    return materials?.uploads?.filter((u) => linkedUploads.includes(u.id)) || [];
  }, [materials?.uploads, linkedUploads]);

  const linkedHighlightItems = useMemo(() => {
    return materials?.highlights?.filter((h) => linkedHighlights.includes(h.id)) || [];
  }, [materials?.highlights, linkedHighlights]);

  const linkedBookmarkItems = useMemo(() => {
    return materials?.bookmarks?.filter((b) => linkedBookmarks.includes(b.id)) || [];
  }, [materials?.bookmarks, linkedBookmarks]);

  const linkedNoteItems = useMemo(() => {
    return materials?.notes?.filter((n) => linkedNotes.includes(n.id)) || [];
  }, [materials?.notes, linkedNotes]);

  const filteredUploads = filterBySearch(linkedUploadItems, ["title"] as (keyof UploadsResponse)[]);
  const filteredHighlights = filterBySearch(linkedHighlightItems, ["text", "comment"] as (keyof HighlightsResponse)[]);
  const filteredBookmarks = filterBySearch(linkedBookmarkItems as any[], ["comment", "preview_text"] as any[]);
  const filteredNotes = filterBySearch(linkedNoteItems, ["content"] as (keyof NotesResponse)[]);

  const linkedCount = linkedUploads.length + linkedHighlights.length + linkedBookmarks.length + linkedNotes.length;

  const handleOpenDocument = (uploadId: string, title: string) => {
    addReaderTab(uploadId, title);
    navigate({ to: "/workspace", search: { id: uploadId, type: "upload" } });
  };

  const openUploadPreview = (upload: UploadsResponse) => {
    setPreviewType("upload");
    setPreviewItem(null);
    setPreviewUploadId(upload.id);
    setPreviewUploadTitle(upload.title || "Document");
    setPreviewPageNumber(1);
    setPreviewOpen(true);
  };

  const openPreview = (type: "highlight" | "bookmark" | "note", item: HighlightsResponse | NotesResponse | any, pageNumber?: number) => {
    setPreviewType(type);
    setPreviewItem(item as HighlightsRecord | BookmarksRecord | NotesRecord);
    setPreviewUploadId((item as any)?.upload);
    setPreviewUploadTitle(undefined);
    setPreviewPageNumber(pageNumber);
    setPreviewOpen(true);
  };

  const handleNavigateFromPreview = () => {
    const targetUploadId = previewType === "upload" ? previewUploadId : (previewItem as any)?.upload;
    if (!targetUploadId) return;

    const upload = materials?.uploads?.find((u) => u.id === targetUploadId);
    if (upload) {
      handleOpenDocument(upload.id, upload.title || "Document");
    }
    setPreviewOpen(false);
  };

  if (isLoading) {
    return (
      <div className={cn("flex flex-col h-full border-l bg-background", className)}>
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm">Research Sources</h3>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (linkedCount === 0) {
    return (
      <div className={cn("flex flex-col h-full border-l bg-background", className)}>
        <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-2">No sources linked yet</p>
          <p className="text-xs text-muted-foreground">
            Open a document and use "Add to Project" on highlights, bookmarks, or notes to link them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full border-l bg-background", className)}>
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Research Sources</h3>
          <Badge variant="secondary" className="text-xs">
            {linkedCount} items
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search sources..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {linkedUploads.length > 0 && (
            <CollapsibleSection
              sectionKey="uploads"
              label="Documents"
              icon={<FileText className="h-4 w-4 text-primary" />}
              count={filteredUploads.length}
              expanded={expandedSections.has("uploads")}
              onToggle={toggleSection}
            >
              {filteredUploads.map((upload) => (
                <UploadItem key={upload.id} upload={upload} onUnlink={() => onUnlinkUpload?.(upload.id)} onOpen={() => openUploadPreview(upload)} />
              ))}
            </CollapsibleSection>
          )}
          {linkedHighlights.length > 0 && (
            <CollapsibleSection
              sectionKey="highlights"
              label="Highlights"
              icon={<Highlighter className="h-4 w-4 text-yellow-500" />}
              count={filteredHighlights.length}
              expanded={expandedSections.has("highlights")}
              onToggle={toggleSection}
            >
              {filteredHighlights.map((highlight) => (
                <HighlightItem
                  key={highlight.id}
                  highlight={highlight}
                  onUnlink={() => onUnlinkHighlight?.(highlight.id)}
                  onPreview={() => openPreview("highlight", highlight)}
                />
              ))}
            </CollapsibleSection>
          )}
          {linkedBookmarks.length > 0 && (
            <CollapsibleSection
              sectionKey="bookmarks"
              label="Bookmarks"
              icon={<Bookmark className="h-4 w-4 text-amber-500" />}
              count={filteredBookmarks.length}
              expanded={expandedSections.has("bookmarks")}
              onToggle={toggleSection}
            >
              {filteredBookmarks.map((bookmark) => (
                <BookmarkItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  onUnlink={() => onUnlinkBookmark?.(bookmark.id)}
                  onPreview={() => openPreview("bookmark", bookmark, bookmark.page_number)}
                />
              ))}
            </CollapsibleSection>
          )}
          {linkedNotes.length > 0 && (
            <CollapsibleSection
              sectionKey="notes"
              label="Notes"
              icon={<StickyNote className="h-4 w-4 text-blue-500" />}
              count={filteredNotes.length}
              expanded={expandedSections.has("notes")}
              onToggle={toggleSection}
            >
              {filteredNotes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  onUnlink={() => onUnlinkNote?.(note.id)}
                  onPreview={() => openPreview("note", note, note.page_number)}
                />
              ))}
            </CollapsibleSection>
          )}
        </div>
      </ScrollArea>
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={previewType}
        item={previewItem}
        pageNumber={previewPageNumber}
        uploadId={previewType === "upload" ? previewUploadId : (previewItem as any)?.upload}
        uploadTitle={previewType === "upload" ? previewUploadTitle : undefined}
        onNavigate={handleNavigateFromPreview}
      />
    </div>
  );
}
