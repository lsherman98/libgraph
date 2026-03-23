import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { type NotesRecord } from "@/lib/pocketbase-types";
import { useTagLabels } from "@/lib/hooks/use-tags-helpers";
import { AddToProjectButton } from "./add-to-project-button";

interface AnnotationNoteItemProps {
  note: NotesRecord;
  onClick: () => void;
  onDelete: () => void;
}

export function AnnotationNoteItem({ note, onClick, onDelete }: AnnotationNoteItemProps) {
  const tagTitles = useTagLabels(note.tags || []);

  return (
    <div className="group/item w-full text-left p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-2">
        <Pencil className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-sm text-foreground">{note.content}</span>
            {tagTitles.map((title, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30">
                {title}
              </Badge>
            ))}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <AddToProjectButton itemId={note.id} itemType="note" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete note"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
