import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useMessages } from "@/lib/api/queries";
import { useSendChatMessage, useDeleteChat } from "@/lib/api/mutations";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { ChatFiltersPanel } from "@/components/chat/chat-filters-panel";
import { ChatToolbar } from "@/components/chat/chat-toolbar";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageBubble, type LocalMessage } from "@/components/chat/message-bubble";
import { PreviewDialog } from "@/components/workspace/preview-dialog";
import type { MessagesResponse } from "@/lib/pocketbase-types";
import type { ChatFilters, ChatSource } from "@/lib/types";

const CHAT_POLL_TIMEOUT_MS = 90_000;
const CHAT_MODE_STORAGE_KEY = "libgraph.chat.mode";
const CHAT_ACTIVE_IDS_STORAGE_KEY = "libgraph.chat.activeByMode";

type ChatMode = "chat" | "search" | "fts";
type ActiveChatByMode = Partial<Record<ChatMode, string>>;

function readStoredMode(): ChatMode {
  if (typeof window === "undefined") return "chat";

  const raw = window.localStorage.getItem(CHAT_MODE_STORAGE_KEY);
  if (raw === "search" || raw === "fts") return raw;
  if (raw === "full_text") return "fts";
  return "chat";
}

function readStoredActiveChats(): ActiveChatByMode {
  if (typeof window === "undefined") return {};

  const raw = window.localStorage.getItem(CHAT_ACTIVE_IDS_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as ActiveChatByMode;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getStoredActiveChatId(mode: ChatMode): string | undefined {
  const stored = readStoredActiveChats();
  return stored[mode] || undefined;
}

function setStoredMode(mode: ChatMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
}

function setStoredActiveChatId(mode: ChatMode, chatId: string | undefined) {
  if (typeof window === "undefined") return;

  const stored = readStoredActiveChats();
  if (chatId) {
    stored[mode] = chatId;
  } else {
    delete stored[mode];
  }

  window.localStorage.setItem(CHAT_ACTIVE_IDS_STORAGE_KEY, JSON.stringify(stored));
}

export const Route = createFileRoute("/_app/chat/")({
  component: ChatPage,
});

function ChatPage() {
  const [mode, setMode] = useState<ChatMode>(() => readStoredMode());
  const [activeChatId, setActiveChatId] = useState<string | undefined>(() => getStoredActiveChatId(readStoredMode()));
  const [pendingMessages, setPendingMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");

  const [filters, setFilters] = useState<ChatFilters>({});
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewSource, setPreviewSource] = useState<ChatSource | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);

  const chatMutation = useSendChatMessage({
    mode,
    filters,
    activeChatId,
    setActiveChatId,
    setInput,
    clearPendingMessages: () => setPendingMessages([]),
  });

  const displayMessages: LocalMessage[] = useMemo(() => {
    if (activeChatId && dbMessages) {
      return (dbMessages as MessagesResponse<ChatSource[]>[]).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content || "",
        created: m.created,
        sources: m.sources || undefined,
      }));
    }
    return pendingMessages;
  }, [activeChatId, dbMessages, pendingMessages]);

  const showAssistantLoadingIndicator = useMemo(() => {
    if (displayMessages.length === 0) return false;

    const lastMessage = displayMessages[displayMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return false;

    if (!activeChatId) {
      return chatMutation.isPending;
    }

    const createdAt = Date.parse(lastMessage.created || "");
    if (Number.isNaN(createdAt)) return true;

    return Date.now() - createdAt < CHAT_POLL_TIMEOUT_MS;
  }, [activeChatId, chatMutation.isPending, displayMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    if (activeChatId) setPendingMessages([]);
  }, [activeChatId]);

  useEffect(() => {
    setStoredMode(mode);
  }, [mode]);

  useEffect(() => {
    setStoredActiveChatId(mode, activeChatId);
  }, [mode, activeChatId]);

  const handleSendMessage = (message: string) => {
    const isFts = mode === "fts";
    const hasExistingResults = isFts && (activeChatId !== undefined || pendingMessages.length > 0);

    if (hasExistingResults) {
      const now = Date.now();
      setActiveChatId(undefined);
      setPendingMessages([{ id: `pending-user-${now}`, role: "user", content: message, created: new Date(now).toISOString() }]);
      chatMutation.mutate({ message, newChat: true });
      return;
    }

    if (!activeChatId) {
      const now = Date.now();
      setPendingMessages((prev) => [...prev, { id: `pending-user-${now}`, role: "user", content: message, created: new Date(now).toISOString() }]);
    }
    chatMutation.mutate({ message });
  };

  const deleteChat = useDeleteChat();

  const handleNewChat = () => {
    setActiveChatId(undefined);
    setPendingMessages([]);
    setInput("");
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat.mutate(chatId);
    if (activeChatId === chatId) {
      handleNewChat();
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setPendingMessages([]);
    setInput("");
  };

  const handleModeChange = (newMode: ChatMode) => {
    setMode(newMode);
    setActiveChatId(getStoredActiveChatId(newMode));
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
      {isSidebarOpen && (
        <ChatHistorySidebar
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          mode={mode}
        />
      )}
      {isFiltersPanelOpen && <ChatFiltersPanel filters={filters} onFiltersChange={setFilters} onClose={() => setIsFiltersPanelOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatToolbar
          mode={mode}
          onModeChange={handleModeChange}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isFiltersPanelOpen={isFiltersPanelOpen}
          onOpenFilters={() => setIsFiltersPanelOpen(true)}
          activeFilterCount={activeFilterCount}
          hasMessages={displayMessages.length > 0}
          onNewChat={handleNewChat}
        />
        <div className="flex-1 overflow-y-auto">
          {isLoadingMessages && activeChatId ? (
            <MessageListSkeleton />
          ) : displayMessages.length === 0 ? (
            <ChatEmptyState mode={mode} />
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4">
              <div className="space-y-6">
                {displayMessages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mode={mode}
                    onSourceClick={handleSourceClick}
                    searchQuery={
                      message.role === "assistant"
                        ? [...displayMessages]
                            .slice(0, index)
                            .reverse()
                            .find((m) => m.role === "user")?.content
                        : undefined
                    }
                  />
                ))}
                {showAssistantLoadingIndicator && (
                  <MessageBubble
                    message={{ id: "assistant-loading-indicator", role: "assistant", content: "", isLoading: true }}
                    mode={mode}
                    onSourceClick={handleSourceClick}
                  />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>
        <ChatInput value={input} onChange={setInput} onSubmit={handleSendMessage} isPending={chatMutation.isPending} mode={mode} />
      </div>
      <PreviewDialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen} type="source" item={null} source={previewSource} />
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
