import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPage } from "@/lib/api/api";
import { useFullTextSearch } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/queryKeys";
import { cn, useDebouncedCallback } from "@/lib/utils";
import { useReaderStore } from "@/lib/stores/reader-store";

interface SearchMatch {
  pageId: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  occurrenceIndex: number;
}

interface ResolvedSearchPage {
  pageId: string;
  pageNumber: number;
}

interface DocumentSearchBarProps {
  uploadId: string;
  onNavigateToPage: (page: ResolvedSearchPage) => void;
  className?: string;
}

export function DocumentSearchBar({ uploadId, onNavigateToPage, className }: DocumentSearchBarProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const onNavigateToPageRef = useRef(onNavigateToPage);
  const setReaderSearchQuery = useReaderStore((state) => state.setSearchQuery);
  const setActiveSearchMatch = useReaderStore((state) => state.setActiveSearchMatch);
  onNavigateToPageRef.current = onNavigateToPage;
  const navigationIdRef = useRef(0);
  const resolvedPageNumbersRef = useRef(new Map<string, number>());
  const [isNavigating, setIsNavigating] = useState(false);

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
        pageId: r.page,
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
          pageId: chunk.pageId,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          occurrenceIndex: occIdx,
        });
        occIdx++;
        if (expanded.length >= MAX_MATCHES) break;
      }
    }

    return expanded;
  }, [searchResults, debouncedQuery]);

  useEffect(() => {
    resolvedPageNumbersRef.current.clear();
  }, [uploadId]);

  const resolvePageForMatch = useCallback(
    async (match: SearchMatch): Promise<ResolvedSearchPage> => {
      const cachedPageNumber = resolvedPageNumbersRef.current.get(match.pageId);
      if (cachedPageNumber != null) {
        return { pageId: match.pageId, pageNumber: cachedPageNumber };
      }

      try {
        const pageRecord = await queryClient.fetchQuery({
          queryKey: queryKeys.pages.detail(match.pageId),
          queryFn: () => getPage(match.pageId),
          staleTime: 60_000,
        });

        const resolvedPageNumber = Number.isFinite(pageRecord.page)
          ? Math.max(1, Math.floor(pageRecord.page))
          : Number.isFinite(match.pageNumber)
            ? Math.max(1, Math.floor(match.pageNumber))
            : 1;

        resolvedPageNumbersRef.current.set(match.pageId, resolvedPageNumber);
        return { pageId: pageRecord.id, pageNumber: resolvedPageNumber };
      } catch {
        const fallbackPageNumber = Number.isFinite(match.pageNumber) ? Math.max(1, Math.floor(match.pageNumber)) : 1;
        resolvedPageNumbersRef.current.set(match.pageId, fallbackPageNumber);
        return { pageId: match.pageId, pageNumber: fallbackPageNumber };
      }
    },
    [queryClient],
  );

  const navigateToMatch = useCallback(
    async (index: number) => {
      if (matches.length === 0) return;
      const match = matches[index];
      if (!match) return;

      // Cancel any previous tryApply loop.
      const navId = ++navigationIdRef.current;
      setIsNavigating(true);

      const resolvedPage = await resolvePageForMatch(match);
      if (navigationIdRef.current !== navId) return;

      const targetPageNumber = resolvedPage.pageNumber;

      const highlightIndexOnPage = matches.filter((m, i) => i < index && m.pageId === match.pageId).length;
      setActiveSearchMatch({ pageNumber: targetPageNumber, highlightIndex: highlightIndexOnPage });

      onNavigateToPageRef.current(resolvedPage);

      requestAnimationFrame(() => {
        if (navigationIdRef.current !== navId) return;
        setIsNavigating(false);
      });
    },
    [matches, resolvePageForMatch, setActiveSearchMatch],
  );

  useEffect(() => {
    setReaderSearchQuery(debouncedQuery);

    if (!debouncedQuery.trim()) {
      setActiveSearchMatch(null);
      setIsNavigating(false);
    }
  }, [debouncedQuery, setActiveSearchMatch, setReaderSearchQuery]);

  useEffect(() => {
    return () => {
      setReaderSearchQuery("");
      setActiveSearchMatch(null);
    };
  }, [setActiveSearchMatch, setReaderSearchQuery]);

  useEffect(() => {
    if (!debouncedQuery.trim() || matches.length === 0) {
      setActiveSearchMatch(null);
      setIsNavigating(false);
      return;
    }

    navigateToMatch(currentMatchIndex);
  }, [currentMatchIndex, matches, debouncedQuery, navigateToMatch, setActiveSearchMatch]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setDebouncedQuery("");
    setCurrentMatchIndex(0);
    setReaderSearchQuery("");
    setActiveSearchMatch(null);
  }, [setActiveSearchMatch, setReaderSearchQuery]);

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
      {(isLoading || isNavigating) && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 opacity-50" />}
      {!isLoading && !isNavigating && debouncedQuery && (
        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 shrink-0 font-mono">
          {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : "0/0"}
        </Badge>
      )}
      <div className="flex items-center shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToPrev} disabled={matches.length === 0}>
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToNext} disabled={matches.length === 0}>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClose} title="Close search (Escape)">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
