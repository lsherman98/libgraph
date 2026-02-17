import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { HighlightsResponse } from "@/lib/pocketbase-types";
import { cn } from "@/lib/utils";

const colorClasses: Record<string, string> = {
  yellow: "border-l-yellow-400",
  green: "border-l-green-400",
  blue: "border-l-blue-400",
  pink: "border-l-pink-400",
  purple: "border-l-purple-400",
};

interface HighlightItemProps {
  highlight: HighlightsResponse;
  onUnlink: () => void;
  onPreview: () => void;
}

export function HighlightItem({ highlight, onUnlink, onPreview }: HighlightItemProps) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card border-l-4 p-2 cursor-pointer hover:bg-muted/50 transition-colors",
        colorClasses[highlight.color || "yellow"],
      )}
      onClick={onPreview}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed line-clamp-3">{highlight.text}</p>
          {highlight.comment && <p className="text-xs text-muted-foreground mt-1 pt-1 border-t italic line-clamp-2">{highlight.comment}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onUnlink();
          }}
          title="Remove from project"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
