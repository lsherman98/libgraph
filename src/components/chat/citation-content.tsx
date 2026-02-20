import { useMemo } from "react";
import { FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatSource } from "@/lib/types";

interface CitationContentProps {
  content: string;
  sources: ChatSource[];
  citationMap: Map<string, number>;
  onSourceClick?: (source: ChatSource) => void;
}

export function CitationContent({ content, sources, citationMap, onSourceClick }: CitationContentProps) {
  const sourceByNodeId = useMemo(() => {
    const m = new Map<string, ChatSource>();
    for (const s of sources) {
      if (s.node_id) m.set(s.node_id, s);
    }
    return m;
  }, [sources]);

  const parts = useMemo(() => {
    const result: { type: "text" | "citation"; value: string }[] = [];
    const regex = /\[citation:([a-z0-9]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      result.push({ type: "citation", value: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      result.push({ type: "text", value: content.slice(lastIndex) });
    }
    return result;
  }, [content]);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {part.value}
            </span>
          );
        }

        const num = citationMap.get(part.value);
        const source = sourceByNodeId.get(part.value);
        if (!num) return null;

        return (
          <Popover key={i}>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-semibold rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors align-super cursor-pointer leading-none ml-0.5">
                      {num}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {source?.title || "Document"}
                  {source?.page_number ? ` · p.${source.page_number}` : ""}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent side="top" align="start" className="w-96 max-h-64 overflow-y-auto p-3">
              {source ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSourceClick?.(source)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer text-left"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      {source.title || "Document"}
                      {source.page_number ? <span className="text-muted-foreground ml-1">p.{source.page_number}</span> : null}
                    </button>
                    {source.score != null && (
                      <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {Math.round(source.score * 100)}%
                      </span>
                    )}
                  </div>
                  {source.text && (
                    <p className="text-xs leading-relaxed text-muted-foreground italic">
                      "{source.text.length > 500 ? source.text.slice(0, 500) + "…" : source.text}"
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Source not found</p>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </span>
  );
}
