import { useState, useEffect, useRef, useCallback, useMemo, isValidElement, type ReactNode } from "react";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useSidebar } from "@/components/ui/sidebar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useReaderStore } from "@/lib/stores/reader-store";
import { SharedMarkdownRenderer, sharedMarkdownComponents } from "@/components/ui/markdown-renderer";
import { HighlightPopover, ExistingHighlightPopover, HighlightMark } from "@/components/reader/highlight-popover";
import { HighlightEditorPopover } from "@/components/reader/highlight-editor-popover";
import { BlockActions } from "@/components/reader/bookmark-button";
import {
  injectHighlightsIntoMarkdown,
  findTextOffset,
  getSelectionInfo,
  findHighlightElement,
  type SelectionInfo,
  type HighlightInput,
} from "@/lib/highlight-utils";
import { ACTIVE_HIGHLIGHT_CLASS, createSearchHighlightRehypePlugin } from "@/lib/utils/search-highlights";
import { cn } from "@/lib/utils";

interface EditorAnchorPosition {
  x: number;
  y: number;
  side: "top" | "bottom";
}

const HIGHLIGHT_EDITOR_ESTIMATED_HEIGHT = 320;
const VIEWPORT_EDGE_PADDING = 16;
const HIGHLIGHT_EDITOR_OFFSET = 8;

function getHighlightEditorAnchor(rect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width">): EditorAnchorPosition {
  const spaceAbove = rect.top - VIEWPORT_EDGE_PADDING;
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_EDGE_PADDING;
  const side = spaceBelow >= HIGHLIGHT_EDITOR_ESTIMATED_HEIGHT || spaceBelow >= spaceAbove ? "bottom" : "top";

  return {
    x: rect.left + rect.width / 2,
    y: side === "bottom" ? rect.bottom + HIGHLIGHT_EDITOR_OFFSET : rect.top - HIGHLIGHT_EDITOR_OFFSET,
    side,
  };
}

export function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (isValidElement(children)) return extractText((children.props as any)?.children);
  return "";
}

export function MarkdownContent({
  content,
  isLoading,
  pageId,
  pageNumber,
  highlights = [],
  bookmarks = [],
  notes = [],
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  content: string | null | undefined;
  isLoading: boolean;
  pageId?: string;
  pageNumber?: number;
  highlights?: HighlightInput[];
  bookmarks?: { id: string; block_id: string; label?: string; tags?: string[] }[];
  notes?: { id: string; block_id: string; content?: string; tags?: string[] }[];
  onCreateHighlight?: (data: {
    color: HighlightsColorOptions;
    text: string;
    note?: string;
    tags?: string[];
    start_offset: number;
    end_offset: number;
  }) => void;
  onUpdateHighlight?: (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;
  onDeleteHighlight?: (id: string) => void;
}) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{ element: HTMLElement; highlight: HighlightInput } | null>(null);
  const [tempHighlight, setTempHighlight] = useState<HighlightInput | null>(null);
  const [highlightEditorPosition, setHighlightEditorPosition] = useState<EditorAnchorPosition | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const editorState = useReaderStore((state) => state.editorState);
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const searchQuery = useReaderStore((state) => state.searchQuery);
  const activeSearchMatch = useReaderStore((state) => state.activeSearchMatch);
  const { setOpenRight, openRight } = useSidebar();

  const pendingHighlight = editorState?.mode === "pending-highlight" ? editorState.data : null;
  const editingHighlight = editorState?.mode === "editing-highlight" ? editorState.data : null;
  const pendingBookmark = editorState?.mode === "pending-bookmark" ? editorState.data : null;
  const activeNote = editorState?.mode === "pending-note" || editorState?.mode === "editing-note" ? editorState.data : null;
  const isHighlightEditorOpen = editorState?.mode === "pending-highlight" || editorState?.mode === "editing-highlight";
  const previousPageIdRef = useRef<string | undefined>(pageId);

  useEffect(() => {
    if (previousPageIdRef.current === pageId) {
      return;
    }

    previousPageIdRef.current = pageId;
    setSelection(null);
    setActiveHighlight(null);
    setTempHighlight(null);
    setHighlightEditorPosition(null);
    setEditorState(null);
    window.getSelection()?.removeAllRanges();
  }, [pageId, setEditorState]);

  useEffect(() => {
    if (tempHighlight) {
      window.getSelection()?.removeAllRanges();
    }
  }, [tempHighlight]);

  const getApproximateSelectionOffset = useCallback((range: Range): number | undefined => {
    const container = contentRef.current;
    if (!container) return undefined;

    const preRange = range.cloneRange();

    try {
      preRange.selectNodeContents(container);
      preRange.setEnd(range.startContainer, range.startOffset);
      return preRange.toString().length;
    } catch {
      return undefined;
    }
  }, []);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) {
        return;
      }

      const highlightEl = findHighlightElement(e.target as HTMLElement);
      if (highlightEl) {
        const highlightId = highlightEl.dataset.highlightId;
        const highlight = highlights.find((h) => h.id === highlightId);
        if (highlight) {
          setActiveHighlight({
            element: highlightEl,
            highlight,
          });
          setSelection(null);
          setTempHighlight(null);
          return;
        }
      }

      const selectionInfo = getSelectionInfo();

      if (selectionInfo && selectionInfo.text.length > 0) {
        setSelection(selectionInfo);
        setActiveHighlight(null);

        if (content) {
          const approximatePosition = getApproximateSelectionOffset(selectionInfo.range);
          const offsets = findTextOffset(content, selectionInfo.text, approximatePosition);
          if (offsets) {
            setTempHighlight({
              id: "temp-selection",
              text: selectionInfo.text,
              color: HighlightsColorOptions.yellow,
              start_offset: offsets.start,
              end_offset: offsets.end,
              comment: "",
              tags: [],
            });
          } else {
            setTempHighlight(null);
          }
        }
      } else {
        setSelection(null);
        setTempHighlight(null);
      }
    },
    [highlights, content, getApproximateSelectionOffset],
  );

  const handleHighlight = useCallback(
    (color: HighlightsColorOptions, note?: string, tags?: string[]) => {
      if (!selection || !content || !onCreateHighlight) {
        return;
      }

      let startOffset, endOffset;
      if (tempHighlight && tempHighlight.text === selection.text) {
        startOffset = tempHighlight.start_offset;
        endOffset = tempHighlight.end_offset;
      } else {
        const approximatePosition = getApproximateSelectionOffset(selection.range);
        const offsets = findTextOffset(content, selection.text, approximatePosition);
        if (!offsets) {
          return;
        }
        startOffset = offsets.start;
        endOffset = offsets.end;
      }

      const payload = {
        color,
        text: selection.text,
        note,
        tags,
        start_offset: startOffset,
        end_offset: endOffset,
      };
      onCreateHighlight(payload);

      setSelection(null);
      setTempHighlight(null);
      window.getSelection()?.removeAllRanges();
    },
    [selection, content, onCreateHighlight, tempHighlight, getApproximateSelectionOffset],
  );

  const handleUpdateHighlightColor = useCallback(
    (color: HighlightsColorOptions) => {
      if (!activeHighlight || !onUpdateHighlight) return;
      onUpdateHighlight(activeHighlight.highlight.id, { color });
    },
    [activeHighlight, onUpdateHighlight],
  );

  const handleHighlightMarkClick = useCallback(
    (highlightId: string | undefined, element: HTMLElement) => {
      if (!highlightId) return;

      const highlight = highlights.find((h) => h.id === highlightId);
      if (!highlight) return;

      setActiveHighlight({
        element,
        highlight,
      });
      setSelection(null);
      setTempHighlight(null);
      window.getSelection()?.removeAllRanges();
    },
    [highlights],
  );

  const activeHighlightData = useMemo(() => {
    if (!activeHighlight) return null;

    return highlights.find((highlight) => highlight.id === activeHighlight.highlight.id) ?? activeHighlight.highlight;
  }, [activeHighlight, highlights]);

  const handleDeleteActiveHighlight = useCallback(() => {
    if (!activeHighlight || !onDeleteHighlight) return;
    onDeleteHighlight(activeHighlight.highlight.id);
    setActiveHighlight(null);
  }, [activeHighlight, onDeleteHighlight]);

  const handleOpenNewHighlightEditor = useCallback(() => {
    if (!selection || !tempHighlight || !pageId) return;

    const rangeRect = selection.range.getBoundingClientRect();
    setHighlightEditorPosition(getHighlightEditorAnchor(rangeRect));

    setEditorState({
      mode: "pending-highlight",
      data: {
        text: selection.text,
        color: HighlightsColorOptions.yellow,
        pageId,
        startOffset: tempHighlight.start_offset,
        endOffset: tempHighlight.end_offset,
      },
    });

    setSelection(null);
    setTempHighlight(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, tempHighlight, pageId, setEditorState]);

  const handleOpenExistingHighlightEditor = useCallback(() => {
    if (!activeHighlight || !activeHighlightData || !pageId) return;

    const highlight = activeHighlightData;
    const rect = activeHighlight.element.getBoundingClientRect();
    setHighlightEditorPosition(getHighlightEditorAnchor(rect));

    setEditorState({
      mode: "editing-highlight",
      data: {
        id: highlight.id,
        text: highlight.text,
        color: highlight.color,
        note: highlight.comment,
        tags: highlight.tags,
        pageId,
      },
    });

    setActiveHighlight(null);
  }, [activeHighlight, activeHighlightData, pageId, setEditorState]);

  useEffect(() => {
    if (!isHighlightEditorOpen) {
      setHighlightEditorPosition(null);
    }
  }, [isHighlightEditorOpen]);

  useEffect(() => {
    if (!isHighlightEditorOpen || highlightEditorPosition || !contentRef.current) {
      return;
    }

    if (editingHighlight && editingHighlight.pageId === pageId) {
      const currentEditingHighlight = editingHighlight;
      const highlightElement = contentRef.current.querySelector(`[data-highlight-id="${currentEditingHighlight.id}"]`);

      if (highlightElement instanceof HTMLElement) {
        setHighlightEditorPosition(getHighlightEditorAnchor(highlightElement.getBoundingClientRect()));
        return;
      }
    }

    const rect = contentRef.current.getBoundingClientRect();
    setHighlightEditorPosition(getHighlightEditorAnchor(rect));
  }, [editingHighlight, isHighlightEditorOpen, highlightEditorPosition, pageId]);

  useEffect(() => {
    if (!selection && !activeHighlight && !isHighlightEditorOpen) {
      return;
    }

    const dismissFloatingUI = () => {
      setSelection(null);
      setActiveHighlight(null);
      setHighlightEditorPosition(null);
      if (isHighlightEditorOpen) {
        setEditorState(null);
      }
    };

    window.addEventListener("scroll", dismissFloatingUI, true);
    window.addEventListener("resize", dismissFloatingUI);

    return () => {
      window.removeEventListener("scroll", dismissFloatingUI, true);
      window.removeEventListener("resize", dismissFloatingUI);
    };
  }, [selection, activeHighlight, isHighlightEditorOpen, setEditorState]);

  const handleCloseHighlightEditor = useCallback(() => {
    setEditorState(null);
    setHighlightEditorPosition(null);
  }, [setEditorState]);

  const handleChatWithText = useCallback(() => {
    if (!selection) return;
    const { setPendingChatText, setAnnotationTab } = useReaderStore.getState();
    setAnnotationTab("ai");
    setPendingChatText(selection.text);

    if (!openRight) {
      setOpenRight(true);
    }

    setSelection(null);
    setTempHighlight(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, openRight, setOpenRight]);

  const getBlockId = useCallback(
    (node: any) => {
      if (!pageId || !node?.position?.start?.line) return undefined;
      return `${pageId}-L${node.position.start.line}`;
    },
    [pageId],
  );

  const isBlockBookmarked = useCallback(
    (blockId: string) => {
      return bookmarks.some((b) => b.block_id === blockId);
    },
    [bookmarks],
  );

  const getBookmarkForBlock = useCallback(
    (blockId: string) => {
      return bookmarks.find((b) => b.block_id === blockId);
    },
    [bookmarks],
  );

  const hasNoteForBlock = useCallback(
    (blockId: string) => {
      return notes.some((n) => n.block_id === blockId);
    },
    [notes],
  );

  const getNoteForBlock = useCallback(
    (blockId: string) => {
      return notes.find((n) => n.block_id === blockId);
    },
    [notes],
  );

  const renderDataRef = useRef({
    getBlockId,
    isBlockBookmarked,
    getBookmarkForBlock,
    hasNoteForBlock,
    getNoteForBlock,
    handleHighlightMarkClick,
    pageId,
    pageNumber,
    highlights,
    pendingBookmark,
    activeNote,
  });
  renderDataRef.current = {
    getBlockId,
    isBlockBookmarked,
    getBookmarkForBlock,
    hasNoteForBlock,
    getNoteForBlock,
    handleHighlightMarkClick,
    pageId,
    pageNumber,
    highlights,
    pendingBookmark,
    activeNote,
  };

  const markdownComponents = useMemo(
    () => ({
      ...sharedMarkdownComponents,
      h1: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        const isBookmarkTarget = !!blockId && d.pendingBookmark?.blockId === blockId;
        const isNoteTarget = !!blockId && d.activeNote?.blockId === blockId;
        const isBookmarked = blockId ? d.isBlockBookmarked(blockId) : false;
        const bookmark = blockId ? d.getBookmarkForBlock(blockId) : undefined;
        const hasNote = blockId ? d.hasNoteForBlock(blockId) : false;
        const note = blockId ? d.getNoteForBlock(blockId) : undefined;
        return (
          <h1
            id={blockId}
            className={cn(
              "text-2xl font-bold mt-8 mb-4 first:mt-0 group relative",
              (isBookmarkTarget || isNoteTarget) && "rounded-md border border-border px-2 -mx-2",
            )}
          >
            {blockId && d.pageId && d.pageNumber && (
              <BlockActions
                blockId={blockId}
                previewText={extractText(children)}
                pageId={d.pageId}
                pageNumber={d.pageNumber}
                isBookmarked={isBookmarked}
                bookmarkId={bookmark?.id}
                bookmarkComment={bookmark?.label}
                bookmarkTags={bookmark?.tags}
                hasNote={hasNote}
                noteId={note?.id}
                noteContent={note?.content}
                noteTags={note?.tags}
                className="top-1"
              />
            )}
            {children}
          </h1>
        );
      },
      h2: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        const isBookmarkTarget = !!blockId && d.pendingBookmark?.blockId === blockId;
        const isNoteTarget = !!blockId && d.activeNote?.blockId === blockId;
        const isBookmarked = blockId ? d.isBlockBookmarked(blockId) : false;
        const bookmark = blockId ? d.getBookmarkForBlock(blockId) : undefined;
        const hasNote = blockId ? d.hasNoteForBlock(blockId) : false;
        const note = blockId ? d.getNoteForBlock(blockId) : undefined;
        return (
          <h2
            id={blockId}
            className={cn(
              "text-xl font-semibold mt-6 mb-3 group relative",
              (isBookmarkTarget || isNoteTarget) && "rounded-md border border-border px-2 -mx-2",
            )}
          >
            {blockId && d.pageId && d.pageNumber && (
              <BlockActions
                blockId={blockId}
                previewText={extractText(children)}
                pageId={d.pageId}
                pageNumber={d.pageNumber}
                isBookmarked={isBookmarked}
                bookmarkId={bookmark?.id}
                bookmarkComment={bookmark?.label}
                bookmarkTags={bookmark?.tags}
                hasNote={hasNote}
                noteId={note?.id}
                noteContent={note?.content}
                noteTags={note?.tags}
                className="top-0.5"
              />
            )}
            {children}
          </h2>
        );
      },
      h3: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        return (
          <h3 id={blockId} className="text-lg font-medium mt-5 mb-2">
            {children}
          </h3>
        );
      },
      pre: ({ children }: any) => (
        <pre className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm max-w-full whitespace-pre-wrap wrap-break-word">
          {children}
        </pre>
      ),
      code: ({ children }: any) => <code>{children}</code>,
      blockquote: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        return (
          <blockquote id={blockId} className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">
            {children}
          </blockquote>
        );
      },
      ul: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        return (
          <ul id={blockId} className="my-4 pl-6 list-disc space-y-1">
            {children}
          </ul>
        );
      },
      ol: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        return (
          <ol id={blockId} className="my-4 pl-6 list-decimal space-y-1">
            {children}
          </ol>
        );
      },
      li: ({ children }: any) => <li className="whitespace-pre-wrap">{children}</li>,
      p: ({ node, children }: any) => {
        const d = renderDataRef.current;
        const blockId = d.getBlockId(node);
        const isBookmarkTarget = !!blockId && d.pendingBookmark?.blockId === blockId;
        const isNoteTarget = !!blockId && d.activeNote?.blockId === blockId;
        const isBookmarked = blockId ? d.isBlockBookmarked(blockId) : false;
        const bookmark = blockId ? d.getBookmarkForBlock(blockId) : undefined;
        const hasNote = blockId ? d.hasNoteForBlock(blockId) : false;
        const note = blockId ? d.getNoteForBlock(blockId) : undefined;
        return (
          <p
            id={blockId}
            className={cn("reader-paragraph group relative mb-4", (isBookmarkTarget || isNoteTarget) && "rounded-md border border-border px-2 -mx-2")}
          >
            {blockId && d.pageId && d.pageNumber && (
              <BlockActions
                blockId={blockId}
                previewText={extractText(children)}
                pageId={d.pageId}
                pageNumber={d.pageNumber}
                isBookmarked={isBookmarked}
                bookmarkId={bookmark?.id}
                bookmarkComment={bookmark?.label}
                bookmarkTags={bookmark?.tags}
                hasNote={hasNote}
                noteId={note?.id}
                noteContent={note?.content}
                noteTags={note?.tags}
                className="top-0"
              />
            )}
            {children}
          </p>
        );
      },
      mark: ({ node, children, ...props }: any) => {
        const d = renderDataRef.current;
        const highlightId = props["data-highlight-id"] ?? props.dataHighlightId;
        const className = props.className || props.class || "highlight-yellow";
        const highlight = d.highlights.find((h: any) => h.id === highlightId);
        return (
          <HighlightMark
            highlightId={highlightId}
            className={className}
            note={highlight?.comment}
            tags={highlight?.tags}
            onClick={(event) => {
              d.handleHighlightMarkClick(highlightId, event.currentTarget as HTMLElement);
            }}
          >
            {children}
          </HighlightMark>
        );
      },
    }),
    [],
  );

  const searchHighlightPlugin = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return null;
    }

    return createSearchHighlightRehypePlugin({
      query: trimmedQuery,
      activeHighlightIndex: activeSearchMatch && activeSearchMatch.pageNumber === pageNumber ? activeSearchMatch.highlightIndex : null,
    });
  }, [searchQuery, activeSearchMatch, pageNumber]);

  let allHighlights = [...highlights];

  if (tempHighlight) {
    allHighlights.push(tempHighlight);
  }

  if (pendingHighlight && pendingHighlight.pageId === pageId) {
    allHighlights.push({
      id: "pending-highlight",
      text: pendingHighlight.text,
      color: HighlightsColorOptions.yellow,
      start_offset: pendingHighlight.startOffset,
      end_offset: pendingHighlight.endOffset,
      comment: "",
      tags: [],
      isPending: true,
    });
  }

  const processedContent = injectHighlightsIntoMarkdown(content ?? "", allHighlights);

  useEffect(() => {
    if (!content || !searchQuery.trim() || activeSearchMatch?.pageNumber !== pageNumber) {
      return;
    }

    const activeElement = contentRef.current?.querySelector(`.${ACTIVE_HIGHLIGHT_CLASS}`);
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }

    activeElement.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [content, searchQuery, activeSearchMatch, pageNumber, processedContent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <span className="text-sm opacity-60">Loading content...</span>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="opacity-60">No content available</span>
      </div>
    );
  }

  return (
    <div className="reader-content relative" ref={contentRef} onMouseUp={handleMouseUp}>
      <SharedMarkdownRenderer
        content={processedContent}
        components={markdownComponents}
        rehypePlugins={searchHighlightPlugin ? [searchHighlightPlugin] : undefined}
      />
      <Popover open={isHighlightEditorOpen && !!highlightEditorPosition} onOpenChange={(open) => !open && handleCloseHighlightEditor()}>
        {highlightEditorPosition && (
          <PopoverAnchor asChild>
            <div
              className="fixed z-40 h-px w-px pointer-events-none"
              style={{
                left: `${highlightEditorPosition.x}px`,
                top: `${highlightEditorPosition.y}px`,
              }}
            />
          </PopoverAnchor>
        )}
        <PopoverContent
          side={highlightEditorPosition?.side ?? "bottom"}
          align="center"
          sideOffset={8}
          className="w-80 space-y-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <HighlightEditorPopover onClose={handleCloseHighlightEditor} />
        </PopoverContent>
      </Popover>
      <div ref={popoverRef}>
        {selection && (
          <HighlightPopover
            selectedText={selection.text}
            position={selection.position}
            selectionRange={selection.range}
            onHighlight={handleHighlight}
            onOpenEditor={handleOpenNewHighlightEditor}
            onChatWithText={handleChatWithText}
            onCopy={() => navigator.clipboard.writeText(selection.text)}
            onDismiss={() => setSelection(null)}
          />
        )}
        {activeHighlight && (
          <ExistingHighlightPopover
            highlightId={activeHighlightData?.id || activeHighlight.highlight.id}
            color={activeHighlightData?.color || activeHighlight.highlight.color}
            note={activeHighlightData?.comment}
            tags={activeHighlightData?.tags}
            text={activeHighlightData?.text || activeHighlight.highlight.text}
            position={{
              x: activeHighlight.element.getBoundingClientRect().left + activeHighlight.element.getBoundingClientRect().width / 2,
              y: activeHighlight.element.getBoundingClientRect().top - 10,
            }}
            onUpdateColor={handleUpdateHighlightColor}
            onOpenEditor={handleOpenExistingHighlightEditor}
            onDelete={handleDeleteActiveHighlight}
            onDismiss={() => setActiveHighlight(null)}
          />
        )}
      </div>
    </div>
  );
}
