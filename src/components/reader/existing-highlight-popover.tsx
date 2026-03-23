import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { HIGHLIGHT_COLORS } from "@/lib/constants/highlight-colors";
import { useDismissPopover } from "@/lib/hooks/use-dismiss-popover";

interface SelectionPosition {
  x: number;
  y: number;
}

interface ExistingHighlightPopoverProps {
  highlightId: string;
  color: HighlightsColorOptions;
  note?: string;
  tags?: string[];
  text: string;
  position: SelectionPosition;
  onUpdateColor: (color: HighlightsColorOptions) => void;
  onOpenEditor: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function ExistingHighlightPopover({ color, note, position, onUpdateColor, onOpenEditor, onDelete, onDismiss }: ExistingHighlightPopoverProps) {
  const popoverRef = useDismissPopover<HTMLDivElement>(onDismiss);

  const popoverStyle = {
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: "translate(-50%, -100%)",
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-100"
      style={popoverStyle}
      onMouseDown={(e) => e.preventDefault()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-md p-1.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                className={cn(
                  "w-5 h-5 rounded-full transition-all hover:scale-110 ring-2 ring-offset-1 ring-offset-background",
                  c.bg,
                  color === c.value ? c.ring : "ring-transparent",
                )}
                onClick={() => onUpdateColor(c.value)}
              />
            ))}
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onOpenEditor} title={note ? "Edit highlight" : "Edit highlight"}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              title="Delete highlight"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {note && (
            <div
              className="text-xs text-muted-foreground pt-1.5 border-t border-border cursor-pointer hover:text-foreground transition-colors max-w-55 truncate"
              onClick={onOpenEditor}
              title={note}
            >
              <Pencil className="h-3 w-3 inline-block mr-1 -mt-0.5" />
              {note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
