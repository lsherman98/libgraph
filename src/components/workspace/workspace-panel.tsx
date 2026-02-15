import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, FileText, Highlighter, Bookmark, StickyNote, X, ExternalLink, ChevronDown, BookMarked, Eye } from "lucide-react";
import { useWorkspaceMaterials, usePageMarkdown } from "@/lib/api/queries";
import type { UploadsResponse, HighlightsResponse, NotesResponse, HighlightsRecord, BookmarksRecord, NotesRecord } from "@/lib/pocketbase-types";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceTabsStore } from "@/lib/stores/workspace-tabs-store";

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

const highlightColorClasses: Record<HighlightsColorOptions, string> = {
  [HighlightsColorOptions.yellow]: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200",
  [HighlightsColorOptions.green]: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-200",
  [HighlightsColorOptions.blue]: "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200",
  [HighlightsColorOptions.pink]: "bg-pink-200 text-pink-900 dark:bg-pink-900/50 dark:text-pink-200",
  [HighlightsColorOptions.purple]: "bg-purple-200 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200",
};

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
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: materials, isLoading } = useWorkspaceMaterials();
  const navigate = useNavigate();
  const addReaderTab = useWorkspaceTabsStore((state) => state.addReaderTab);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
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

  const handlePreviewHighlight = (highlight: HighlightsResponse) => {
    setPreviewType("highlight");
    setPreviewItem(highlight as HighlightsRecord);
    setPreviewPageNumber(undefined);
    setPreviewOpen(true);
  };

  const handlePreviewBookmark = (bookmark: any) => {
    setPreviewType("bookmark");
    setPreviewItem(bookmark as BookmarksRecord);
    setPreviewPageNumber(bookmark.page_number);
    setPreviewOpen(true);
  };

  const handlePreviewNote = (note: NotesResponse) => {
    setPreviewType("note");
    setPreviewItem(note as NotesRecord);
    setPreviewPageNumber(note.page_number);
    setPreviewOpen(true);
  };

  const handleNavigateFromPreview = () => {
    if (!previewItem) return;
    const upload = materials?.uploads?.find((u) => u.id === (previewItem as any).upload);
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
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm">Research Sources</h3>
        </div>
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
            <Collapsible open={expandedSections.has("uploads")} onOpenChange={() => toggleSection("uploads")}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 text-left">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !expandedSections.has("uploads") && "-rotate-90")} />
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Documents</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {filteredUploads.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-6 space-y-1 mt-1">
                  {filteredUploads.map((upload) => (
                    <UploadItem
                      key={upload.id}
                      upload={upload}
                      onUnlink={() => onUnlinkUpload?.(upload.id)}
                      onOpen={() => handleOpenDocument(upload.id, upload.title || "Document")}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {linkedHighlights.length > 0 && (
            <Collapsible open={expandedSections.has("highlights")} onOpenChange={() => toggleSection("highlights")}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 text-left">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !expandedSections.has("highlights") && "-rotate-90")} />
                  <Highlighter className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Highlights</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {filteredHighlights.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-6 space-y-1 mt-1">
                  {filteredHighlights.map((highlight) => (
                    <HighlightItem
                      key={highlight.id}
                      highlight={highlight}
                      onUnlink={() => onUnlinkHighlight?.(highlight.id)}
                      onPreview={() => handlePreviewHighlight(highlight)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {linkedBookmarks.length > 0 && (
            <Collapsible open={expandedSections.has("bookmarks")} onOpenChange={() => toggleSection("bookmarks")}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 text-left">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !expandedSections.has("bookmarks") && "-rotate-90")} />
                  <Bookmark className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Bookmarks</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {filteredBookmarks.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-6 space-y-1 mt-1">
                  {filteredBookmarks.map((bookmark) => (
                    <BookmarkItem
                      key={bookmark.id}
                      bookmark={bookmark}
                      onUnlink={() => onUnlinkBookmark?.(bookmark.id)}
                      onPreview={() => handlePreviewBookmark(bookmark)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {linkedNotes.length > 0 && (
            <Collapsible open={expandedSections.has("notes")} onOpenChange={() => toggleSection("notes")}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 text-left">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !expandedSections.has("notes") && "-rotate-90")} />
                  <StickyNote className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Notes</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {filteredNotes.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-6 space-y-1 mt-1">
                  {filteredNotes.map((note) => (
                    <NoteItem key={note.id} note={note} onUnlink={() => onUnlinkNote?.(note.id)} onPreview={() => handlePreviewNote(note)} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </ScrollArea>
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={previewType}
        item={previewItem}
        pageNumber={previewPageNumber}
        onNavigate={handleNavigateFromPreview}
      />
    </div>
  );
}

// Preview Dialog for viewing items in context
interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "highlight" | "bookmark" | "note";
  item: HighlightsRecord | BookmarksRecord | NotesRecord | null;
  pageNumber?: number;
  onNavigate: () => void;
}

function PreviewDialog({ open, onOpenChange, type, item, pageNumber, onNavigate }: PreviewDialogProps) {
  const pageId = item?.page;
  const { data: markdown, isLoading } = usePageMarkdown(pageId);

  if (!item) return null;

  const isHighlight = type === "highlight";
  const isNote = type === "note";
  const highlight = isHighlight ? (item as HighlightsRecord) : null;
  const bookmark = type === "bookmark" ? (item as BookmarksRecord) : null;
  const note = isNote ? (item as NotesRecord) : null;

  // Render the full page content with the highlight marked
  const renderPageContent = () => {
    if (!markdown) return null;

    if (highlight && highlight.start_offset !== undefined && highlight.end_offset !== undefined) {
      const before = markdown.slice(0, highlight.start_offset);
      const highlighted = markdown.slice(highlight.start_offset, highlight.end_offset);
      const after = markdown.slice(highlight.end_offset);

      return (
        <>
          <span>{before}</span>
          <mark className={cn("px-0.5 rounded", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}>{highlighted}</mark>
          <span>{after}</span>
        </>
      );
    }

    return <span>{markdown}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {isHighlight ? (
              <>
                <Highlighter className="h-5 w-5" />
                Highlight Preview
              </>
            ) : isNote ? (
              <>
                <StickyNote className="h-5 w-5 text-blue-500" />
                Note Preview
              </>
            ) : (
              <>
                <BookMarked className="h-5 w-5 text-amber-500" />
                {bookmark?.comment || "Bookmark Preview"}
              </>
            )}
          </DialogTitle>
          <DialogDescription>Page {pageNumber ?? "?"} • Click "Go to page" to navigate to this location</DialogDescription>
        </DialogHeader>

        {/* Highlighted text or bookmark info - fixed at top */}
        {isHighlight && highlight && (
          <div className="shrink-0 mb-2">
            <div className={cn("p-3 rounded-lg", highlightColorClasses[highlight.color || HighlightsColorOptions.yellow])}>
              <p className="text-sm font-medium">"{highlight.text}"</p>
            </div>
            {highlight.comment && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
                <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{highlight.comment}</p>
              </div>
            )}
          </div>
        )}

        {/* Note content - fixed at top */}
        {isNote && note && (
          <div className="shrink-0 mb-2">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
            </div>
          </div>
        )}

        {/* Full page content - scrollable */}
        <div className="flex-1 min-h-0 border rounded-lg bg-card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground shrink-0">
            <FileText className="h-3.5 w-3.5" />
            Page {pageNumber ?? "?"} content
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : markdown ? (
              <div className="text-sm text-foreground/80 font-serif leading-relaxed whitespace-pre-wrap">{renderPageContent()}</div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Could not load page content</div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onNavigate} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Go to page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Individual item components
interface UploadItemProps {
  upload: UploadsResponse;
  onUnlink: () => void;
  onOpen: () => void;
}

function UploadItem({ upload, onUnlink, onOpen }: UploadItemProps) {
  return (
    <div className="group rounded-md border bg-card p-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{upload.title}</p>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {upload.type}
            </Badge>
            {upload.num_pages && <span className="text-[10px] text-muted-foreground">{upload.num_pages} pages</span>}
          </div>
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={onOpen} title="Open document">
          <ExternalLink className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUnlink} title="Remove from project">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface HighlightItemProps {
  highlight: HighlightsResponse;
  onUnlink: () => void;
  onPreview: () => void;
}

function HighlightItem({ highlight, onUnlink, onPreview }: HighlightItemProps) {
  const colorClasses: Record<string, string> = {
    yellow: "border-l-yellow-400",
    green: "border-l-green-400",
    blue: "border-l-blue-400",
    pink: "border-l-pink-400",
    purple: "border-l-purple-400",
  };

  return (
    <div className={cn("rounded-md border bg-card border-l-4 p-2", colorClasses[highlight.color || "yellow"])}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed line-clamp-3">{highlight.text}</p>
          {highlight.comment && <p className="text-xs text-muted-foreground mt-1 pt-1 border-t italic line-clamp-2">{highlight.comment}</p>}
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={onPreview} title="View context">
          <Eye className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUnlink} title="Remove from project">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface BookmarkItemProps {
  bookmark: any;
  onUnlink: () => void;
  onPreview: () => void;
}

function BookmarkItem({ bookmark, onUnlink, onPreview }: BookmarkItemProps) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex items-start gap-2">
        <Bookmark className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          {bookmark.comment && <p className="text-sm font-medium line-clamp-1">{bookmark.comment}</p>}
          <p className={cn("text-sm line-clamp-2", bookmark.comment && "text-muted-foreground")}>{bookmark.preview_text || "No preview"}</p>
        </div>
        {bookmark.page_number && <span className="text-[10px] text-muted-foreground shrink-0 self-center">p.{bookmark.page_number}</span>}
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={onPreview} title="View context">
          <Eye className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUnlink} title="Remove from project">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface NoteItemProps {
  note: NotesResponse;
  onUnlink: () => void;
  onPreview: () => void;
}

function NoteItem({ note, onUnlink, onPreview }: NoteItemProps) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex items-start gap-2">
        <StickyNote className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm line-clamp-3">{note.content || "Empty note"}</p>
        </div>
        {note.page_number && <span className="text-[10px] text-muted-foreground shrink-0 self-center">p.{note.page_number}</span>}
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={onPreview} title="View context">
          <Eye className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUnlink} title="Remove from project">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
