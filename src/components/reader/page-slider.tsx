import { useState, useRef, useCallback, useMemo } from "react";
import { usePages, usePageMarkdown } from "@/lib/api/queries";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function PageSlider({
  currentPage,
  totalPages,
  onPageChange,
  uploadId,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  uploadId: string;
}) {
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const previewPageNumber = hoverPage ?? (isDragging ? currentPage : null);
  const { data: previewPageData } = usePages(uploadId, previewPageNumber ?? 1, 1);

  const previewPageId = previewPageData?.items[0]?.id;
  const { data: previewMarkdown } = usePageMarkdown(previewPageId);

  const previewSnippet = useMemo(() => {
    if (!previewMarkdown) return null;
    const clean = previewMarkdown
      .replace(/<[^>]*>/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/\*{1,3}|_{1,3}/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\n{2,}/g, "\n")
      .trim();
    return clean.slice(0, 2000) + (clean.length > 2000 ? "…" : "");
  }, [previewMarkdown]);

  const updatePreviewPosition = useCallback(
    (pageNum: number) => {
      if (!sliderRef.current || totalPages <= 1) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = (pageNum - 1) / (totalPages - 1);
      const x = pct * rect.width;
      const halfPreviewWidth = Math.min(140, Math.max(64, rect.width / 2 - 10));
      setPreviewPosition(Math.max(halfPreviewWidth, Math.min(x, rect.width - halfPreviewWidth)));
    },
    [totalPages],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!sliderRef.current || totalPages <= 1) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const page = Math.round(pct * (totalPages - 1)) + 1;
      setHoverPage(page);
      const halfPreviewWidth = Math.min(140, Math.max(64, rect.width / 2 - 10));
      setPreviewPosition(Math.max(halfPreviewWidth, Math.min(e.clientX - rect.left, rect.width - halfPreviewWidth)));
    },
    [totalPages],
  );

  const showPreview = (hoverPage !== null || isDragging) && totalPages > 1;
  const displayPage = hoverPage ?? currentPage;
  const pct = totalPages > 1 ? Math.round(((displayPage - 1) / (totalPages - 1)) * 100) : 0;

  return (
    <div className="relative w-full" ref={sliderRef}>
      {showPreview && (
        <div
          className={cn(
            "absolute bottom-full mb-3 -translate-x-1/2 pointer-events-none z-50",
            "rounded-lg border shadow-sm px-3 py-2 text-sm w-[min(18rem,calc(100%-0.5rem))]",
            "bg-popover border-border text-popover-foreground",
          )}
          style={{
            left: `${previewPosition}px`,
          }}
        >
          <div className="font-medium text-xs mb-1">
            Page {displayPage}
            <span className="font-normal opacity-50 ml-1">/ {totalPages}</span>
            <span className="font-normal opacity-40 ml-1.5">{pct}%</span>
          </div>
          {previewSnippet && <div className="opacity-60 leading-relaxed line-clamp-8 text-[11px]">{previewSnippet}</div>}
          {!previewSnippet && previewPageNumber && <div className="opacity-40 text-xs">Loading preview…</div>}
          <div className={cn("absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-b border-r", "bg-popover border-border")} />
        </div>
      )}
      <Slider
        min={1}
        max={totalPages || 1}
        value={[currentPage]}
        onValueChange={([val]) => {
          onPageChange(val);
          setIsDragging(true);
          updatePreviewPosition(val);
        }}
        onValueCommit={() => {
          setIsDragging(false);
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverPage(null)}
        className="w-full cursor-pointer **:data-[slot=slider-track]:bg-muted/60 **:data-[slot=slider-range]:bg-primary/30 **:data-[slot=slider-thumb]:border-primary/40"
      />
    </div>
  );
}
