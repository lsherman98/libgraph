import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthors, useTags, useTopics, useUploads } from "@/lib/api/queries";
import { sendChatMessage, type ChatMessage, type ChatFilters, type ChatSource } from "@/lib/api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageSquare, Send, Loader2, User, Bot, Filter, X, ChevronDown, FileText, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadsTypeOptions } from "@/lib/pocketbase-types";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

interface Message extends ChatMessage {
  id: string;
  sources?: ChatSource[];
  isLoading?: boolean;
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<ChatFilters>({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: authors } = useAuthors();
  const { data: tags } = useTags();
  const { data: topics } = useTopics();
  const { data: uploads } = useUploads();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.filter((m) => !m.isLoading).map((m) => ({ role: m.role, content: m.content }));
      return sendChatMessage(message, filters, history);
    },
    onMutate: (message) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      const loadingMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isLoading: true,
      };
      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
    },
    onSuccess: (data) => {
      setMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.message,
            sources: data.sources,
          },
        ];
      });
    },
    onError: (error) => {
      setMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Sorry, an error occurred: ${error.message}`,
          },
        ];
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input.trim());
  };

  const handleFilterChange = (key: keyof ChatFilters, value: string) => {
    if (value === "all") {
      setFilters((prev) => {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        [key]: [value],
      }));
    }
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some((arr) => arr && arr.length > 0);

  const activeFilterCount = Object.values(filters).reduce((count, arr) => count + (arr?.length || 0), 0);

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Chat with your Library</h1>
        </div>
      </div>

      {/* Filters */}
      <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <div className="flex items-center gap-2 mb-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className={cn("h-4 w-4 transition-transform", isFiltersOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
              <X className="h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
        <CollapsibleContent className="mb-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* Author Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Author</label>
                  <Select
                    value={filters.authors?.[0] || "all"}
                    onValueChange={(value) => handleFilterChange("authors", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All authors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All authors</SelectItem>
                      {authors?.map((author) => (
                        <SelectItem key={author.id} value={author.id}>
                          {author.name || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Topic Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Topic</label>
                  <Select
                    value={filters.topics?.[0] || "all"}
                    onValueChange={(value) => handleFilterChange("topics", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All topics" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All topics</SelectItem>
                      {topics?.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {topic.title || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tag Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tag</label>
                  <Select
                    value={filters.tags?.[0] || "all"}
                    onValueChange={(value) => handleFilterChange("tags", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tags</SelectItem>
                      {tags?.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.title || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={filters.types?.[0] || "all"}
                    onValueChange={(value) => handleFilterChange("types", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {Object.values(UploadsTypeOptions).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Upload Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Document</label>
                  <Select
                    value={filters.uploads?.[0] || "all"}
                    onValueChange={(value) => handleFilterChange("uploads", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All documents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All documents</SelectItem>
                      {uploads?.map((upload) => (
                        <SelectItem key={upload.id} value={upload.id}>
                          {upload.title || "Untitled"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Messages Area */}
      <Card className="flex-1 min-h-0 mb-4">
        <ScrollArea className="h-full">
          <CardContent className="p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle className="mb-2">Start a conversation</CardTitle>
                <CardDescription className="max-w-sm">
                  Ask questions about your documents. Use the filters above to narrow down which documents to search.
                </CardDescription>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </CardContent>
        </ScrollArea>
      </Card>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your documents..."
          disabled={chatMutation.isPending}
          className="flex-1"
        />
        <Button type="submit" disabled={!input.trim() || chatMutation.isPending}>
          {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (message.isLoading) {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("flex flex-col gap-2 max-w-[80%]", isUser && "items-end")}>
        <div className={cn("rounded-lg px-4 py-2", isUser ? "bg-secondary" : "bg-muted")}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.sources.map((source, idx) => (
              <Link
                key={idx}
                to="/workspace"
                search={{ id: source.upload_id, type: "upload" }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-3 w-3" />
                {source.title || "Document"}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
