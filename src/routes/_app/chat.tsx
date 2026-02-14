import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  usePeople,
  usePublications,
  useTags,
  useTopics,
  useUploads,
  useMessages,
  useCollections,
} from "@/lib/api/queries";
import { useCreateChat, useCreateMessage } from "@/lib/api/mutations";
import {
  sendChatMessage,
  type ChatMessage,
  type ChatFilters,
  type ChatSource,
  type LLMParameters,
  type RetrievalParameters,
} from "@/lib/api/api";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  Search,
  MessageSquare,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadsTypeOptions, MessagesRoleOptions, type MessagesResponse } from "@/lib/pocketbase-types";
import { SourcePreviewDialog } from "@/components/chat/source-preview-dialog";

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
  const [mode, setMode] = useState<"chat" | "search">("chat");
  const [filters, setFilters] = useState<ChatFilters>({});
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [llmParams, setLlmParams] = useState<LLMParameters>({
    model_name: "GPT_4O_MINI",
    temperature: 0.1,
    use_citation: true,
    use_chain_of_thought_reasoning: false,
    system_prompt: "",
  });
  const [retrievalParams, setRetrievalParams] = useState<RetrievalParameters>({
    dense_similarity_top_k: 10,
    enable_reranking: true,
    rerank_top_n: 5,
    retrieval_mode: "chunks",
    retrieve_page_figure_nodes: false,
    retrieve_page_screenshot_nodes: false,
  });
  const [previewSource, setPreviewSource] = useState<ChatSource | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: people } = usePeople();
  const { data: publications } = usePublications();
  const { data: tags } = useTags();
  const { data: topics } = useTopics();
  const { data: uploads } = useUploads();
  const { data: collections } = useCollections();

  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);
  const createChatMutation = useCreateChat();
  const createMessageMutation = useCreateMessage();

  // Convert DB messages to local format when they load
  useEffect(() => {
    if (dbMessages && activeChatId) {
      const converted: LocalMessage[] = (dbMessages as MessagesResponse<ChatSource[]>[]).map((m) => ({
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
      const history = localMessages.filter((m) => !m.isLoading).map((m) => ({ role: m.role, content: m.content }));
      return sendChatMessage(message, mode, filters, history, mode === "chat" ? llmParams : undefined, retrievalParams);
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
        let title = message.length > 80 ? message.slice(0, 80) + "…" : message;
        if (mode === "search") {
          title = `Search: ${title}`;
        }
        const chat = await createChatMutation.mutateAsync({ title });
        chatId = chat.id;
        setActiveChatId(chatId);
      }

      // Save user message to DB
      await createMessageMutation.mutateAsync({
        chat: chatId,
        role: MessagesRoleOptions.user,
        content: message,
      });

      // Save assistant message to DB
      await createMessageMutation.mutateAsync({
        chat: chatId,
        role: MessagesRoleOptions.assistant,
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
    if (key === "condition") return; // condition is handled separately
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

  const hasActiveFilters = Object.values(filters).some((val) => {
    if (typeof val === "string") return false; // skip condition
    return Array.isArray(val) && val.length > 0;
  });
  const activeFilterCount = Object.entries(filters).reduce((count, [key, val]) => {
    if (key === "condition") return count;
    return count + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const handleSourceClick = (source: ChatSource) => {
    setPreviewSource(source);
    setIsPreviewOpen(true);
  };

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
        <ChatHistorySidebar activeChatId={activeChatId} onSelectChat={handleSelectChat} onNewChat={handleNewChat} />
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
              {/* Filter Condition Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Match Mode</label>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      (filters.condition || "or") === "or"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setFilters((prev) => ({ ...prev, condition: "or" }))}
                  >
                    Match Any (OR)
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      filters.condition === "and"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setFilters((prev) => ({ ...prev, condition: "and" }))}
                  >
                    Match All (AND)
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {(filters.condition || "or") === "or"
                    ? "Results match any selected filter."
                    : "Results must match all selected filters."}
                </p>
              </div>

              {/* Collection Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Collection</label>
                <Select
                  value={filters.collections?.[0] || "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setFilters((prev) => {
                        const newFilters = { ...prev };
                        delete newFilters.collections;
                        return newFilters;
                      });
                    } else {
                      setFilters((prev) => ({
                        ...prev,
                        collections: [value],
                      }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All collections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All collections</SelectItem>
                    {collections?.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        <div className="flex items-center gap-2">
                          <Library className="h-3.5 w-3.5 text-muted-foreground" />
                          {collection.name || "Untitled"}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {collections?.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No collections yet. Create one in Library → Collections.
                  </p>
                )}
              </div>

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

      {/* Settings Panel */}
      {isSettingsPanelOpen && (
        <div className="w-72 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Settings</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsSettingsPanelOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* LLM Parameters — only shown in chat mode */}
              {mode === "chat" && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    LLM Parameters
                  </h4>

                  {/* Model */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Model</Label>
                    <Select
                      value={llmParams.model_name || "GPT_4O_MINI"}
                      onValueChange={(v) => setLlmParams((p) => ({ ...p, model_name: v }))}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GPT_4O_MINI">GPT-4o Mini</SelectItem>
                        <SelectItem value="GPT_4O">GPT-4o</SelectItem>
                        <SelectItem value="GPT_4_TURBO">GPT-4 Turbo</SelectItem>
                        <SelectItem value="GPT_3_5_TURBO">GPT-3.5 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Temperature</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {llmParams.temperature?.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={[llmParams.temperature ?? 0.1]}
                      onValueChange={([v]) => setLlmParams((p) => ({ ...p, temperature: v }))}
                      min={0}
                      max={1}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">System Prompt</Label>
                    <Textarea
                      value={llmParams.system_prompt || ""}
                      onChange={(e) => setLlmParams((p) => ({ ...p, system_prompt: e.target.value }))}
                      placeholder="Optional system prompt..."
                      rows={3}
                      className="text-xs resize-none"
                    />
                  </div>

                  {/* Use Citation */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Use Citations</Label>
                    <Switch
                      checked={llmParams.use_citation ?? true}
                      onCheckedChange={(v) => setLlmParams((p) => ({ ...p, use_citation: v }))}
                    />
                  </div>

                  {/* Chain of Thought */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Chain of Thought</Label>
                    <Switch
                      checked={llmParams.use_chain_of_thought_reasoning ?? false}
                      onCheckedChange={(v) => setLlmParams((p) => ({ ...p, use_chain_of_thought_reasoning: v }))}
                    />
                  </div>
                </div>
              )}

              {mode === "chat" && <Separator />}

              {/* Retrieval Parameters */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Retrieval Parameters
                </h4>

                {/* Retrieval Mode */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Retrieval Mode</Label>
                  <Select
                    value={retrievalParams.retrieval_mode || "chunks"}
                    onValueChange={(v) =>
                      setRetrievalParams((p) => ({ ...p, retrieval_mode: v as "chunks" | "files" }))
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chunks">Chunks</SelectItem>
                      <SelectItem value="files">Files</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dense Similarity Top K */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Dense Similarity Top K</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {retrievalParams.dense_similarity_top_k ?? 10}
                    </span>
                  </div>
                  <Slider
                    value={[retrievalParams.dense_similarity_top_k ?? 10]}
                    onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, dense_similarity_top_k: v }))}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Dense Similarity Cutoff */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Dense Similarity Cutoff</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {(retrievalParams.dense_similarity_cutoff ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[retrievalParams.dense_similarity_cutoff ?? 0]}
                    onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, dense_similarity_cutoff: v }))}
                    min={0}
                    max={1}
                    step={0.05}
                    className="w-full"
                  />
                </div>

                {/* Sparse Similarity Top K */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Sparse Similarity Top K</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {retrievalParams.sparse_similarity_top_k ?? 0}
                    </span>
                  </div>
                  <Slider
                    value={[retrievalParams.sparse_similarity_top_k ?? 0]}
                    onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, sparse_similarity_top_k: v }))}
                    min={0}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Alpha (hybrid search balance) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Alpha (hybrid balance)</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {(retrievalParams.alpha ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[retrievalParams.alpha ?? 0]}
                    onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, alpha: v }))}
                    min={0}
                    max={1}
                    step={0.05}
                    className="w-full"
                  />
                </div>

                {/* Files Top K */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Files Top K</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {retrievalParams.files_top_k ?? 0}
                    </span>
                  </div>
                  <Slider
                    value={[retrievalParams.files_top_k ?? 0]}
                    onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, files_top_k: v }))}
                    min={0}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Enable Reranking */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Enable Reranking</Label>
                  <Switch
                    checked={retrievalParams.enable_reranking ?? true}
                    onCheckedChange={(v) => setRetrievalParams((p) => ({ ...p, enable_reranking: v }))}
                  />
                </div>

                {/* Rerank Top N */}
                {retrievalParams.enable_reranking && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Rerank Top N</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {retrievalParams.rerank_top_n ?? 5}
                      </span>
                    </div>
                    <Slider
                      value={[retrievalParams.rerank_top_n ?? 5]}
                      onValueChange={([v]) => setRetrievalParams((p) => ({ ...p, rerank_top_n: v }))}
                      min={1}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Retrieve Page Figure Nodes */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Page Figure Nodes</Label>
                  <Switch
                    checked={retrievalParams.retrieve_page_figure_nodes ?? false}
                    onCheckedChange={(v) => setRetrievalParams((p) => ({ ...p, retrieve_page_figure_nodes: v }))}
                  />
                </div>

                {/* Retrieve Page Screenshot Nodes */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Page Screenshot Nodes</Label>
                  <Switch
                    checked={retrievalParams.retrieve_page_screenshot_nodes ?? false}
                    onCheckedChange={(v) => setRetrievalParams((p) => ({ ...p, retrieve_page_screenshot_nodes: v }))}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
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
                    {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
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
            {!isSettingsPanelOpen && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setIsSettingsPanelOpen(true)}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Pipeline settings</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Library</span>
              <Separator orientation="vertical" className="h-4 mx-1" />
              <Tabs value={mode} onValueChange={(v) => setMode(v as "chat" | "search")} className="h-8">
                <TabsList className="h-8 bg-transparent p-0 gap-1">
                  <TabsTrigger
                    value="chat"
                    className="h-7 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
                  >
                    <MessageSquare className="h-3 w-3 mr-1.5" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger
                    value="search"
                    className="h-7 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
                  >
                    <Search className="h-3 w-3 mr-1.5" />
                    Search
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="max-w-lg w-full space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/10">
                  {mode === "chat" ? (
                    <Sparkles className="h-8 w-8 text-primary/70" />
                  ) : (
                    <Search className="h-8 w-8 text-primary/70" />
                  )}
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {mode === "chat" ? "Chat with your Library" : "Search your Documents"}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                    {mode === "chat"
                      ? "Ask questions about your documents and get answers with sources. Use filters to narrow your search."
                      : "Find specific passages and information across your entire library instantly."}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
                  {(mode === "chat"
                    ? [
                        "What are the key themes across my documents?",
                        "Summarize the main arguments",
                        "What do my sources say about this topic?",
                        "Find connections between concepts",
                      ]
                    : [
                        "Specific details about...",
                        "Find mentions of...",
                        "What does X say about Y?",
                        "Search for data on...",
                      ]
                  ).map((suggestion) => (
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
                  <MessageBubble key={message.id} message={message} onSourceClick={handleSourceClick} />
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
                  placeholder={mode === "chat" ? "Ask a question about your documents..." : "Search for information..."}
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

      {/* Source Preview Dialog */}
      <SourcePreviewDialog source={previewSource} open={isPreviewOpen} onOpenChange={setIsPreviewOpen} />
    </div>
  );
}

/** Build a map from node_id → numbered citation index (1-based), deduped in order of appearance in the text */
function buildCitationMap(content: string, sources: ChatSource[]): Map<string, number> {
  const map = new Map<string, number>();
  const regex = /\[citation:([a-f0-9-]+)\]/g;
  let match: RegExpExecArray | null;
  let idx = 1;
  while ((match = regex.exec(content)) !== null) {
    const nodeId = match[1];
    if (!map.has(nodeId)) {
      map.set(nodeId, idx++);
    }
  }
  // Also assign numbers to any sources not cited inline (appended at the end)
  for (const s of sources) {
    if (s.node_id && !map.has(s.node_id)) {
      map.set(s.node_id, idx++);
    }
  }
  return map;
}

/** Render message content with inline citation markers replaced by clickable superscript badges */
function CitationContent({
  content,
  sources,
  citationMap,
  onSourceClick,
}: {
  content: string;
  sources: ChatSource[];
  citationMap: Map<string, number>;
  onSourceClick?: (source: ChatSource) => void;
}) {
  const sourceByNodeId = useMemo(() => {
    const m = new Map<string, ChatSource>();
    for (const s of sources) {
      if (s.node_id) m.set(s.node_id, s);
    }
    return m;
  }, [sources]);

  const parts = useMemo(() => {
    const result: { type: "text" | "citation"; value: string }[] = [];
    const regex = /\[citation:([a-f0-9-]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      result.push({ type: "citation", value: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      result.push({ type: "text", value: content.slice(lastIndex) });
    }
    return result;
  }, [content]);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {part.value}
            </span>
          );
        }
        const num = citationMap.get(part.value);
        const source = sourceByNodeId.get(part.value);
        if (!num) return null;
        return (
          <Popover key={i}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-semibold rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors align-super cursor-pointer leading-none ml-0.5">
                {num}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-96 max-h-64 overflow-y-auto p-3">
              {source ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSourceClick?.(source)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer text-left"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      {source.title || "Document"}
                      {source.page_number ? (
                        <span className="text-muted-foreground ml-1">p.{source.page_number}</span>
                      ) : null}
                    </button>
                    {source.score ? (
                      <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {Math.round(source.score * 100)}%
                      </span>
                    ) : null}
                  </div>
                  {source.text && (
                    <p className="text-xs leading-relaxed text-muted-foreground italic">
                      "{source.text.length > 500 ? source.text.slice(0, 500) + "…" : source.text}"
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Source not found</p>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </span>
  );
}

function MessageBubble({
  message,
  onSourceClick,
}: {
  message: LocalMessage;
  onSourceClick?: (source: ChatSource) => void;
}) {
  const isUser = message.role === "user";

  const hasCitations = !isUser && message.content?.includes("[citation:");
  const citationMap = useMemo(
    () =>
      hasCitations && message.sources ? buildCitationMap(message.content, message.sources) : new Map<string, number>(),
    [hasCitations, message.content, message.sources],
  );

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

        {/* Message content — with or without inline citations */}
        <div className="text-sm leading-relaxed">
          {hasCitations && message.sources ? (
            <CitationContent
              content={message.content}
              sources={message.sources}
              citationMap={citationMap}
              onSourceClick={onSourceClick}
            />
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>

        {/* Source cards — numbered to match inline citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sources</p>
            <div className="grid grid-cols-1 gap-2">
              {message.sources.map((source, idx) => {
                const citNum = source.node_id ? citationMap.get(source.node_id) : undefined;
                return (
                  <button
                    key={idx}
                    onClick={() => onSourceClick?.(source)}
                    className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 text-left w-full cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {citNum != null && (
                          <span className="flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-semibold rounded bg-primary/15 text-primary shrink-0">
                            {citNum}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:underline truncate">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{source.title || "Document"}</span>
                          {source.page_number ? (
                            <span className="text-muted-foreground ml-1 shrink-0">p.{source.page_number}</span>
                          ) : null}
                        </span>
                      </div>
                      {source.score ? (
                        <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {Math.round(source.score * 100)}% Match
                        </span>
                      ) : null}
                    </div>
                    {source.text && (
                      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3 italic">
                        "{source.text}"
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
