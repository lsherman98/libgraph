import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFullTextSearch } from "@/lib/api/queries";
import { cn, useDebouncedCallback } from "@/lib/utils";
import { clearSearchHighlights, applySearchHighlights, updateActiveSearchHighlight, reconnectSearchObserver } from "@/lib/utils/search-highlights";

interface SearchMatch {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  occurrenceIndex: number;
}

interface DocumentSearchBarProps {
  uploadId: string;
  onNavigateToPage: (pageNumber: number) => void;
  className?: string;
}

export function DocumentSearchBar({ uploadId, onNavigateToPage, className }: DocumentSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const onNavigateToPageRef = useRef(onNavigateToPage);
  onNavigateToPageRef.current = onNavigateToPage;
  const lastNavigatedPageRef = useRef<number | null>(null);
  const activeMatchRef = useRef({ pageNumber: 0, highlightIndex: 0 });
  const observerRef = useRef<MutationObserver | null>(null);
  const observerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSetQuery = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
    setCurrentMatchIndex(0);
  }, 400);

  const { data: searchResults = [], isLoading } = useFullTextSearch(uploadId, debouncedQuery);

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

  const navigateToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const match = matches[index];
      if (!match) return;

      const highlightIndexOnPage = matches.filter((m, i) => i < index && m.pageNumber === match.pageNumber).length;
      activeMatchRef.current = { pageNumber: match.pageNumber, highlightIndex: highlightIndexOnPage };

      const needsPageChange = lastNavigatedPageRef.current !== match.pageNumber;
      lastNavigatedPageRef.current = match.pageNumber;

      if (needsPageChange) {
        onNavigateToPageRef.current(match.pageNumber);
      }

      if (!needsPageChange) {
        const success = updateActiveSearchHighlight(match.pageNumber, highlightIndexOnPage);
        if (success) return;
      }

      const tryApply = (attempt: number) => {
        if (attempt > 5) return;

        if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
        observerTimerRef.current = null;
        observerRef.current?.disconnect();

        applySearchHighlights(debouncedQuery);
        const success = updateActiveSearchHighlight(match.pageNumber, highlightIndexOnPage);

        reconnectSearchObserver(observerRef, observerTimerRef, debouncedQuery, activeMatchRef);

        if (!success) {
          setTimeout(() => tryApply(attempt + 1), 100);
        }
      };

      requestAnimationFrame(() => tryApply(0));
    },
    [matches, debouncedQuery],
  );

  useEffect(() => {
    if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    observerTimerRef.current = null;
    observerRef.current?.disconnect();
    observerRef.current = null;

    clearSearchHighlights();

    if (debouncedQuery.trim()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applySearchHighlights(debouncedQuery);
          reconnectSearchObserver(observerRef, observerTimerRef, debouncedQuery, activeMatchRef);
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

  useEffect(() => {
    if (matches.length > 0 && debouncedQuery) {
      navigateToMatch(currentMatchIndex);
    }
  }, [currentMatchIndex, matches.length, debouncedQuery]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }

      if (e.key === "Escape" && isOpen) {
        handleClose();
      }

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
    clearSearchHighlights();
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
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border", "bg-background border-border", className)}>
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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToNext} disabled={matches.length === 0} title="Next match (Enter)">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClose} title="Close search (Escape)">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
