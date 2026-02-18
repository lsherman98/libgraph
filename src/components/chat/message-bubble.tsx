import { useMemo } from "react";
import { User, Bot, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CitationContent } from "@/components/chat/citation-content";
import { buildCitationMap } from "@/components/chat/citation-utils";
import type { ChatSource, ChatMessage } from "@/lib/types";

export interface LocalMessage extends ChatMessage {
  id: string;
  sources?: ChatSource[];
  isLoading?: boolean;
}

interface MessageBubbleProps {
  message: LocalMessage;
  onSourceClick?: (source: ChatSource) => void;
}

export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasCitations = !isUser && message.content?.includes("[citation:");

  const citationMap = useMemo(
    () => (hasCitations && message.sources ? buildCitationMap(message.content, message.sources) : new Map<string, number>()),
    [hasCitations, message.content, message.sources],
  );

  if (message.isLoading) {
    return (
      <div className="flex gap-4">
        <MessageAvatar role="assistant" />
        <div className="flex-1 space-y-3 pt-1">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <Skeleton className="h-4 w-2/3 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <MessageAvatar role={message.role} />
      <div className="flex-1 min-w-0 space-y-3 pt-1">
        <div className="text-sm font-medium text-muted-foreground">{isUser ? "You" : "Assistant"}</div>
        <div className="text-sm leading-relaxed">
          {hasCitations && message.sources ? (
            <CitationContent content={message.content} sources={message.sources} citationMap={citationMap} onSourceClick={onSourceClick} />
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} citationMap={citationMap} onSourceClick={onSourceClick} />
        )}
      </div>
    </div>
  );
}

function MessageAvatar({ role }: { role: "user" | "assistant" }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        role === "user" ? "bg-secondary text-secondary-foreground" : "bg-linear-to-br from-primary to-primary/80 text-primary-foreground",
      )}
    >
      {role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  );
}

function SourceList({
  sources,
  citationMap,
  onSourceClick,
}: {
  sources: ChatSource[];
  citationMap: Map<string, number>;
  onSourceClick?: (source: ChatSource) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-2">
      <span className="text-[11px] text-muted-foreground">Sources</span>
      {sources.map((source, idx) => {
        const citNum = source.node_id ? citationMap.get(source.node_id) : idx + 1;
        return (
          <Popover key={idx}>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-[10px] font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                      {citNum ?? idx + 1}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {source.title || "Document"}{source.page_number ? ` · p.${source.page_number}` : ""}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent side="top" align="start" className="w-80 max-h-56 overflow-y-auto p-3">
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
                    "{source.text.length > 300 ? source.text.slice(0, 300) + "…" : source.text}"
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
