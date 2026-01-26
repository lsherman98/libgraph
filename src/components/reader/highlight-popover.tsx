import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightsColorOptions } from "@/lib/pocketbase-types";

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
  onHighlight: (color: HighlightsColorOptions, note?: string) => void;
  onDismiss: () => void;
}

export function HighlightPopover({
  selectedText,
  position,
  selectionRange: _selectionRange,
  onHighlight,
  onDismiss,
}: HighlightPopoverProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState<HighlightsColorOptions>(HighlightsColorOptions.yellow);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset state when popover reopens
  useEffect(() => {
    if (position && selectedText) {
      setShowNoteInput(false);
      setNote("");
      setSelectedColor(HighlightsColorOptions.yellow);
    }
  }, [position, selectedText]);

  // We rely on the native browser selection to show what text is selected
  // Creating a temporary DOM element here conflicts with React's rendering
  // when optimistic updates occur (race condition between removing temp mark and adding real mark)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Use setTimeout to allow the click to process first
      setTimeout(() => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onDismiss();
        }
      }, 0);
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
    // Immediately highlight with the selected color
    onHighlight(color);
  };

  const handleSaveWithNote = () => {
    onHighlight(selectedColor, note);
  };

  if (!position || !selectedText) return null;

  // Calculate position accounting for scroll
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
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection when clicking popover
      onMouseUp={(e) => e.stopPropagation()} // Prevent parent mouseUp handler from clearing selection
    >
      <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-md p-1.5">
        {!showNoteInput ? (
          /* Color swatches - all in one line */
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
                  e.preventDefault(); // Prevent losing selection
                  e.stopPropagation();
                }}
                onClick={() => handleColorClick(color.value)}
                title={`Highlight ${color.value}`}
              />
            ))}

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Add Note button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={() => setShowNoteInput(true)}
              title="Add note"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 min-w-[280px] p-1">
            {/* Selected text preview */}
            <div className="text-xs text-muted-foreground line-clamp-2 italic px-1">
              "{selectedText.slice(0, 100)}
              {selectedText.length > 100 ? "..." : ""}"
            </div>

            {/* Color selection in note mode */}
            <div className="flex items-center gap-1.5">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  className={cn(
                    "w-5 h-5 rounded-full transition-all hover:scale-110 ring-2 ring-offset-1 ring-offset-background",
                    color.bg,
                    selectedColor === color.value ? color.ring : "ring-transparent",
                  )}
                  onClick={() => setSelectedColor(color.value)}
                />
              ))}
            </div>

            {/* Note input */}
            <Textarea
              placeholder="Add a note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] text-sm resize-none"
              autoFocus
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNoteInput(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveWithNote}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ExistingHighlightPopoverProps {
  highlightId: string;
  color: HighlightsColorOptions;
  note?: string;
  text: string;
  position: SelectionPosition;
  onUpdateColor: (color: HighlightsColorOptions) => void;
  onUpdateNote: (note: string) => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function ExistingHighlightPopover({
  color,
  note,
  text,
  position,
  onUpdateColor,
  onUpdateNote,
  onDelete,
  onDismiss,
}: ExistingHighlightPopoverProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(note || "");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset state when note changes
  useEffect(() => {
    setNoteValue(note || "");
  }, [note]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      setTimeout(() => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onDismiss();
        }
      }, 0);
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

  const handleSaveNote = () => {
    onUpdateNote(noteValue);
    setEditingNote(false);
  };

  // Calculate position to appear above the highlight
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
        {!editingNote ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              {/* Color swatches */}
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

              {/* Divider */}
              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Add Note button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditingNote(true)}
                title={note ? "Edit Note" : "Add Note"}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>

              {/* Delete button */}
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

            {/* Show note preview if exists and not editing */}
            {note && (
              <div
                className="text-xs text-muted-foreground pt-1.5 border-t border-border cursor-pointer hover:text-foreground transition-colors max-w-[220px] truncate"
                onClick={() => setEditingNote(true)}
                title={note}
              >
                <MessageSquare className="h-3 w-3 inline-block mr-1 -mt-0.5" />
                {note}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 min-w-[280px] p-1">
            {/* Text preview */}
            <div className="text-xs text-muted-foreground line-clamp-2 italic">
              "{text.slice(0, 80)}
              {text.length > 80 ? "..." : ""}"
            </div>

            {/* Note input */}
            <Textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[60px] text-sm resize-none"
              autoFocus
            />

            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingNote(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveNote}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Component to render highlighted text with optional hover tooltip for notes
 */
interface HighlightMarkProps {
  highlightId: string;
  className: string;
  note?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function HighlightMark({ highlightId, className, note, children, onClick }: HighlightMarkProps) {
  if (note) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <mark
              className={cn("cursor-pointer rounded-sm px-0.5", className)}
              data-highlight-id={highlightId}
              onClick={onClick}
            >
              {children}
            </mark>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-[280px] text-xs bg-popover text-popover-foreground border border-border"
          >
            <div className="flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="break-words">{note}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <mark
      className={cn("cursor-pointer rounded-sm px-0.5", className)}
      data-highlight-id={highlightId}
      onClick={onClick}
    >
      {children}
    </mark>
  );
}
