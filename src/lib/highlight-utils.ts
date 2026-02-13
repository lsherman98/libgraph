import { type HighlightsResponse, HighlightsColorOptions } from "@/lib/pocketbase-types";

/**
 * Represents a highlight range in the markdown source
 */
export interface HighlightRange {
    id: string;
    startOffset: number;
    endOffset: number;
    color: HighlightsColorOptions;
    note?: string;
    tags?: string[];
    text: string;
    isPending?: boolean; // For temp highlights being edited in sidebar
}

/**
 * Convert API highlights to HighlightRange format
 */
export function toHighlightRanges(highlights: HighlightsResponse[]): HighlightRange[] {
    return highlights.map((h) => ({
        id: h.id,
        startOffset: h.start_offset,
        endOffset: h.end_offset,
        color: h.color,
        note: h.comment || undefined,
        tags: h.tags || [],
        text: h.text,
    }));
}

/**
 * Get highlight color class for Tailwind
 */
export function getHighlightBgClass(color: HighlightsColorOptions, isPending?: boolean): string {
    // Pending highlights show as gray
    if (isPending) {
        return "highlight-pending";
    }

    switch (color) {
        case HighlightsColorOptions.yellow:
            return "highlight-yellow";
        case HighlightsColorOptions.green:
            return "highlight-green";
        case HighlightsColorOptions.blue:
            return "highlight-blue";
        case HighlightsColorOptions.pink:
            return "highlight-pink";
        case HighlightsColorOptions.purple:
            return "highlight-purple";
        default:
            return "highlight-yellow";
    }
}

/**
 * Inject highlight markers into markdown content.
 * Returns the modified markdown string with <mark> tags inserted.
 * 
 * Note: This approach works best with plain text content.
 * For complex markdown with nested formatting, consider using rehype plugins.
 */
export function injectHighlightsIntoMarkdown(
    markdown: string,
    highlights: HighlightRange[]
): string {
    if (!highlights.length) return markdown;

    // Sort highlights by start offset descending (so we don't shift indices)
    const sorted = [...highlights].sort((a, b) => b.startOffset - a.startOffset);

    let result = markdown;

    for (const highlight of sorted) {
        const { startOffset, endOffset, id, color, isPending } = highlight;

        // Validate offsets
        if (startOffset < 0 || endOffset > result.length || startOffset >= endOffset) {
            console.warn(`Invalid highlight offsets: ${startOffset}-${endOffset} for text length ${result.length}`);
            continue;
        }

        const before = result.slice(0, startOffset);
        const highlightedText = result.slice(startOffset, endOffset);
        const after = result.slice(endOffset);

        // Use grey color for temp selection or pending highlights, otherwise use the highlight color
        let colorClass: string;
        if (id === 'temp-selection' || isPending) {
            colorClass = 'highlight-pending';
        } else {
            colorClass = getHighlightBgClass(color);
        }
        result = `${before}<mark class="${colorClass}" data-highlight-id="${id}">${highlightedText}</mark>${after}`;
    }

    return result;
}

/**
 * Find the offset of selected text within the source markdown.
 * Uses fuzzy matching to handle minor differences.
 */
export function findTextOffset(
    markdown: string,
    selectedText: string,
    approximatePosition?: number
): { start: number; end: number } | null {
    if (!selectedText || !markdown) return null;

    // Normalize whitespace for comparison
    const normalizedSelected = selectedText.trim();

    // Try exact match first
    let index = markdown.indexOf(normalizedSelected);

    if (index === -1) {
        // Try with normalized whitespace
        const normalizedMarkdown = markdown.replace(/\s+/g, " ");
        const normalizedSearch = normalizedSelected.replace(/\s+/g, " ");
        index = normalizedMarkdown.indexOf(normalizedSearch);

        if (index !== -1) {
            // Map back to original markdown position
            // This is approximate - for complex cases, we'd need character mapping
            let originalIndex = 0;
            let normalizedIndex = 0;
            while (normalizedIndex < index && originalIndex < markdown.length) {
                if (/\s/.test(markdown[originalIndex])) {
                    while (originalIndex < markdown.length && /\s/.test(markdown[originalIndex])) {
                        originalIndex++;
                    }
                    normalizedIndex++;
                } else {
                    originalIndex++;
                    normalizedIndex++;
                }
            }
            index = originalIndex;
        }
    }

    if (index === -1) {
        // If still not found, try fuzzy search near approximate position
        if (approximatePosition !== undefined) {
            const searchWindow = 200;
            const windowStart = Math.max(0, approximatePosition - searchWindow);
            const windowEnd = Math.min(markdown.length, approximatePosition + searchWindow);
            const windowText = markdown.slice(windowStart, windowEnd);

            const windowIndex = windowText.indexOf(normalizedSelected);
            if (windowIndex !== -1) {
                index = windowStart + windowIndex;
            }
        }
    }

    if (index === -1) return null;

    return {
        start: index,
        end: index + normalizedSelected.length,
    };
}

/**
 * Selection info from DOM
 */
export interface SelectionInfo {
    text: string;
    position: { x: number; y: number };
    range: Range;
}

/**
 * Get selection info from the current DOM selection
 */
export function getSelectionInfo(): SelectionInfo | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
        return null;
    }

    const text = selection.toString().trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    return {
        text,
        position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10, // Position above the selection
        },
        range,
    };
}

/**
 * Check if an element or its parent is a highlight
 */
export function findHighlightElement(element: HTMLElement | null): HTMLElement | null {
    while (element) {
        if (element.tagName === "MARK" && element.dataset.highlightId) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

/**
 * Extract text content from a node for block preview
 */
export function getBlockPreviewText(element: HTMLElement): string {
    const text = element.textContent || "";
    return text.slice(0, 150).trim();
}

// --- Large markdown chunking utilities ---

/**
 * Maximum characters per chunk before we split a page into sub-pages.
 * 5 MB of markdown — only extremely large files will be chunked.
 */
export const MAX_CHUNK_SIZE = 50_000;

/**
 * A chunk of markdown content and its byte-offset range in the original source.
 */
export interface MarkdownChunk {
    /** The markdown text for this chunk */
    content: string;
    /** Start character offset in the original full markdown */
    startOffset: number;
    /** End character offset (exclusive) in the original full markdown */
    endOffset: number;
    /** 0-based chunk index */
    index: number;
}

/**
 * Split large markdown content into smaller chunks at paragraph boundaries (\n\n).
 * If the content is under maxSize it is returned as a single chunk.
 */
export function splitMarkdownIntoChunks(
    markdown: string,
    maxSize: number = MAX_CHUNK_SIZE,
): MarkdownChunk[] {
    if (markdown.length <= maxSize) {
        return [{ content: markdown, startOffset: 0, endOffset: markdown.length, index: 0 }];
    }

    const chunks: MarkdownChunk[] = [];
    let cursor = 0;

    while (cursor < markdown.length) {
        let end = cursor + maxSize;

        if (end >= markdown.length) {
            // Last chunk – take everything remaining
            chunks.push({
                content: markdown.slice(cursor),
                startOffset: cursor,
                endOffset: markdown.length,
                index: chunks.length,
            });
            break;
        }

        // Try to find a paragraph boundary (\n\n) to split on, searching backwards
        // from the max position. Look within the last 20% of the chunk to avoid
        // chunks that are too small.
        const searchStart = cursor + Math.floor(maxSize * 0.8);
        const searchRegion = markdown.slice(searchStart, end);
        const lastBreak = searchRegion.lastIndexOf("\n\n");

        if (lastBreak !== -1) {
            end = searchStart + lastBreak + 2; // include the \n\n in the current chunk
        } else {
            // No paragraph break found – try a single newline
            const lastNewline = searchRegion.lastIndexOf("\n");
            if (lastNewline !== -1) {
                end = searchStart + lastNewline + 1;
            }
            // else: hard-cut at maxSize (very long paragraph)
        }

        chunks.push({
            content: markdown.slice(cursor, end),
            startOffset: cursor,
            endOffset: end,
            index: chunks.length,
        });

        cursor = end;
    }

    return chunks;
}

/**
 * Map page-level highlights to chunk-local highlights by adjusting offsets.
 * Only highlights that overlap with the chunk's range are returned.
 */
export function highlightsForChunk(
    highlights: HighlightRange[],
    chunk: MarkdownChunk,
): HighlightRange[] {
    const result: HighlightRange[] = [];

    for (const h of highlights) {
        // Check for overlap
        if (h.endOffset <= chunk.startOffset || h.startOffset >= chunk.endOffset) {
            continue; // no overlap
        }

        // Clamp + adjust offsets to chunk-local coordinates
        const localStart = Math.max(0, h.startOffset - chunk.startOffset);
        const localEnd = Math.min(chunk.content.length, h.endOffset - chunk.startOffset);

        result.push({
            ...h,
            startOffset: localStart,
            endOffset: localEnd,
        });
    }

    return result;
}
