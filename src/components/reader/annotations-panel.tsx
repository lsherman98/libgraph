import { useState, useMemo } from "react";
import { useHighlights, useBookmarks, useNotes, usePages } from "@/lib/api/queries";
import { useDeleteNote } from "@/lib/api/mutations";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlighter, BookMarked, Pencil } from "lucide-react";
import { HighlightsColorOptions, type HighlightsRecord, type BookmarksRecord, type NotesRecord } from "@/lib/pocketbase-types";
import { useReaderStore } from "@/lib/stores/reader-store";
import { PreviewDialog } from "@/components/workspace/preview-dialog";
import { AnnotationHighlightItem } from "./annotation-highlight-item";
import { AnnotationBookmarkItem } from "./annotation-bookmark-item";
import { AnnotationNoteItem } from "./annotation-note-item";
import { groupByPage } from "@/lib/utils/group-by-page";

interface AnnotationsPanelProps {
  activeTab?: "highlights" | "bookmarks" | "notes";
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

export function AnnotationsPanel({ activeTab = "highlights", onNavigateToPage: propNavigateToPage }: AnnotationsPanelProps) {
  const storeUploadId = useReaderStore((state) => state.currentUploadId);
  const storeNavigateToPage = useReaderStore((state) => state.navigateToPage);

  const uploadId = storeUploadId;
  const onNavigateToPage = storeNavigateToPage ?? propNavigateToPage ?? null;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note">("highlight");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const { data: allHighlights = [] } = useHighlights(uploadId || undefined);
  const { data: allBookmarks = [] } = useBookmarks(uploadId || undefined);
  const { data: allNotes = [] } = useNotes(uploadId || undefined);
  const { data: pagesData } = usePages(uploadId || undefined, 1, 1000);

  const pageIdToNumber = useMemo(() => {
    const map = new Map<string, number>();
    pagesData?.items.forEach((page) => {
      map.set(page.id, page.page);
    });
    return map;
  }, [pagesData]);

  const groupedHighlights = useMemo(
    () => groupByPage(allHighlights ?? [], (h): number | undefined => (h.page ? pageIdToNumber.get(h.page) : undefined)),
    [allHighlights, pageIdToNumber],
  );

  const groupedBookmarks = useMemo(() => groupByPage(allBookmarks ?? [], (b) => b.page_number), [allBookmarks]);

  const groupedNotes = useMemo(() => groupByPage(allNotes ?? [], (n) => n.page_number), [allNotes]);

  const handleHighlightClick = (highlight: HighlightsRecord) => {
    const pageNum = highlight.page ? pageIdToNumber.get(highlight.page) : undefined;
    setPreviewType("highlight");
    setPreviewItem(highlight);
    setPreviewPageNumber(pageNum);
    setPreviewOpen(true);
  };

  const handleBookmarkClick = (bookmark: BookmarksRecord) => {
    setPreviewType("bookmark");
    setPreviewItem(bookmark);
    setPreviewPageNumber(bookmark.page_number);
    setPreviewOpen(true);
  };

  const handleNoteClick = (note: NotesRecord) => {
    setPreviewType("note");
    setPreviewItem(note);
    setPreviewPageNumber(note.page_number);
    setPreviewOpen(true);
  };

  const setEditorState = useReaderStore((state) => state.setEditorState);

  const handleHighlightEdit = (highlight: HighlightsRecord) => {
    setEditorState({
      mode: "editing-highlight",
      data: {
        id: highlight.id,
        text: highlight.text || "",
        color: highlight.color || HighlightsColorOptions.yellow,
        note: highlight.comment || undefined,
        tags: highlight.tags || undefined,
        pageId: highlight.page || "",
      },
    });
  };

  const handleBookmarkEdit = (bookmark: BookmarksRecord) => {
    setEditorState({
      mode: "editing-bookmark",
      data: {
        id: bookmark.id,
        blockId: bookmark.block_id || "",
        previewText: "",
        comment: bookmark.comment || undefined,
        tags: bookmark.tags || undefined,
        pageId: bookmark.page || "",
        pageNumber: bookmark.page_number || 0,
      },
    });
  };

  const handleNoteEdit = (note: NotesRecord) => {
    setEditorState({
      mode: "editing-note",
      data: {
        id: note.id,
        blockId: note.block_id || "",
        previewText: undefined,
        content: note.content || undefined,
        tags: note.tags || undefined,
        pageId: note.page || "",
        pageNumber: note.page_number || 0,
      },
    });
  };

  const deleteNoteMutation = useDeleteNote();

  const handleNavigate = () => {
    if (!previewItem) return;

    let pageNumber: number | undefined;
    let blockId: string | undefined;

    if (previewType === "highlight") {
      pageNumber = previewItem.page ? pageIdToNumber.get(previewItem.page) : undefined;
    } else if (previewType === "bookmark") {
      const bookmark = previewItem as BookmarksRecord;
      pageNumber = bookmark.page_number;
      blockId = bookmark.block_id;
    } else if (previewType === "note") {
      const note = previewItem as NotesRecord;
      pageNumber = note.page_number;
      blockId = note.block_id;
    }

    if (pageNumber && onNavigateToPage) {
      onNavigateToPage(pageNumber, blockId);
    }
    setPreviewOpen(false);
  };

  if (!uploadId) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Open a document to see annotations</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {activeTab === "highlights" && (
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-4">
              {groupedHighlights.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Highlighter className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No highlights yet</p>
                  <p className="text-xs mt-1">Select text in the reader to create a highlight</p>
                </div>
              ) : (
                groupedHighlights.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((highlight) => (
                      <AnnotationHighlightItem
                        key={highlight.id}
                        highlight={highlight}
                        pageNumber={highlight.page ? pageIdToNumber.get(highlight.page) : undefined}
                        onClick={() => handleHighlightClick(highlight)}
                        onEdit={() => handleHighlightEdit(highlight)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {activeTab === "bookmarks" && (
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-4">
              {groupedBookmarks.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No bookmarks yet</p>
                  <p className="text-xs mt-1">Use the bookmark button on paragraphs to save them</p>
                </div>
              ) : (
                groupedBookmarks.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((bookmark) => (
                      <AnnotationBookmarkItem
                        key={bookmark.id}
                        bookmark={bookmark}
                        onClick={() => handleBookmarkClick(bookmark)}
                        onEdit={() => handleBookmarkEdit(bookmark)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {activeTab === "notes" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-4">
              {groupedNotes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Pencil className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No notes yet</p>
                  <p className="text-xs mt-1">Click the note icon on paragraphs to add notes</p>
                </div>
              ) : (
                groupedNotes.map(({ pageNumber, items }) => (
                  <div key={pageNumber} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1 z-10 px-1">
                      {pageNumber === 0 ? "Unknown Page" : `Page ${pageNumber}`}
                    </div>
                    {items.map((note) => (
                      <AnnotationNoteItem
                        key={note.id}
                        note={note}
                        onDelete={() => deleteNoteMutation.mutate(note.id)}
                        onClick={() => handleNoteClick(note)}
                        onEdit={() => handleNoteEdit(note)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={previewType}
        item={previewItem}
        pageNumber={previewPageNumber}
        uploadId={uploadId || undefined}
        totalPages={pagesData?.totalItems}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
