import { useMemo } from "react";
import { User, Bot, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="space-y-2 pt-2">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sources</p>
      <div className="grid grid-cols-1 gap-2">
        {sources.map((source, idx) => {
          const citNum = source.node_id ? citationMap.get(source.node_id) : undefined;
          return (
            <button
              key={idx}
              onClick={() => onSourceClick?.(source)}
              className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 text-left w-full cursor-pointer"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  {citNum != null && (
                    <span className="flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-semibold rounded bg-primary/15 text-primary shrink-0">
                      {citNum}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:underline truncate">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{source.title || "Document"}</span>
                    {source.page_number ? <span className="text-muted-foreground ml-1 shrink-0">p.{source.page_number}</span> : null}
                  </span>
                </div>
                {source.score != null && (
                  <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {Math.round(source.score * 100)}% Match
                  </span>
                )}
              </div>
              {source.text && <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3 italic">"{source.text}"</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
