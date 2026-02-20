import { useState, useEffect, useRef, useCallback, isValidElement, type ReactNode } from "react";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useSidebar } from "@/components/ui/sidebar";
import { useReaderStore } from "@/lib/stores/reader-store";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { HighlightPopover, ExistingHighlightPopover, HighlightMark } from "@/components/reader/highlight-popover";
import { BlockActions } from "@/components/reader/bookmark-button";
import {
  injectHighlightsIntoMarkdown,
  findTextOffset,
  getSelectionInfo,
  findHighlightElement,
  type SelectionInfo,
  type HighlightInput,
} from "@/lib/highlight-utils";

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
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const editorState = useReaderStore((state) => state.editorState);
  const setEditorState = useReaderStore((state) => state.setEditorState);
  const { toggleSidebar, open: sidebarOpen } = useSidebar();

  const pendingHighlight = editorState?.mode === "pending-highlight" ? editorState.data : null;

  useEffect(() => {
    if (tempHighlight) {
      window.getSelection()?.removeAllRanges();
    }
  }, [tempHighlight]);

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

      requestAnimationFrame(() => {
        const selectionInfo = getSelectionInfo();
        if (selectionInfo && selectionInfo.text.length > 0) {
          setSelection(selectionInfo);
          setActiveHighlight(null);

          if (content) {
            const offsets = findTextOffset(content, selectionInfo.text);
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
      });
    },
    [highlights, content],
  );

  const handleHighlight = useCallback(
    (color: HighlightsColorOptions, note?: string, tags?: string[]) => {
      if (!selection || !content || !onCreateHighlight) return;

      let startOffset, endOffset;
      if (tempHighlight && tempHighlight.text === selection.text) {
        startOffset = tempHighlight.start_offset;
        endOffset = tempHighlight.end_offset;
      } else {
        const offsets = findTextOffset(content, selection.text);
        if (!offsets) {
          console.warn("Could not find text offset for selection");
          return;
        }
        startOffset = offsets.start;
        endOffset = offsets.end;
      }

      onCreateHighlight({
        color,
        text: selection.text,
        note,
        tags,
        start_offset: startOffset,
        end_offset: endOffset,
      });

      setSelection(null);
      setTempHighlight(null);
      window.getSelection()?.removeAllRanges();
    },
    [selection, content, onCreateHighlight, tempHighlight],
  );

  const handleUpdateHighlightColor = useCallback(
    (color: HighlightsColorOptions) => {
      if (!activeHighlight || !onUpdateHighlight) return;
      onUpdateHighlight(activeHighlight.highlight.id, { color });
    },
    [activeHighlight, onUpdateHighlight],
  );

  const handleDeleteActiveHighlight = useCallback(() => {
    if (!activeHighlight || !onDeleteHighlight) return;
    onDeleteHighlight(activeHighlight.highlight.id);
    setActiveHighlight(null);
  }, [activeHighlight, onDeleteHighlight]);

  const handleOpenNewHighlightEditor = useCallback(() => {
    if (!selection || !tempHighlight || !pageId) return;

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

    if (!sidebarOpen) {
      toggleSidebar();
    }

    setSelection(null);
    setTempHighlight(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, tempHighlight, pageId, setEditorState, sidebarOpen, toggleSidebar]);

  const handleOpenExistingHighlightEditor = useCallback(() => {
    if (!activeHighlight || !pageId) return;

    const highlight = activeHighlight.highlight;

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

    if (!sidebarOpen) {
      toggleSidebar();
    }

    setActiveHighlight(null);
  }, [activeHighlight, pageId, setEditorState, sidebarOpen, toggleSidebar]);

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

  return (
    <div className="reader-content relative" ref={contentRef} onMouseUp={handleMouseUp}>
      <Markdown
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            const hasNote = blockId ? hasNoteForBlock(blockId) : false;
            const note = blockId ? getNoteForBlock(blockId) : undefined;
            return (
              <h1 id={blockId} className="text-2xl font-bold mt-8 mb-4 first:mt-0 group relative">
                {blockId && pageId && pageNumber && (
                  <BlockActions
                    blockId={blockId}
                    previewText={extractText(children)}
                    pageId={pageId}
                    pageNumber={pageNumber}
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
          h2: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            const hasNote = blockId ? hasNoteForBlock(blockId) : false;
            const note = blockId ? getNoteForBlock(blockId) : undefined;
            return (
              <h2 id={blockId} className="text-xl font-semibold mt-6 mb-3 group relative">
                {blockId && pageId && pageNumber && (
                  <BlockActions
                    blockId={blockId}
                    previewText={extractText(children)}
                    pageId={pageId}
                    pageNumber={pageNumber}
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
          h3: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <h3 id={blockId} className="text-lg font-medium mt-5 mb-2">
                {children}
              </h3>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm max-w-full whitespace-pre-wrap wrap-break-word">
              {children}
            </pre>
          ),
          code: ({ children }) => <code>{children}</code>,
          blockquote: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <blockquote id={blockId} className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">
                {children}
              </blockquote>
            );
          },
          ul: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <ul id={blockId} className="my-4 pl-6 list-disc space-y-1">
                {children}
              </ul>
            );
          },
          ol: ({ node, children }) => {
            const blockId = getBlockId(node);
            return (
              <ol id={blockId} className="my-4 pl-6 list-decimal space-y-1">
                {children}
              </ol>
            );
          },
          li: ({ children }) => <li>{children}</li>,
          p: ({ node, children }) => {
            const blockId = getBlockId(node);
            const isBookmarked = blockId ? isBlockBookmarked(blockId) : false;
            const bookmark = blockId ? getBookmarkForBlock(blockId) : undefined;
            const hasNote = blockId ? hasNoteForBlock(blockId) : false;
            const note = blockId ? getNoteForBlock(blockId) : undefined;
            return (
              <p id={blockId} className="reader-paragraph group relative">
                {blockId && pageId && pageNumber && (
                  <BlockActions
                    blockId={blockId}
                    previewText={extractText(children)}
                    pageId={pageId}
                    pageNumber={pageNumber}
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
          mark: ({ node, children, ...props }) => {
            const highlightId = (props as any)["data-highlight-id"];
            const className = (props as any).className || "highlight-yellow";
            const highlight = highlights.find((h) => h.id === highlightId);
            return (
              <HighlightMark highlightId={highlightId} className={className} note={highlight?.comment} tags={highlight?.tags}>
                {children}
              </HighlightMark>
            );
          },
        }}
      >
        {processedContent}
      </Markdown>
      <div ref={popoverRef}>
        {selection && (
          <HighlightPopover
            selectedText={selection.text}
            position={selection.position}
            selectionRange={selection.range}
            onHighlight={handleHighlight}
            onOpenEditor={handleOpenNewHighlightEditor}
            onDismiss={() => setSelection(null)}
          />
        )}
        {activeHighlight && (
          <ExistingHighlightPopover
            highlightId={activeHighlight.highlight.id}
            color={activeHighlight.highlight.color}
            note={activeHighlight.highlight.comment}
            tags={activeHighlight.highlight.tags}
            text={activeHighlight.highlight.text}
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
