import { Button } from "@/components/ui/button";
import { StickyNote, X } from "lucide-react";
import type { NotesResponse } from "@/lib/pocketbase-types";

interface NoteItemProps {
  note: NotesResponse;
  onUnlink: () => void;
  onPreview: () => void;
}

export function NoteItem({ note, onUnlink, onPreview }: NoteItemProps) {
  return (
    <div className="rounded-md border bg-card p-2 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onPreview}>
      <div className="flex items-start gap-2">
        <StickyNote className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm line-clamp-3">{note.content || "Empty note"}</p>
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
