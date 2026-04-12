import { type HighlightsResponse, HighlightsColorOptions } from "@/lib/pocketbase-types";

export type HighlightInput = Pick<
    HighlightsResponse,
    'id' | 'start_offset' | 'end_offset' | 'color' | 'text' | 'comment' | 'tags'
> & {
    isPending?: boolean;
};

export function getHighlightBgClass(color: HighlightsColorOptions, isPending?: boolean): string {
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

export function injectHighlightsIntoMarkdown(
    markdown: string,
    highlights: HighlightInput[]
): string {
    if (!highlights.length) return markdown;

    const sorted = [...highlights].sort((a, b) => b.start_offset - a.start_offset);

    let result = markdown;

    for (const highlight of sorted) {
        const { start_offset, end_offset, id, color, isPending } = highlight;

        if (start_offset < 0 || end_offset > result.length || start_offset >= end_offset) {
            continue;
        }

        const before = result.slice(0, start_offset);
        const highlightedText = result.slice(start_offset, end_offset);
        const after = result.slice(end_offset);

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

export function findTextOffset(
    markdown: string,
    selectedText: string,
    approximatePosition?: number
): { start: number; end: number } | null {
    if (!selectedText || !markdown) {
        return null;
    }

    const normalizedSelected = selectedText.trim();

    const findBestMatchIndex = (haystack: string, needle: string): number => {
        if (!needle) return -1;

        let bestIndex = -1;
        let currentIndex = haystack.indexOf(needle);
        let bestDistance = Number.POSITIVE_INFINITY;

        while (currentIndex !== -1) {
            if (approximatePosition === undefined) {
                return currentIndex;
            }

            const distance = Math.abs(currentIndex - approximatePosition);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = currentIndex;
            }

            currentIndex = haystack.indexOf(needle, currentIndex + 1);
        }

        return bestIndex;
    };

    let index = findBestMatchIndex(markdown, normalizedSelected);

    if (index === -1) {
        const normalizedMarkdown = markdown.replace(/\s+/g, " ");
        const normalizedSearch = normalizedSelected.replace(/\s+/g, " ");
        index = findBestMatchIndex(normalizedMarkdown, normalizedSearch);

        if (index !== -1) {
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

    if (index === -1) {
        return null;
    }

    return {
        start: index,
        end: index + normalizedSelected.length,
    };
}

export interface SelectionInfo {
    text: string;
    position: { x: number; y: number };
    range: Range;
}

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
            y: rect.top - 10,
        },
        range,
    };
}

export function findHighlightElement(element: HTMLElement | null): HTMLElement | null {
    while (element) {
        if (element.tagName === "MARK" && element.dataset.highlightId) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

export function getBlockPreviewText(element: HTMLElement): string {
    const text = element.textContent || "";
    return text.slice(0, 150).trim();
}

export const MAX_CHUNK_SIZE = 50_000;

export interface MarkdownChunk {
    content: string;
    startOffset: number;
    endOffset: number;
    index: number;
}

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
            chunks.push({
                content: markdown.slice(cursor),
                startOffset: cursor,
                endOffset: markdown.length,
                index: chunks.length,
            });
            break;
        }

        const searchStart = cursor + Math.floor(maxSize * 0.8);
        const searchRegion = markdown.slice(searchStart, end);
        const lastBreak = searchRegion.lastIndexOf("\n\n");

        if (lastBreak !== -1) {
            end = searchStart + lastBreak + 2;
        } else {
            const lastNewline = searchRegion.lastIndexOf("\n");
            if (lastNewline !== -1) {
                end = searchStart + lastNewline + 1;
            }
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

export function highlightsForChunk(
    highlights: HighlightInput[],
    chunk: MarkdownChunk,
): HighlightInput[] {
    const result: HighlightInput[] = [];

    for (const h of highlights) {
        if (h.end_offset <= chunk.startOffset || h.start_offset >= chunk.endOffset) {
            continue;
        }

        const localStart = Math.max(0, h.start_offset - chunk.startOffset);
        const localEnd = Math.min(chunk.content.length, h.end_offset - chunk.startOffset);

        result.push({
            ...h,
            start_offset: localStart,
            end_offset: localEnd,
        });
    }

    return result;
}
