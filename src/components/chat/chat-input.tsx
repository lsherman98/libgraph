import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowUp } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string) => void;
  isPending: boolean;
  mode: "chat" | "search";
}

export function ChatInput({ value, onChange, onSubmit, isPending, mode }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isPending) return;
    onSubmit(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isPending) {
        onSubmit(value.trim());
      }
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="max-w-3xl mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-end rounded-2xl border border-border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "chat" ? "Ask a question about your documents..." : "Search for information..."}
              disabled={isPending}
              rows={1}
              className="min-h-11 max-h-50 resize-none border-0 bg-transparent px-4 py-3 pr-12 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            />
            <div className="absolute right-2 bottom-2">
              <Button type="submit" size="icon" disabled={!value.trim() || isPending} className="h-8 w-8 rounded-lg">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground/60 text-center mt-2">
          Answers are generated from your library. Always verify with original sources.
        </p>
      </div>
    </div>
  );
}
