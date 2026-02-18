import { useState, useMemo } from "react";
import { FileText, ChevronDown, ChevronRight, ExternalLink, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ChatSource } from "@/lib/types";

interface SearchResultSourcesProps {
  sources: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
}

export function SearchResultSources({ sources, onSourceClick }: SearchResultSourcesProps) {
  const sortedSources = useMemo(() => [...sources].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [sources]);

  if (sortedSources.length === 0) return null;

  return (
    <div className="space-y-2 pt-3">
      <div className="flex items-center gap-2 pb-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {sortedSources.length} Source{sortedSources.length !== 1 ? "s" : ""} Found
        </span>
      </div>
      <div className="grid gap-2">
        {sortedSources.map((source, idx) => (
          <SourceCard key={idx} source={source} rank={idx + 1} onSourceClick={onSourceClick} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source, rank, onSourceClick }: { source: ChatSource; rank: number; onSourceClick?: (source: ChatSource) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scorePercent = source.score != null ? Math.round(source.score * 100) : null;
  const hasText = !!source.text?.trim();

  return (
    <div className="group rounded-lg border border-border bg-card transition-colors hover:border-primary/30 hover:bg-accent/30">
      <div className="flex items-start gap-3 p-3">
        {/* Rank indicator */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">{rank}</div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSourceClick?.(source)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer text-left truncate"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{source.title || "Untitled Document"}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 flex-wrap">
            {source.page_number != null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal">
                <Hash className="h-2.5 w-2.5" />
                Page {source.page_number}
              </Badge>
            )}
            {scorePercent != null && (
              <div className="flex items-center gap-1.5">
                <Progress value={scorePercent} className="h-1.5 w-16" />
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
                  {scorePercent}% match
                </span>
              </div>
            )}
          </div>

          {/* Text excerpt */}
          {hasText && (
            <div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {isExpanded ? "Hide excerpt" : "Show excerpt"}
              </button>
              {isExpanded && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground bg-muted/50 rounded-md p-2.5 border border-border/50">
                  {source.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
