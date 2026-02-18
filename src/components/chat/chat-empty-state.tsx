import { Sparkles, Search } from "lucide-react";

interface ChatEmptyStateProps {
  mode: "chat" | "search";
}

export function ChatEmptyState({ mode }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <div className="max-w-lg w-full space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/10">
          {mode === "chat" ? <Sparkles className="h-8 w-8 text-primary/70" /> : <Search className="h-8 w-8 text-primary/70" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{mode === "chat" ? "Chat with your Library" : "Search your Documents"}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
            {mode === "chat"
              ? "Ask questions about your documents and get answers with sources. Use filters to narrow your search."
              : "Find specific passages and information across your entire library instantly."}
          </p>
        </div>
      </div>
    </div>
  );
}
