import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare, Trash2, MessageSquarePlus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";
import { useTags } from "@/lib/api/queries";

const HIGHLIGHT_COLORS: { value: HighlightsColorOptions; bg: string; border: string; ring: string }[] = [
  {
    value: HighlightsColorOptions.yellow,
    bg: "bg-yellow-300/70",
    border: "border-yellow-400",
    ring: "ring-yellow-400",
  },
  { value: HighlightsColorOptions.green, bg: "bg-green-300/70", border: "border-green-400", ring: "ring-green-400" },
  { value: HighlightsColorOptions.blue, bg: "bg-blue-300/70", border: "border-blue-400", ring: "ring-blue-400" },
  { value: HighlightsColorOptions.pink, bg: "bg-pink-300/70", border: "border-pink-400", ring: "ring-pink-400" },
  {
    value: HighlightsColorOptions.purple,
    bg: "bg-purple-300/70",
    border: "border-purple-400",
    ring: "ring-purple-400",
  },
];

export function getHighlightColorClass(color: HighlightsColorOptions): string {
  const colorConfig = HIGHLIGHT_COLORS.find((c) => c.value === color);
  return colorConfig?.bg || "bg-yellow-300/70";
}

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
  onDismiss: () => void;
}

export function HighlightPopover({
  selectedText,
  position,
  selectionRange: _selectionRange,
  onHighlight,
  onOpenEditor,
  onDismiss,
}: HighlightPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-slot="popover-content"]')
      ) {
        onDismiss();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onDismiss]);

  const handleColorClick = (color: HighlightsColorOptions) => {
    onHighlight(color);
  };

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
              onClick={() => handleColorClick(color.value)}
              title={`Highlight ${color.value}`}
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
        </div>
      </div>
    </div>
  );
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
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-slot="popover-content"]')
      ) {
        onDismiss();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onDismiss]);

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
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onOpenEditor} title={note ? "Edit note & tags" : "Add note & tags"}>
              <MessageSquare className="h-3.5 w-3.5" />
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
              className="text-xs text-muted-foreground pt-1.5 border-t border-border cursor-pointer hover:text-foreground transition-colors max-w-[220px] truncate"
              onClick={onOpenEditor}
              title={note}
            >
              <MessageSquare className="h-3 w-3 inline-block mr-1 -mt-0.5" />
              {note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface HighlightMarkProps {
  highlightId: string;
  className: string;
  note?: string;
  tags?: string[];
  children: React.ReactNode;
  onClick?: () => void;
}

export function HighlightMark({ highlightId, className, note, tags: highlightTags = [], children, onClick }: HighlightMarkProps) {
  const { data: allTags = [] } = useTags();

  const tagTitles = highlightTags.map((tagId) => allTags.find((t) => t.id === tagId)?.title).filter(Boolean);

  if (note || tagTitles.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <mark className={cn("cursor-pointer rounded-sm px-0.5", className)} data-highlight-id={highlightId} onClick={onClick}>
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
    <mark className={cn("cursor-pointer rounded-sm px-0.5", className)} data-highlight-id={highlightId} onClick={onClick}>
      {children}
    </mark>
  );
}
