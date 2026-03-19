import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { HIGHLIGHT_COLORS } from "@/lib/constants/highlight-colors";
import { useDismissPopover } from "@/lib/hooks/use-dismiss-popover";

export { getHighlightColorClass } from "@/lib/constants/highlight-colors";
export { ExistingHighlightPopover } from "./existing-highlight-popover";
export { HighlightMark } from "./highlight-mark";

interface SelectionPosition {
  x: number;
  y: number;
}

interface HighlightPopoverProps {
  selectedText: string;
  position: SelectionPosition | null;
  selectionRange: Range | null;
  onHighlight: (color: HighlightsColorOptions, note?: string, tags?: string[]) => void;
  onOpenEditor: () => void;
  onChatWithText?: () => void;
  onDismiss: () => void;
}

export function HighlightPopover({
  selectedText,
  position,
  selectionRange: _selectionRange,
  onHighlight,
  onOpenEditor,
  onChatWithText,
  onDismiss,
}: HighlightPopoverProps) {
  const popoverRef = useDismissPopover<HTMLDivElement>(onDismiss);

  if (!position || !selectedText) return null;

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
        <div className="flex items-center gap-1">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              className={cn(
                "w-6 h-6 rounded-full transition-all hover:scale-110 ring-2 ring-offset-1 ring-offset-background",
                color.bg,
                "ring-transparent hover:ring-foreground/20",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={() => onHighlight(color.value)}
              title={`Highlight ${color.label}`}
            />
          ))}
          <div className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={onOpenEditor}
            title="Add note & tags"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </Button>
          {onChatWithText && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={onChatWithText}
              title="Chat with selected text"
            >
              <Bot className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
