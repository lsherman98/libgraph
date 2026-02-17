import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StickyNote, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions, type HighlightsRecord } from "@/lib/pocketbase-types";
import { HIGHLIGHT_BAR_CLASSES } from "@/lib/constants/highlight-colors";
import { useTagLabels } from "@/lib/hooks/use-tags-helpers";
import { AddToProjectButton } from "./add-to-project-button";

interface AnnotationHighlightItemProps {
  highlight: HighlightsRecord;
  pageNumber?: number;
  onClick: () => void;
  onEdit: () => void;
}

export function AnnotationHighlightItem({ highlight, onClick, onEdit }: AnnotationHighlightItemProps) {
  const color = highlight.color || HighlightsColorOptions.yellow;
  const tagTitles = useTagLabels(highlight.tags || []);

  return (
    <div className="group/item w-full text-left p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-2">
        <div className={cn("w-1 h-full min-h-8 rounded-full shrink-0", HIGHLIGHT_BAR_CLASSES[color])} />
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <p className="text-sm line-clamp-2 text-foreground/90">"{highlight.text}"</p>
          {(highlight.comment || tagTitles.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
              {highlight.comment && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <StickyNote className="h-3 w-3 shrink-0" />
                  <span className="truncate">{highlight.comment}</span>
                </span>
              )}
              {tagTitles.map((title, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                  {title}
                </Badge>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
            <AddToProjectButton itemId={highlight.id} itemType="highlight" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit highlight"
          >
            <SquarePen className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
