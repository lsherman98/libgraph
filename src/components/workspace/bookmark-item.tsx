import { Button } from "@/components/ui/button";
import { Bookmark, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookmarkItemProps {
  bookmark: any;
  onUnlink: () => void;
  onPreview: () => void;
}

export function BookmarkItem({ bookmark, onUnlink, onPreview }: BookmarkItemProps) {
  return (
    <div className="rounded-md border bg-card p-2 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onPreview}>
      <div className="flex items-start gap-2">
        <Bookmark className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          {bookmark.comment && <p className="text-sm font-medium line-clamp-1">{bookmark.comment}</p>}
          <p className={cn("text-sm line-clamp-2", bookmark.comment && "text-muted-foreground")}>{bookmark.preview_text || "No preview"}</p>
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
