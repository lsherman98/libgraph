import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FileText,
  Highlighter,
  Bookmark,
  StickyNote,
  Plus,
  ChevronRight,
  X,
  Library,
  LinkIcon,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { useWorkspaceMaterials } from "@/lib/api/queries";
import type { UploadsResponse, HighlightsResponse, BookmarksResponse, NotesResponse } from "@/lib/pocketbase-types";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNavigate } from "@tanstack/react-router";
import { useReaderTabsStore } from "@/lib/stores/reader-tabs-store";

type ViewMode = "linked" | "browse";

interface WorkspacePanelProps {
  projectId: string;
  linkedUploads?: string[];
  linkedHighlights?: string[];
  linkedBookmarks?: string[];
  linkedNotes?: string[];
  onLinkUpload?: (uploadId: string) => void;
  onUnlinkUpload?: (uploadId: string) => void;
  onLinkHighlight?: (highlightId: string) => void;
  onUnlinkHighlight?: (highlightId: string) => void;
  onLinkBookmark?: (bookmarkId: string) => void;
  onUnlinkBookmark?: (bookmarkId: string) => void;
  onLinkNote?: (noteId: string) => void;
  onUnlinkNote?: (noteId: string) => void;
  onInsertContent?: (content: string) => void;
  className?: string;
}

export function WorkspacePanel({
  linkedUploads = [],
  linkedHighlights = [],
  linkedBookmarks = [],
  linkedNotes = [],
  onLinkUpload,
  onUnlinkUpload,
  onLinkHighlight,
  onUnlinkHighlight,
  onLinkBookmark,
  onUnlinkBookmark,
  onLinkNote,
  onUnlinkNote,
  onInsertContent,
  className,
}: WorkspacePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("uploads");
  const [viewMode, setViewMode] = useState<ViewMode>("linked");
  const { data: materials, isLoading } = useWorkspaceMaterials();
  const navigate = useNavigate();
  const addReaderTab = useReaderTabsStore((state) => state.addTab);

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

  // Get linked items
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

  // Filter based on view mode and search
  const filteredUploads = filterBySearch(viewMode === "linked" ? linkedUploadItems : materials?.uploads || [], [
    "title",
  ] as (keyof UploadsResponse)[]);
  const filteredHighlights = filterBySearch(
    viewMode === "linked" ? linkedHighlightItems : materials?.highlights || [],
    ["text", "note"] as (keyof HighlightsResponse)[],
  );
  const filteredBookmarks = filterBySearch(viewMode === "linked" ? linkedBookmarkItems : materials?.bookmarks || [], [
    "label",
    "preview_text",
  ] as (keyof BookmarksResponse)[]);
  const filteredNotes = filterBySearch(viewMode === "linked" ? linkedNoteItems : materials?.notes || [], [
    "content",
  ] as (keyof NotesResponse)[]);

  const linkedCount = linkedUploads.length + linkedHighlights.length + linkedBookmarks.length + linkedNotes.length;

  const handleInsert = (content: string) => {
    if (onInsertContent) {
      onInsertContent(content);
    } else {
      // Fallback to global insert function
      const insertFn = (window as any).__writerInsertContent;
      if (insertFn) {
        insertFn(content);
      }
    }
  };

  const handleOpenDocument = (uploadId: string, title: string) => {
    addReaderTab(uploadId, title);
    navigate({ to: "/reader", search: { uploadId } });
  };

  return (
    <div className={cn("flex flex-col h-full border-l bg-background", className)}>
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Workspace</h3>
          <Badge variant="secondary" className="text-xs">
            {linkedCount} linked
          </Badge>
        </div>

        {/* View mode toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as ViewMode)}
          className="w-full justify-start"
        >
          <ToggleGroupItem value="linked" aria-label="View linked items" className="flex-1 text-xs">
            <LinkIcon className="h-3 w-3 mr-1" />
            Linked
          </ToggleGroupItem>
          <ToggleGroupItem value="browse" aria-label="Browse all items" className="flex-1 text-xs">
            <Library className="h-3 w-3 mr-1" />
            Browse
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={viewMode === "linked" ? "Search linked items..." : "Search all materials..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 px-2">
          <TabsTrigger value="uploads" className="text-xs relative">
            <FileText className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Sources</span>
            {viewMode === "linked" && linkedUploads.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {linkedUploads.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="highlights" className="text-xs relative">
            <Highlighter className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Highlights</span>
            {viewMode === "linked" && linkedHighlights.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {linkedHighlights.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="text-xs relative">
            <Bookmark className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Bookmarks</span>
            {viewMode === "linked" && linkedBookmarks.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {linkedBookmarks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs relative">
            <StickyNote className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Notes</span>
            {viewMode === "linked" && linkedNotes.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {linkedNotes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="uploads" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading...</p>
                ) : filteredUploads.length === 0 ? (
                  <EmptyState viewMode={viewMode} itemType="sources" onSwitchToBrowse={() => setViewMode("browse")} />
                ) : (
                  filteredUploads.map((upload) => (
                    <UploadItem
                      key={upload.id}
                      upload={upload}
                      isLinked={linkedUploads.includes(upload.id)}
                      viewMode={viewMode}
                      onLink={() => onLinkUpload?.(upload.id)}
                      onUnlink={() => onUnlinkUpload?.(upload.id)}
                      onInsert={() => handleInsert(`[${upload.title}](/reader?uploadId=${upload.id})`)}
                      onOpen={() => handleOpenDocument(upload.id, upload.title || "Document")}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="highlights" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading...</p>
                ) : filteredHighlights.length === 0 ? (
                  <EmptyState
                    viewMode={viewMode}
                    itemType="highlights"
                    onSwitchToBrowse={() => setViewMode("browse")}
                  />
                ) : (
                  filteredHighlights.map((highlight) => (
                    <HighlightItem
                      key={highlight.id}
                      highlight={highlight}
                      isLinked={linkedHighlights.includes(highlight.id)}
                      viewMode={viewMode}
                      onLink={() => onLinkHighlight?.(highlight.id)}
                      onUnlink={() => onUnlinkHighlight?.(highlight.id)}
                      onInsert={() => handleInsert(`> ${highlight.text}`)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="bookmarks" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading...</p>
                ) : filteredBookmarks.length === 0 ? (
                  <EmptyState viewMode={viewMode} itemType="bookmarks" onSwitchToBrowse={() => setViewMode("browse")} />
                ) : (
                  filteredBookmarks.map((bookmark) => (
                    <BookmarkItem
                      key={bookmark.id}
                      bookmark={bookmark}
                      isLinked={linkedBookmarks.includes(bookmark.id)}
                      viewMode={viewMode}
                      onLink={() => onLinkBookmark?.(bookmark.id)}
                      onUnlink={() => onUnlinkBookmark?.(bookmark.id)}
                      onInsert={() =>
                        handleInsert(
                          bookmark.label
                            ? `**${bookmark.label}**: ${bookmark.preview_text || ""}`
                            : bookmark.preview_text || "",
                        )
                      }
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notes" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading...</p>
                ) : filteredNotes.length === 0 ? (
                  <EmptyState viewMode={viewMode} itemType="notes" onSwitchToBrowse={() => setViewMode("browse")} />
                ) : (
                  filteredNotes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      isLinked={linkedNotes.includes(note.id)}
                      viewMode={viewMode}
                      onLink={() => onLinkNote?.(note.id)}
                      onUnlink={() => onUnlinkNote?.(note.id)}
                      onInsert={() => handleInsert(note.content || "")}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// Empty state component
function EmptyState({
  viewMode,
  itemType,
  onSwitchToBrowse,
}: {
  viewMode: ViewMode;
  itemType: string;
  onSwitchToBrowse: () => void;
}) {
  if (viewMode === "linked") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <LinkIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground mb-3">No {itemType} linked yet</p>
        <Button variant="outline" size="sm" onClick={onSwitchToBrowse}>
          <Library className="h-3 w-3 mr-1" />
          Browse to add
        </Button>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground p-2">No {itemType} found</p>;
}

// Individual item components
interface BaseItemProps {
  isLinked: boolean;
  viewMode: ViewMode;
  onLink: () => void;
  onUnlink: () => void;
  onInsert: () => void;
}

function UploadItem({
  upload,
  isLinked,
  viewMode,
  onLink,
  onUnlink,
  onInsert,
  onOpen,
}: BaseItemProps & { upload: UploadsResponse; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);

  // In linked mode, show more detail for viewing
  if (viewMode === "linked" && isLinked) {
    return (
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="rounded-md border bg-card">
          <CollapsibleTrigger asChild>
            <div className="flex items-start gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{upload.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {upload.type}
                  </Badge>
                  {upload.num_pages && (
                    <span className="text-[10px] text-muted-foreground">{upload.num_pages} pages</span>
                  )}
                </div>
              </div>
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 pt-0 border-t flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={onOpen}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={onInsert}>
                <ChevronRight className="h-3 w-3 mr-1" />
                Insert Link
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUnlink}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  // Browse mode or not linked
  return (
    <div
      className={cn(
        "group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors",
        isLinked && "bg-primary/5 border border-primary/20",
      )}
    >
      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{upload.title}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {upload.type}
          </Badge>
          {upload.num_pages && <span className="text-[10px] text-muted-foreground">{upload.num_pages} pages</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onInsert} title="Insert link">
          <ChevronRight className="h-3 w-3" />
        </Button>
        {isLinked ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onUnlink} title="Remove from workspace">
            <X className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onLink} title="Add to workspace">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function HighlightItem({
  highlight,
  isLinked,
  viewMode,
  onLink,
  onUnlink,
  onInsert,
}: BaseItemProps & { highlight: HighlightsResponse }) {
  const [copied, setCopied] = useState(false);

  const colorClasses: Record<string, string> = {
    yellow: "border-l-yellow-400",
    green: "border-l-green-400",
    blue: "border-l-blue-400",
    pink: "border-l-pink-400",
    purple: "border-l-purple-400",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(highlight.text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // In linked mode, show full text for viewing
  if (viewMode === "linked" && isLinked) {
    return (
      <div className={cn("rounded-md border bg-card border-l-4", colorClasses[highlight.color || "yellow"])}>
        <div className="p-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{highlight.text}</p>
          {highlight.note && (
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t italic">{highlight.note}</p>
          )}
        </div>
        <div className="px-3 pb-3 flex gap-2 border-t pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onInsert}>
            <ChevronRight className="h-3 w-3 mr-1" />
            Insert Quote
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUnlink}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Browse mode
  return (
    <div
      className={cn(
        "group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors border-l-2",
        colorClasses[highlight.color || "yellow"],
        isLinked && "bg-primary/5 border-r border-y border-primary/20",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-3">{highlight.text}</p>
        {highlight.note && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">{highlight.note}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onInsert} title="Insert as quote">
          <ChevronRight className="h-3 w-3" />
        </Button>
        {isLinked ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onUnlink} title="Remove from workspace">
            <X className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onLink} title="Add to workspace">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function BookmarkItem({
  bookmark,
  isLinked,
  viewMode,
  onLink,
  onUnlink,
  onInsert,
}: BaseItemProps & { bookmark: BookmarksResponse }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = bookmark.label ? `${bookmark.label}: ${bookmark.preview_text || ""}` : bookmark.preview_text || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // In linked mode, show full content
  if (viewMode === "linked" && isLinked) {
    return (
      <div className="rounded-md border bg-card">
        <div className="p-3">
          <div className="flex items-start gap-2">
            <Bookmark className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              {bookmark.label && <p className="text-sm font-medium mb-1">{bookmark.label}</p>}
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {bookmark.preview_text || "No preview available"}
              </p>
              {bookmark.page_number && (
                <span className="text-[10px] text-muted-foreground mt-1 block">Page {bookmark.page_number}</span>
              )}
            </div>
          </div>
        </div>
        <div className="px-3 pb-3 flex gap-2 border-t pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onInsert}>
            <ChevronRight className="h-3 w-3 mr-1" />
            Insert
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUnlink}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Browse mode
  return (
    <div
      className={cn(
        "group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors",
        isLinked && "bg-primary/5 border border-primary/20",
      )}
    >
      <Bookmark className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        {bookmark.label && <p className="text-sm font-medium truncate">{bookmark.label}</p>}
        <p className={cn("text-sm line-clamp-2", bookmark.label && "text-muted-foreground")}>
          {bookmark.preview_text || "No preview"}
        </p>
        {bookmark.page_number && <span className="text-[10px] text-muted-foreground">Page {bookmark.page_number}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onInsert} title="Insert text">
          <ChevronRight className="h-3 w-3" />
        </Button>
        {isLinked ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onUnlink} title="Remove from workspace">
            <X className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onLink} title="Add to workspace">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function NoteItem({ note, isLinked, viewMode, onLink, onUnlink, onInsert }: BaseItemProps & { note: NotesResponse }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(note.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // In linked mode, show full content
  if (viewMode === "linked" && isLinked) {
    return (
      <div className="rounded-md border bg-card">
        <div className="p-3">
          <div className="flex items-start gap-2">
            <StickyNote className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content || "Empty note"}</p>
              {note.page_number && (
                <span className="text-[10px] text-muted-foreground mt-1 block">Page {note.page_number}</span>
              )}
            </div>
          </div>
        </div>
        <div className="px-3 pb-3 flex gap-2 border-t pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onInsert}>
            <ChevronRight className="h-3 w-3 mr-1" />
            Insert
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUnlink}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Browse mode
  return (
    <div
      className={cn(
        "group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors",
        isLinked && "bg-primary/5 border border-primary/20",
      )}
    >
      <StickyNote className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-3">{note.content || "Empty note"}</p>
        {note.page_number && <span className="text-[10px] text-muted-foreground">Page {note.page_number}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onInsert} title="Insert text">
          <ChevronRight className="h-3 w-3" />
        </Button>
        {isLinked ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onUnlink} title="Remove from workspace">
            <X className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onLink} title="Add to workspace">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
