import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTagLabels } from "@/lib/hooks/use-tags-helpers";

interface HighlightMarkProps {
  highlightId: string;
  className: string;
  note?: string;
  tags?: string[];
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

export function HighlightMark({ highlightId, className, note, tags: highlightTags = [], children, onClick }: HighlightMarkProps) {
  const tagTitles = useTagLabels(highlightTags);

  const hasTooltipContent = !!note || tagTitles.length > 0;

  if (hasTooltipContent) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <mark className={cn("cursor-pointer rounded-sm", className)} data-highlight-id={highlightId} onClick={onClick}>
              {children}
            </mark>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-70 text-xs bg-popover text-popover-foreground border border-border p-2">
            <div className="flex flex-col gap-2">
              {note && (
                <div className="flex items-start gap-1.5">
                  <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="wrap-break-word">{note}</span>
                </div>
              )}
              {tagTitles.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <Tag className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {tagTitles.map((title, i) => (
                      <span key={i} className="bg-muted px-1 rounded-[2px]">
                        {title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <mark className={cn("cursor-pointer rounded-sm", className)} data-highlight-id={highlightId} onClick={onClick}>
      {children}
    </mark>
  );
}
