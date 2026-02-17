import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useMessages } from "@/lib/api/queries";
import { useSendChatMessage } from "@/lib/api/mutations";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { ChatFiltersPanel } from "@/components/chat/chat-filters-panel";
import { ChatSettingsPanel } from "@/components/chat/chat-settings-panel";
import { ChatToolbar } from "@/components/chat/chat-toolbar";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageBubble, type LocalMessage } from "@/components/chat/message-bubble";
import { SourcePreviewDialog } from "@/components/chat/source-preview-dialog";
import type { MessagesResponse } from "@/lib/pocketbase-types";
import type { ChatFilters, ChatSource, LLMParameters, RetrievalParameters } from "@/lib/types";

export const Route = createFileRoute("/_app/chat/")({
  component: ChatPage,
});

const DEFAULT_LLM_PARAMS: LLMParameters = {
  model_name: "GPT_4O_MINI",
  temperature: 0.1,
  use_citation: true,
  use_chain_of_thought_reasoning: false,
  system_prompt: "",
};

const DEFAULT_RETRIEVAL_PARAMS: RetrievalParameters = {
  dense_similarity_top_k: 10,
  enable_reranking: true,
  rerank_top_n: 5,
  retrieval_mode: "chunks",
  retrieve_page_figure_nodes: false,
  retrieve_page_screenshot_nodes: false,
};

function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string>();
  const [pendingMessages, setPendingMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "search">("chat");

  const [filters, setFilters] = useState<ChatFilters>({});
  const [llmParams, setLlmParams] = useState<LLMParameters>(DEFAULT_LLM_PARAMS);
  const [retrievalParams, setRetrievalParams] = useState<RetrievalParameters>(DEFAULT_RETRIEVAL_PARAMS);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewSource, setPreviewSource] = useState<ChatSource | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);

  const displayMessages: LocalMessage[] = useMemo(() => {
    if (activeChatId && dbMessages) {
      return (dbMessages as MessagesResponse<ChatSource[]>[]).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content || "",
        sources: m.sources || undefined,
        isLoading: (m as any).isLoading,
      }));
    }
    return pendingMessages;
  }, [activeChatId, dbMessages, pendingMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    if (activeChatId) setPendingMessages([]);
  }, [activeChatId]);

  const chatMutation = useSendChatMessage({
    mode,
    filters,
    llmParams,
    retrievalParams,
    activeChatId,
    setActiveChatId,
    setInput,
  });

  const handleSendMessage = (message: string) => {
    if (!activeChatId) {
      const now = Date.now();
      setPendingMessages((prev) => [
        ...prev,
        { id: `pending-user-${now}`, role: "user", content: message },
        { id: `pending-loading-${now}`, role: "assistant", content: "", isLoading: true },
      ]);
    }
    chatMutation.mutate(message);
  };

  const handleNewChat = () => {
    setActiveChatId(undefined);
    setPendingMessages([]);
    setInput("");
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setPendingMessages([]);
    setInput("");
  };

  const handleModeChange = (newMode: "chat" | "search") => {
    setMode(newMode);
    setActiveChatId(undefined);
    setPendingMessages([]);
  };

  const handleSourceClick = (source: ChatSource) => {
    setPreviewSource(source);
    setIsPreviewOpen(true);
  };

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).reduce((count, [key, val]) => {
        if (key === "condition") return count;
        return count + (Array.isArray(val) ? val.length : 0);
      }, 0),
    [filters],
  );

  return (
    <div className="flex h-full w-full">
      {isSidebarOpen && <ChatHistorySidebar activeChatId={activeChatId} onSelectChat={handleSelectChat} onNewChat={handleNewChat} mode={mode} />}
      {isFiltersPanelOpen && <ChatFiltersPanel filters={filters} onFiltersChange={setFilters} onClose={() => setIsFiltersPanelOpen(false)} />}
      {isSettingsPanelOpen && (
        <ChatSettingsPanel
          mode={mode}
          llmParams={llmParams}
          onLlmParamsChange={setLlmParams}
          retrievalParams={retrievalParams}
          onRetrievalParamsChange={setRetrievalParams}
          onClose={() => setIsSettingsPanelOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatToolbar
          mode={mode}
          onModeChange={handleModeChange}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isFiltersPanelOpen={isFiltersPanelOpen}
          onOpenFilters={() => setIsFiltersPanelOpen(true)}
          isSettingsPanelOpen={isSettingsPanelOpen}
          onOpenSettings={() => setIsSettingsPanelOpen(true)}
          activeFilterCount={activeFilterCount}
          hasMessages={displayMessages.length > 0}
          onNewChat={handleNewChat}
        />
        <div className="flex-1 overflow-y-auto">
          {isLoadingMessages && activeChatId ? (
            <MessageListSkeleton />
          ) : displayMessages.length === 0 ? (
            <ChatEmptyState mode={mode} onSuggestionClick={setInput} />
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4">
              <div className="space-y-6">
                {displayMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} onSourceClick={handleSourceClick} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>
        <ChatInput value={input} onChange={setInput} onSubmit={handleSendMessage} isPending={chatMutation.isPending} mode={mode} />
      </div>
      <SourcePreviewDialog source={previewSource} open={isPreviewOpen} onOpenChange={setIsPreviewOpen} />
    </div>
  );
}

function MessageListSkeleton() {
  return (
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
  );
}
