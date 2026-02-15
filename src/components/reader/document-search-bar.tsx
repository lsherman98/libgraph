import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFullTextSearch } from "@/lib/api/queries";
import { cn, useDebouncedCallback } from "@/lib/utils";

interface SearchMatch {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  occurrenceIndex: number;
}

interface DocumentSearchBarProps {
  uploadId: string;
  onNavigateToPage: (pageNumber: number) => void;
  isReadingMode?: boolean;
  className?: string;
}

export function DocumentSearchBar({
  uploadId,
  onNavigateToPage,
  isReadingMode = false,
  className,
}: DocumentSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const onNavigateToPageRef = useRef(onNavigateToPage);
  onNavigateToPageRef.current = onNavigateToPage;
  const lastNavigatedPageRef = useRef<number | null>(null);
  // Track active match state so MutationObserver can restore highlights after React re-renders
  const activeMatchRef = useRef({ pageNumber: 0, highlightIndex: 0 });
  const observerRef = useRef<MutationObserver | null>(null);
  const observerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSetQuery = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
    setCurrentMatchIndex(0);
  }, 400);

  const { data: searchResults = [], isLoading } = useFullTextSearch(uploadId, debouncedQuery);

  // Build ordered match list, expanding each chunk to individual term occurrences
  // Capped at MAX_MATCHES to avoid performance issues on broad search terms
  const MAX_MATCHES = 500;
  const matches: SearchMatch[] = useMemo(() => {
    if (!debouncedQuery.trim() || searchResults.length === 0) return [];

    const terms = debouncedQuery
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

    const sortedChunks = [...searchResults]
      .map((r) => ({
        pageNumber: parseInt(r.page_number, 10),
        chunkIndex: parseInt(r.chunk_index, 10),
        content: r.content,
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber || a.chunkIndex - b.chunkIndex);

    const expanded: SearchMatch[] = [];
    for (const chunk of sortedChunks) {
      if (expanded.length >= MAX_MATCHES) break;
      regex.lastIndex = 0;
      let occIdx = 0;
      while (regex.exec(chunk.content) !== null) {
        expanded.push({
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          occurrenceIndex: occIdx,
        });
        occIdx++;
        if (expanded.length >= MAX_MATCHES) break;
      }
      // If FTS matched but our simple regex didn't, still include one entry
      if (occIdx === 0) {
        expanded.push({
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          occurrenceIndex: 0,
        });
      }
    }

    return expanded;
  }, [searchResults, debouncedQuery]);

  // Navigate to current match's page and highlight
  const navigateToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const match = matches[index];
      if (!match) return;

      // Compute how many individual occurrences precede this one on the same page
      const highlightIndexOnPage = matches.filter((m, i) => i < index && m.pageNumber === match.pageNumber).length;

      // Store for re-application by MutationObserver
      activeMatchRef.current = { pageNumber: match.pageNumber, highlightIndex: highlightIndexOnPage };

      // Only trigger page navigation when the page actually changes
      const needsPageChange = lastNavigatedPageRef.current !== match.pageNumber;
      lastNavigatedPageRef.current = match.pageNumber;

      if (needsPageChange) {
        onNavigateToPageRef.current(match.pageNumber);
      }

      // For same-page cycling: try updating the active highlight directly
      if (!needsPageChange) {
        const success = updateActiveHighlight(match.pageNumber, highlightIndexOnPage);
        if (success) return;
      }

      // Highlights are missing or we changed pages — apply with retry
      const tryApply = (attempt: number) => {
        if (attempt > 5) return;

        // Disconnect observer while we modify the DOM
        if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
        observerTimerRef.current = null;
        observerRef.current?.disconnect();

        applyHighlights(debouncedQuery);
        const success = updateActiveHighlight(match.pageNumber, highlightIndexOnPage);

        // Reconnect observer
        reconnectObserver(observerRef, observerTimerRef, debouncedQuery, activeMatchRef);

        if (!success) {
          // Content may not be rendered yet (cross-page navigation) — retry
          setTimeout(() => tryApply(attempt + 1), 100);
        }
      };

      requestAnimationFrame(() => tryApply(0));
    },
    [matches, debouncedQuery],
  );

  // Clear and re-apply highlights when the query changes
  useEffect(() => {
    // Kill any pending observer callback from previous query
    if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    observerTimerRef.current = null;
    observerRef.current?.disconnect();
    observerRef.current = null;

    clearHighlights();

    if (debouncedQuery.trim()) {
      // Use double-rAF to let React fully commit before DOM manipulation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyHighlights(debouncedQuery);
          reconnectObserver(observerRef, observerTimerRef, debouncedQuery, activeMatchRef);
        });
      });
    }

    return () => {
      if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
      observerTimerRef.current = null;
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [debouncedQuery]);

  // Navigate to match when currentMatchIndex changes
  useEffect(() => {
    if (matches.length > 0 && debouncedQuery) {
      navigateToMatch(currentMatchIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatchIndex, matches.length, debouncedQuery]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to open search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }

      // Escape to close
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }

      // Enter to go to next, Shift+Enter for previous
      if (e.key === "Enter" && isOpen && matches.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrev();
        } else {
          goToNext();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, matches.length, goToNext, goToPrev]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setDebouncedQuery("");
    setCurrentMatchIndex(0);
    lastNavigatedPageRef.current = null;
    activeMatchRef.current = { pageNumber: 0, highlightIndex: 0 };
    if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    observerTimerRef.current = null;
    observerRef.current?.disconnect();
    observerRef.current = null;
    clearHighlights();
  }, []);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
    debouncedSetQuery(value);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        title="Search document (Ctrl+F)"
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md border",
        isReadingMode ? "bg-(--reader-bg-color) border-(--reader-text-color)/20" : "bg-background border-border",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
      <Input
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="Search in document..."
        className="h-7 w-40 border-0 px-1 text-sm shadow-none focus-visible:ring-0"
      />
      {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 opacity-50" />}
      {!isLoading && debouncedQuery && (
        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 shrink-0 font-mono">
          {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : "0/0"}
        </Badge>
      )}
      <div className="flex items-center shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={goToPrev}
          disabled={matches.length === 0}
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={goToNext}
          disabled={matches.length === 0}
          title="Next match (Enter)"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={handleClose}
        title="Close search (Escape)"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---- Client-side highlight helpers ----

const HIGHLIGHT_CLASS = "fts-search-highlight";
const ACTIVE_HIGHLIGHT_CLASS = "fts-search-highlight-active";

/**
 * Find the stable reader container element.
 * Uses data-reader-root attribute set on the reader pane wrapper.
 */
function getReaderContainer(): Element | null {
  return document.querySelector("[data-reader-root]");
}

/**
 * Clears all FTS search highlights from the document.
 * Batches DOM reads and writes to avoid layout thrashing.
 */
function clearHighlights() {
  const marks = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  if (marks.length === 0) return;

  // Collect all marks and their parents first (read phase)
  const ops: { mark: Element; parent: Node; textNode: Text }[] = [];
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      ops.push({ mark, parent, textNode: document.createTextNode(mark.textContent || "") });
    }
  });

  // Perform all replacements (write phase)
  for (const { mark, parent, textNode } of ops) {
    parent.replaceChild(textNode, mark);
  }

  // Normalize in a separate pass to merge adjacent text nodes
  const parents = new Set(ops.map((o) => o.parent));
  for (const parent of parents) {
    parent.normalize();
  }
}

/**
 * Applies highlight spans to all matching terms in the rendered reader content.
 * Always clears existing highlights first, then re-applies fresh ones.
 * Returns the number of highlights created.
 */
function applyHighlights(query: string): number {
  if (!query.trim()) return 0;

  const container = getReaderContainer();
  if (!container) return 0;

  // Always clear first to handle partial/stale highlights
  clearHighlights();

  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  // Build a regex that matches any of the search terms
  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  // Walk text nodes in the container
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (parent?.classList.contains(HIGHLIGHT_CLASS) || parent?.tagName === "MARK" || parent?.tagName === "STYLE") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  let globalHighlightCount = 0;

  textNodes.forEach((textNode) => {
    const text = textNode.textContent || "";
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const span = document.createElement("span");
      span.className = HIGHLIGHT_CLASS;
      span.textContent = match[0];
      span.dataset.highlightIndex = String(globalHighlightCount);
      globalHighlightCount++;

      fragment.appendChild(span);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  return globalHighlightCount;
}

/**
 * Updates which highlight is marked as active and scrolls to it.
 * Returns true if the target highlight was found and activated.
 */
function updateActiveHighlight(pageNumber: number, highlightIndexOnPage: number): boolean {
  const allHighlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  if (allHighlights.length === 0) return false;

  // Remove active class from all highlights
  allHighlights.forEach((el) => el.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

  // Find the correct highlight on the target page
  const pageElement = document.getElementById(`page-${pageNumber}`);
  let targetHighlight: Element | null = null;

  if (pageElement) {
    const pageHighlights = pageElement.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    if (pageHighlights.length > highlightIndexOnPage) {
      targetHighlight = pageHighlights[highlightIndexOnPage];
    } else if (pageHighlights.length > 0) {
      // Clamp to last available highlight on this page
      targetHighlight = pageHighlights[pageHighlights.length - 1];
    }
  }

  // Fallback when no page element found: use absolute index across all highlights
  if (!targetHighlight) {
    if (allHighlights.length > highlightIndexOnPage) {
      targetHighlight = allHighlights[highlightIndexOnPage];
    } else if (allHighlights.length > 0) {
      targetHighlight = allHighlights[0];
    }
  }

  if (targetHighlight) {
    targetHighlight.classList.add(ACTIVE_HIGHLIGHT_CLASS);
    targetHighlight.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  return false;
}

/**
 * Sets up or reconnects a MutationObserver that re-applies highlights
 * when React re-renders destroy the injected highlight spans.
 */
function reconnectObserver(
  observerRef: React.MutableRefObject<MutationObserver | null>,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  query: string,
  activeMatchRef: React.MutableRefObject<{ pageNumber: number; highlightIndex: number }>,
) {
  // Clear any pending callback and disconnect existing observer
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
  observerRef.current?.disconnect();

  const container = getReaderContainer();
  if (!container || !query.trim()) return;

  let retryCount = 0;
  const MAX_RETRIES = 3;

  const observer = new MutationObserver(() => {
    // Debounce rapid mutations — store timer on shared ref so it can be cancelled
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      // Check if highlights were lost
      if (!container.querySelector(`.${HIGHLIGHT_CLASS}`) && query.trim()) {
        if (retryCount >= MAX_RETRIES) return;
        retryCount++;

        // Disconnect to prevent recursion while modifying DOM
        observer.disconnect();

        applyHighlights(query);
        const { pageNumber, highlightIndex } = activeMatchRef.current;
        updateActiveHighlight(pageNumber, highlightIndex);

        // Reconnect after our DOM changes are committed
        requestAnimationFrame(() => {
          try {
            observer.observe(container, { childList: true, subtree: true });
          } catch {
            /* observer or container may have been cleaned up */
          }
        });
      } else {
        // Highlights exist — reset retry count
        retryCount = 0;
      }
    }, 150);
  });

  observer.observe(container, { childList: true, subtree: true });
  observerRef.current = observer;
}
