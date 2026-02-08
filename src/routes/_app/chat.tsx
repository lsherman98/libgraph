import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePeople, usePublications, useTags, useTopics, useUploads, useMessages } from "@/lib/api/queries";
import { useCreateChat, useCreateMessage } from "@/lib/api/mutations";
import { sendChatMessage, type ChatMessage, type ChatFilters, type ChatSource } from "@/lib/api/api";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2,
  User,
  Bot,
  X,
  FileText,
  Sparkles,
  ArrowUp,
  Library,
  SlidersHorizontal,
  RotateCcw,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadsTypeOptions, type MessagesResponse } from "@/lib/pocketbase-types";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

interface LocalMessage extends ChatMessage {
  id: string;
  sources?: ChatSource[];
  isLoading?: boolean;
}

function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<ChatFilters>({});
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: people } = usePeople();
  const { data: publications } = usePublications();
  const { data: tags } = useTags();
  const { data: topics } = useTopics();
  const { data: uploads } = useUploads();

  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);
  const createChatMutation = useCreateChat();
  const createMessageMutation = useCreateMessage();

  // Convert DB messages to local format when they load
  useEffect(() => {
    if (dbMessages && activeChatId) {
      const converted: LocalMessage[] = dbMessages.map((m: MessagesResponse<ChatSource[]>) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content || "",
        sources: m.sources || undefined,
      }));
      setLocalMessages(converted);
    }
  }, [dbMessages, activeChatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = localMessages
        .filter((m) => !m.isLoading)
        .map((m) => ({ role: m.role, content: m.content }));
      return sendChatMessage(message, filters, history);
    },
    onMutate: (message) => {
      const userMessage: LocalMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      const loadingMessage: LocalMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isLoading: true,
      };
      setLocalMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
    },
    onSuccess: async (data, message) => {
      // Determine or create the chat record
      let chatId = activeChatId;
      if (!chatId) {
        // Create a new chat with the first message as the title
        const title = message.length > 80 ? message.slice(0, 80) + "…" : message;
        const chat = await createChatMutation.mutateAsync({ title });
        chatId = chat.id;
        setActiveChatId(chatId);
      }

      // Save user message to DB
      await createMessageMutation.mutateAsync({
        chat: chatId,
        role: "user",
        content: message,
      });

      // Save assistant message to DB
      await createMessageMutation.mutateAsync({
        chat: chatId,
        role: "assistant",
        content: data.message,
        sources: data.sources || null,
      });

      // Invalidate messages so React Query refetches
      queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });

      // Update local state to remove loading message and show response
      setLocalMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: data.message,
            sources: data.sources,
          },
        ];
      });
    },
    onError: (error) => {
      setLocalMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !chatMutation.isPending) {
        chatMutation.mutate(input.trim());
      }
    }
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

  const handleNewChat = () => {
    setActiveChatId(null);
    setLocalMessages([]);
    setInput("");
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setLocalMessages([]);
    setInput("");
  };

  return (
    <div className="flex h-full w-full">
      {/* Chat History Sidebar */}
      {isSidebarOpen && (
        <ChatHistorySidebar
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
        />
      )}

      {/* Filter Panel */}
      {isFiltersPanelOpen && (
        <div className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFiltersPanelOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-5">
              {/* Subject Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
                <Select
                  value={filters.subjects?.[0] || "all"}
                  onValueChange={(value) => handleFilterChange("subjects", value)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {people?.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Publication Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Publication
                </label>
                <Select
                  value={filters.publications?.[0] || "all"}
                  onValueChange={(value) => handleFilterChange("publications", value)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All publications" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All publications</SelectItem>
                    {publications?.map((pub) => (
                      <SelectItem key={pub.id} value={pub.id}>
                        {pub.name || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Topic Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Topic</label>
                <Select
                  value={filters.topics?.[0] || "all"}
                  onValueChange={(value) => handleFilterChange("topics", value)}
                >
                  <SelectTrigger className="h-9 text-sm">
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tag</label>
                <Select value={filters.tags?.[0] || "all"} onValueChange={(value) => handleFilterChange("tags", value)}>
                  <SelectTrigger className="h-9 text-sm">
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <Select
                  value={filters.types?.[0] || "all"}
                  onValueChange={(value) => handleFilterChange("types", value)}
                >
                  <SelectTrigger className="h-9 text-sm">
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

              {/* Document Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Document</label>
                <Select
                  value={filters.uploads?.[0] || "all"}
                  onValueChange={(value) => handleFilterChange("uploads", value)}
                >
                  <SelectTrigger className="h-9 text-sm">
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
          </ScrollArea>
          {hasActiveFilters && (
            <>
              <Separator />
              <div className="p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full gap-2 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear all filters
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header Bar */}
        <div className="h-12 shrink-0 border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  >
                    {isSidebarOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeft className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isSidebarOpen ? "Hide chat history" : "Show chat history"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isFiltersPanelOpen && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 relative"
                      onClick={() => setIsFiltersPanelOpen(true)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Show filters</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Chat with your Library</span>
            </div>
          </div>
          {localMessages.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleNewChat} className="gap-1.5 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />
                    New chat
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Start a new conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingMessages && activeChatId ? (
            <div className="max-w-3xl mx-auto py-6 px-4">
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-3 pt-1">
                      <Skeleton className="h-4 w-3/4 rounded-lg" />
                      <Skeleton className="h-4 w-1/2 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : localMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="max-w-lg w-full text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/10">
                  <Sparkles className="h-8 w-8 text-primary/70" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Chat with your Library</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                    Ask questions about your documents and get answers with sources. Use filters to narrow your search.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
                  {[
                    "What are the key themes across my documents?",
                    "Summarize the main arguments",
                    "What do my sources say about this topic?",
                    "Find connections between concepts",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                      className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4">
              <div className="space-y-6">
                {localMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-border bg-background">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative flex items-end rounded-2xl border border-border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-shadow">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your documents..."
                  disabled={chatMutation.isPending}
                  rows={1}
                  className="min-h-11 max-h-50 resize-none border-0 bg-transparent px-4 py-3 pr-12 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
                <div className="absolute right-2 bottom-2">
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || chatMutation.isPending}
                    className="h-8 w-8 rounded-lg"
                  >
                    {chatMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
            <p className="text-[11px] text-muted-foreground/60 text-center mt-2">
              Answers are generated from your library. Always verify with original sources.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";

  if (message.isLoading) {
    return (
      <div className="flex gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/80 text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-3 pt-1">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <Skeleton className="h-4 w-2/3 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-linear-to-br from-primary to-primary/80 text-primary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0 space-y-3 pt-1">
        <div className="text-sm font-medium text-muted-foreground">{isUser ? "You" : "Assistant"}</div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.sources.map((source, idx) => (
              <Link
                key={idx}
                to="/workspace"
                search={{ id: source.upload_id, type: "upload" }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
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
