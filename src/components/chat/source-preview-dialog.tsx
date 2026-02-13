import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, Hash } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePageByNumber, usePageMarkdown } from "@/lib/api/queries";
import type { ChatSource } from "@/lib/api/api";
import { useMemo, useRef, useEffect } from "react";

interface SourcePreviewDialogProps {
  source: ChatSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourcePreviewDialog({ source, open, onOpenChange }: SourcePreviewDialogProps) {
  const uploadId = source?.upload_id ?? null;
  const pageNumber = source?.page_number ?? null;

  // Look up the page record by upload_id + page_number to get the page_id
  const { data: pageRecord } = usePageByNumber(open ? uploadId : null, open ? pageNumber : null);
  const pageId = pageRecord?.id ?? null;

  // Fetch the full page markdown content
  const { data: markdown, isLoading: isLoadingMarkdown } = usePageMarkdown(open ? pageId : null);

  // Ref for auto-scrolling to the highlighted chunk
  const highlightRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlightRef.current) {
      // Small delay to let the dialog render fully
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [markdown, source?.text]);

  // Find the chunk text within the page markdown and render with highlight
  const renderedContent = useMemo(() => {
    if (!markdown) return null;

    const markClass = "px-0.5 rounded bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200";

    // Best case: use start_char_idx / end_char_idx for precise highlighting
    if (source?.start_char_idx != null && source?.end_char_idx != null) {
      const before = markdown.slice(0, source.start_char_idx);
      const highlighted = markdown.slice(source.start_char_idx, source.end_char_idx);
      const after = markdown.slice(source.end_char_idx);

      return (
        <>
          <span>{before}</span>
          <mark ref={highlightRef} className={markClass}>
            {highlighted}
          </mark>
          <span>{after}</span>
        </>
      );
    }

    // Fallback: try to find the chunk text in the page content
    if (source?.text) {
      const chunkText = source.text.trim();
      const index = markdown.indexOf(chunkText);

      if (index !== -1) {
        const before = markdown.slice(0, index);
        const highlighted = markdown.slice(index, index + chunkText.length);
        const after = markdown.slice(index + chunkText.length);

        return (
          <>
            <span>{before}</span>
            <mark ref={highlightRef} className={markClass}>
              {highlighted}
            </mark>
            <span>{after}</span>
          </>
        );
      }

      // Last resort: fuzzy match on first ~100 chars
      const shortChunk = chunkText.slice(0, 100);
      const fuzzyIndex = markdown.indexOf(shortChunk);

      if (fuzzyIndex !== -1) {
        const before = markdown.slice(0, fuzzyIndex);
        const highlighted = markdown.slice(fuzzyIndex, fuzzyIndex + chunkText.length);
        const after = markdown.slice(fuzzyIndex + chunkText.length);

        return (
          <>
            <span>{before}</span>
            <mark ref={highlightRef} className={markClass}>
              {highlighted}
            </mark>
            <span>{after}</span>
          </>
        );
      }
    }

    // No match found — show the full page content unhighlighted
    return <span>{markdown}</span>;
  }, [markdown, source?.text, source?.start_char_idx, source?.end_char_idx]);

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="truncate">{source.title || "Document"}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            {pageNumber != null && (
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                Page {pageNumber}
              </span>
            )}
            {source.score != null && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {Math.round(source.score * 100)}% Match
              </Badge>
            )}
            <span>• Click "Open in Reader" to navigate to this document</span>
          </DialogDescription>
        </DialogHeader>

        {/* Source chunk excerpt - fixed at top */}
        {source.text && (
          <div className="shrink-0 mb-2">
            <div className="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <p className="text-sm font-medium italic">
                "{source.text.length > 300 ? source.text.slice(0, 300) + "…" : source.text}"
              </p>
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
            {isLoadingMarkdown || (open && uploadId && pageNumber != null && !pageId) ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : markdown ? (
              <div className="text-sm text-foreground/80 font-serif leading-relaxed whitespace-pre-wrap">
                {renderedContent}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Could not load page content</div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {source.upload_id && (
            <Button asChild className="gap-2">
              <Link
                to="/workspace"
                search={{ id: source.upload_id, type: "upload" }}
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4" />
                Open in Reader
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
