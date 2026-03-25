import { useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatSource } from "@/lib/types";

interface SearchResultSourcesProps {
  sources: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
}

export function SearchResultSources({ sources, onSourceClick }: SearchResultSourcesProps) {
  const sortedSources = useMemo(() => [...sources].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [sources]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (sortedSources.length === 0) return null;

  const clampedSelectedIndex = Math.min(selectedIndex, sortedSources.length - 1);
  const selectedSource = sortedSources[clampedSelectedIndex];

  return (
    <div className="space-y-1.5 pt-2">
      <div className="flex items-center gap-2 pb-1">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {sortedSources.length} Source{sortedSources.length !== 1 ? "s" : ""} Found
        </span>
      </div>
      <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-1.5">
          {sortedSources.map((source, idx) => {
            const sourceKey = `${source.node_id ?? source.upload_id ?? "source"}-${idx}`;

            return (
              <SourceCard
                key={sourceKey}
                source={source}
                rank={idx + 1}
                isSelected={idx === clampedSelectedIndex}
                onSelect={() => setSelectedIndex(idx)}
              />
            );
          })}
        </div>
        <SourcePreviewPanel source={selectedSource} onSourceClick={onSourceClick} />
      </div>
    </div>
  );
}

function SourceCard({ source, rank, isSelected, onSelect }: { source: ChatSource; rank: number; isSelected: boolean; onSelect: () => void }) {
  const scorePercent = source.score != null ? Math.round(source.score * 100) : null;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group cursor-pointer rounded-md border bg-card transition-colors hover:border-primary/30 hover:bg-accent/30",
        isSelected ? "border-primary/40 bg-accent/20" : "border-border",
      )}
    >
      <div className="flex items-start gap-2 p-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary text-[10px] font-bold">{rank}</div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-start gap-2">
            <div className="inline-flex min-w-0 items-start gap-1 text-xs font-medium text-foreground">
              <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{source.title || "Untitled Document"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {source.page_number != null && (
              <Badge variant="outline" className="h-4 gap-1 px-1 py-0 text-[10px] font-normal">
                Page {source.page_number}
              </Badge>
            )}
            {scorePercent != null && (
              <span
                className={cn(
                  "text-[10px] tabular-nums font-medium",
                  scorePercent >= 70
                    ? "text-green-600 dark:text-green-400"
                    : scorePercent >= 40
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-muted-foreground",
                )}
              >
                {scorePercent}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcePreviewPanel({ source, onSourceClick }: { source: ChatSource; onSourceClick?: (source: ChatSource) => void }) {
  const fullText = source.text?.trim();

  return (
    <div className="rounded-md border border-border bg-card p-3.5 lg:sticky lg:top-2">
      <div className="space-y-1 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Selected source</div>
        <div className="text-sm font-medium text-foreground wrap-break-word">{source.title || "Untitled Document"}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {source.page_number != null ? <span>Page {source.page_number}</span> : null}
          {source.score != null ? <span>{Math.round(source.score * 100)}% match</span> : null}
        </div>
        <div>
          <button
            onClick={() => onSourceClick?.(source)}
            className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </button>
        </div>
      </div>
      <div className="min-h-64 max-h-112 overflow-y-auto rounded-sm border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
        {fullText || "No source text available for this result."}
      </div>
    </div>
  );
}
