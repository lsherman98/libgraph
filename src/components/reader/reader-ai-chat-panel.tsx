import { useState, useRef, useEffect, useMemo } from "react";
import { useSidebarChats, useChatContexts, useMessages, useUploadById } from "@/lib/api/queries";
import {
  useCreateSidebarChat,
  useDeleteSidebarChat,
  useAddChatContext,
  useRemoveChatContext,
  useSendSidebarMessage,
  useUpdateChat,
} from "@/lib/api/mutations";
import { useReaderStore } from "@/lib/stores/reader-store";
import { useWorkspaceTabsStore, type ReaderTab } from "@/lib/stores/workspace-tabs-store";
import { MessageBubble, type LocalMessage } from "@/components/chat/message-bubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ArrowUp, Loader2, FileText, X, MessageSquare, MoreHorizontal, Pencil, Trash2, ChevronDown, Bot, Type, BookOpen } from "lucide-react";
import { cn, getUserId } from "@/lib/utils";
import type { MessagesResponse, ChatsResponse, ChatContextsResponse } from "@/lib/pocketbase-types";
import { ChatsTypeOptions, UploadsTypeOptions } from "@/lib/pocketbase-types";
import type { ChatSource } from "@/lib/types";

export function ReaderAiChatPanel() {
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [pendingMessages, setPendingMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [showChatList, setShowChatList] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [pageRangeDialog, setPageRangeDialog] = useState<{ uploadId: string; title: string } | null>(null);
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSyncingDefaultContextRef = useRef(false);

  const currentUploadId = useReaderStore((state) => state.currentUploadId);
  const currentPageId = useReaderStore((state) => state.currentPageId);
  const pendingChatText = useReaderStore((state) => state.pendingChatText);
  const setPendingChatText = useReaderStore((state) => state.setPendingChatText);

  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const otherReaderTabs = useMemo(
    () => tabs.filter((t): t is ReaderTab => t.type === "reader" && t.id !== activeTabId && !t.isSummary),
    [tabs, activeTabId],
  );

  const { data: sidebarChats = [] } = useSidebarChats();

  if (!activeChatId) return null;
  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);
  const { data: chatContexts = [] } = useChatContexts(activeChatId);
  const { data: currentUpload } = useUploadById(currentUploadId || "");
  const isBookUpload = currentUpload?.type === UploadsTypeOptions.book;

  const createChat = useCreateSidebarChat();
  const deleteChat = useDeleteSidebarChat();
  const updateChat = useUpdateChat();
  const addContext = useAddChatContext();
  const removeContext = useRemoveChatContext();

  const sendMessage = useSendSidebarMessage({
    activeChatId,
    setActiveChatId: (id) => {
      setActiveChatId(id);
      setPendingMessages([]);
    },
    setInput,
  });

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

  const hasMessages = displayMessages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    if (activeChatId) setPendingMessages([]);
  }, [activeChatId]);

  // When switching chats, reset confirmation state.
  // Context is confirmed once the user explicitly confirms or sends a message.
  useEffect(() => {
    setContextConfirmed(false);
  }, [activeChatId]);

  // Auto-confirm once messages exist (user already sent something)
  useEffect(() => {
    if (hasMessages) setContextConfirmed(true);
  }, [hasMessages]);

  // Dynamic default context: when reader file changes and context is not yet confirmed,
  // keep only the current auto context (doc/page) and remove stale ones.
  useEffect(() => {
    if (!activeChatId || !currentUploadId || contextConfirmed) return;
    if (chatContexts.length === 0) return;
    if (isSyncingDefaultContextRef.current) return;

    let cancelled = false;

    const syncDefaultContext = async () => {
      isSyncingDefaultContextRef.current = true;
      try {
        if (isBookUpload) {
          if (!currentPageId) return;

          const pageContexts = chatContexts.filter((ctx: ChatContextsResponse) => !!ctx.page && !ctx.text && !ctx.page_from);
          const stalePageContexts = pageContexts.filter((ctx: ChatContextsResponse) => ctx.page !== currentPageId);

          for (const staleCtx of stalePageContexts) {
            await removeContext.mutateAsync(staleCtx.id);
          }

          if (cancelled) return;

          const hasCurrentPage = pageContexts.some((ctx: ChatContextsResponse) => ctx.page === currentPageId);
          if (!hasCurrentPage) {
            await addContext.mutateAsync({
              chat: activeChatId,
              upload: currentUploadId,
              page: currentPageId,
              user: getUserId(),
            });
          }
          return;
        }

        const docContexts = chatContexts.filter((ctx: ChatContextsResponse) => !!ctx.upload && !ctx.page && !ctx.text && !ctx.page_from);
        const staleDocContexts = docContexts.filter((ctx: ChatContextsResponse) => ctx.upload !== currentUploadId);

        for (const staleCtx of staleDocContexts) {
          await removeContext.mutateAsync(staleCtx.id);
        }

        if (cancelled) return;

        const hasCurrentUpload = docContexts.some((ctx: ChatContextsResponse) => ctx.upload === currentUploadId);
        if (!hasCurrentUpload) {
          await addContext.mutateAsync({
            chat: activeChatId,
            upload: currentUploadId,
            user: getUserId(),
          });
        }
      } finally {
        isSyncingDefaultContextRef.current = false;
      }
    };

    syncDefaultContext();

    return () => {
      cancelled = true;
    };
  }, [currentUploadId, currentPageId, activeChatId, contextConfirmed, isBookUpload, chatContexts, addContext, removeContext]);

  // Handle pending chat text from highlight popover
  useEffect(() => {
    if (!pendingChatText) return;

    const addTextToChat = async () => {
      let chatId = activeChatId;
      if (!chatId) {
        // Create a new chat first
        if (!currentUploadId) {
          setPendingChatText(null);
          return;
        }
        const userId = getUserId();
        const record = await createChat.mutateAsync({
          title: "New chat",
          type: ChatsTypeOptions.reader_sidebar,
          user: userId,
        });
        chatId = record.id;
        setActiveChatId(chatId);
        setPendingMessages([]);
        setInput("");

        if (isBookUpload && currentPageId) {
          await addContext.mutateAsync({
            chat: chatId,
            upload: currentUploadId,
            page: currentPageId,
            user: userId,
          });
        } else {
          await addContext.mutateAsync({
            chat: chatId,
            upload: currentUploadId,
            user: userId,
          });
        }
      }

      setContextConfirmed(true);

      const existingContexts = chatId === activeChatId ? [...chatContexts] : [];
      await Promise.all(existingContexts.map((ctx: ChatContextsResponse) => removeContext.mutateAsync(ctx.id)));

      await addContext.mutateAsync({
        chat: chatId,
        text: pendingChatText,
        user: getUserId(),
      } as any);
      setPendingChatText(null);
    };

    addTextToChat();
  }, [
    pendingChatText,
    isBookUpload,
    currentPageId,
    currentUploadId,
    activeChatId,
    chatContexts,
    createChat,
    addContext,
    removeContext,
    setPendingChatText,
  ]);

  const contextCount = chatContexts.length;
  const canSend = input.trim().length > 0 && !sendMessage.isPending && contextCount > 0;

  const handleNewChat = async () => {
    if (!currentUploadId) return;
    const userId = getUserId();
    const record = await createChat.mutateAsync({
      title: "New chat",
      type: ChatsTypeOptions.reader_sidebar,
      user: userId,
    });
    setActiveChatId(record.id);
    setPendingMessages([]);
    setInput("");
    setContextConfirmed(false);

    if (isBookUpload && currentPageId) {
      await addContext.mutateAsync({
        chat: record.id,
        upload: currentUploadId,
        page: currentPageId,
        user: userId,
      });
    } else {
      await addContext.mutateAsync({
        chat: record.id,
        upload: currentUploadId,
        user: userId,
      });
    }
  };

  useEffect(() => {
    if (activeChatId) return;
    if (!currentUploadId) return;
    if (pendingChatText) return;
    if (createChat.isPending || addContext.isPending) return;

    handleNewChat();
  }, [activeChatId, currentUploadId, pendingChatText, createChat.isPending, addContext.isPending]);

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setPendingMessages([]);
    setInput("");
    setShowChatList(false);
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat.mutate(chatId);
    if (activeChatId === chatId) {
      setActiveChatId(undefined);
      setPendingMessages([]);
      setInput("");
    }
  };

  const handleSendMessage = () => {
    if (!canSend) return;
    setContextConfirmed(true);
    const message = input.trim();

    if (!activeChatId) {
      const now = Date.now();
      setPendingMessages((prev) => [
        ...prev,
        { id: `pending-user-${now}`, role: "user", content: message },
        { id: `pending-loading-${now}`, role: "assistant", content: "", isLoading: true },
      ]);
    }
    sendMessage.mutate(message);
  };

  const handleConfirmContext = () => {
    setContextConfirmed(true);
  };

  const handleAddUpload = (uploadId: string) => {
    if (!activeChatId) return;
    const alreadyAdded = chatContexts.some((ctx: ChatContextsResponse) => ctx.upload === uploadId && !ctx.page && !ctx.text && !ctx.page_from);
    if (alreadyAdded) return;

    addContext.mutate({
      chat: activeChatId,
      upload: uploadId,
      user: getUserId(),
    });
  };

  const handleAddCurrentPage = () => {
    if (!activeChatId || !currentPageId) return;
    const alreadyAdded = chatContexts.some((ctx: ChatContextsResponse) => ctx.page === currentPageId);
    if (alreadyAdded) return;

    addContext.mutate({
      chat: activeChatId,
      upload: currentUploadId || undefined,
      page: currentPageId,
      user: getUserId(),
    });
  };

  const handleOpenPageRangeDialog = (uploadId: string, title: string) => {
    setPageRangeDialog({ uploadId, title });
    setPageFrom("");
    setPageTo("");
  };

  const handleAddPageRange = () => {
    if (!activeChatId || !pageRangeDialog) return;
    const from = parseInt(pageFrom, 10);
    const to = parseInt(pageTo, 10);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) return;

    addContext.mutate({
      chat: activeChatId,
      upload: pageRangeDialog.uploadId,
      page_from: from,
      page_to: to,
      user: getUserId(),
    } as any);
    setPageRangeDialog(null);
  };

  const handleRemoveContext = (contextId: string) => {
    if (chatContexts.length <= 1) return;
    removeContext.mutate(contextId);
  };

  const handleStartRename = (chat: ChatsResponse) => {
    setEditingId(chat.id);
    setEditTitle(chat.title || "");
  };

  const handleFinishRename = (chatId: string) => {
    if (editTitle.trim()) {
      updateChat.mutate({ id: chatId, data: { title: editTitle.trim() } });
    }
    setEditingId(null);
    setEditTitle("");
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const getContextLabel = (ctx: ChatContextsResponse) => {
    const expanded = (ctx as any).expand;
    const textVal = ctx.text;
    if (textVal) {
      return textVal.length > 40 ? textVal.slice(0, 40) + "…" : textVal;
    }
    if (ctx.page_from && ctx.page_to) {
      const uploadTitle = expanded?.upload?.title || "Document";
      return `${uploadTitle} · pp.${ctx.page_from}-${ctx.page_to}`;
    }
    if (ctx.page && expanded?.page) {
      const upload = expanded.upload;
      const page = expanded.page;
      return `${upload?.title || "Document"} · p.${page.page || "?"}`;
    }
    if (ctx.upload && expanded?.upload) {
      return expanded.upload.title || "Untitled document";
    }
    if (ctx.page) return `Page ${ctx.page}`;
    if (ctx.upload) return `Document`;
    return "Context item";
  };

  const getContextIcon = (ctx: ChatContextsResponse) => {
    if (ctx.text) return <Type className="h-2.5 w-2.5 shrink-0" />;
    if (ctx.page_from) return <BookOpen className="h-2.5 w-2.5 shrink-0" />;
    return <FileText className="h-2.5 w-2.5 shrink-0" />;
  };

  // Helper: get current document title from tabs
  const currentDocTitle = useMemo(() => {
    if (!currentUploadId) return null;
    const tab = tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === currentUploadId);
    return tab?.title || "Current document";
  }, [currentUploadId, tabs]);

  const addContextDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {!isBookUpload && (
          <DropdownMenuItem onClick={() => currentUploadId && handleAddUpload(currentUploadId)} disabled={!currentUploadId}>
            <FileText className="h-3.5 w-3.5 mr-2" />
            Add current document
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleAddCurrentPage} disabled={!currentPageId}>
          <FileText className="h-3.5 w-3.5 mr-2" />
          Add current page
        </DropdownMenuItem>
        {isBookUpload && (
          <DropdownMenuItem
            onClick={() => currentUploadId && handleOpenPageRangeDialog(currentUploadId, currentDocTitle || "Document")}
            disabled={!currentUploadId}
          >
            <BookOpen className="h-3.5 w-3.5 mr-2" />
            Add page range...
          </DropdownMenuItem>
        )}
        {otherReaderTabs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileText className="h-3.5 w-3.5 mr-2" />
                Add from open tabs
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {otherReaderTabs.map((tab) => (
                  <DropdownMenuItem key={tab.id} onClick={() => handleAddUpload(tab.uploadId)}>
                    <FileText className="h-3.5 w-3.5 mr-2 shrink-0" />
                    <span className="truncate">{tab.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Chat view
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat selector header */}
      <div className="p-2 border-b">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-between h-7 text-xs px-2 font-normal"
            onClick={() => setShowChatList(!showChatList)}
          >
            <span className="truncate">{sidebarChats.find((c) => c.id === activeChatId)?.title || "Chat"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleNewChat}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {showChatList && (
          <div className="border rounded-md bg-popover max-h-40 overflow-y-auto mt-1">
            {sidebarChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeChatId}
                editingId={editingId}
                editTitle={editTitle}
                onSelect={handleSelectChat}
                onDelete={handleDeleteChat}
                onStartRename={handleStartRename}
                onFinishRename={handleFinishRename}
                setEditTitle={setEditTitle}
                setEditingId={setEditingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        {isLoadingMessages ? (
          <div className="p-4 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 px-4 text-center">
            <Bot className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">Ask a question about your attached documents</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {displayMessages.map((message) => (
              <MessageBubble key={message.id} message={message} mode="chat" />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area — context chips live here */}
      <div className="p-2 border-t">
        <div className="rounded-lg border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-shadow">
          {/* Context chips inside input box */}
          {contextCount > 0 && (
            <div className="flex flex-wrap gap-1 items-center px-2 pt-2">
              {chatContexts.map((ctx: ChatContextsResponse) => {
                // The default auto-added context is a whole-document upload with no page/text/page_from
                const isDefaultDocCtx = !!ctx.upload && !ctx.page && !ctx.text && !ctx.page_from;
                const isDefaultBookPageCtx = !!ctx.page && !ctx.text && !ctx.page_from && ctx.page === currentPageId;
                const isDefaultCtx = !contextConfirmed && (isBookUpload ? isDefaultBookPageCtx : isDefaultDocCtx);
                return (
                  <Badge
                    key={ctx.id}
                    variant="secondary"
                    className={cn("text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45", isDefaultCtx && "opacity-50 cursor-pointer hover:opacity-80")}
                    onClick={isDefaultCtx ? handleConfirmContext : undefined}
                    title={isDefaultCtx ? "Click to keep this context" : undefined}
                  >
                    {getContextIcon(ctx)}
                    <span className="truncate">{getContextLabel(ctx)}</span>
                    {!isDefaultCtx && (
                      <button
                        onClick={() => handleRemoveContext(ctx.id)}
                        className={cn(
                          "ml-0.5 h-3.5 w-3.5 rounded-sm flex items-center justify-center hover:bg-destructive/20",
                          chatContexts.length <= 1 && "opacity-30 cursor-not-allowed",
                        )}
                        disabled={chatContexts.length <= 1}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                );
              })}
              {addContextDropdown}
            </div>
          )}

          {contextCount === 0 && (
            <div className="flex items-center gap-1 px-2 pt-2">
              <span className="text-[10px] text-destructive">Add context to start</span>
              {addContextDropdown}
            </div>
          )}

          {/* Textarea + send button */}
          <div className="relative flex items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={contextCount === 0 ? "Add context above..." : "Ask about your documents..."}
              disabled={sendMessage.isPending || contextCount === 0}
              rows={3}
              className="min-h-20 max-h-48 resize-none border-0 bg-transparent px-3 py-2 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            />
            <div className="absolute right-1.5 bottom-1.5">
              <Button type="button" size="icon" disabled={!canSend} onClick={handleSendMessage} className="h-6 w-6 rounded-md">
                {sendMessage.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <PageRangeDialog
        open={!!pageRangeDialog}
        title={pageRangeDialog?.title || ""}
        pageFrom={pageFrom}
        pageTo={pageTo}
        setPageFrom={setPageFrom}
        setPageTo={setPageTo}
        onConfirm={handleAddPageRange}
        onCancel={() => setPageRangeDialog(null)}
      />
    </div>
  );
}

// ── Page range dialog ─────────────────────────────────────────────────────────

function PageRangeDialog({
  open,
  title,
  pageFrom,
  pageTo,
  setPageFrom,
  setPageTo,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  pageFrom: string;
  pageTo: string;
  setPageFrom: (v: string) => void;
  setPageTo: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const from = parseInt(pageFrom, 10);
  const to = parseInt(pageTo, 10);
  const isValid = !isNaN(from) && !isNaN(to) && from >= 1 && to >= from;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Add page range</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{title}</p>
        </DialogHeader>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label htmlFor="page-from" className="text-xs">
              From
            </Label>
            <Input
              id="page-from"
              type="number"
              min={1}
              value={pageFrom}
              onChange={(e) => setPageFrom(e.target.value)}
              placeholder="1"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="page-to" className="text-xs">
              To
            </Label>
            <Input
              id="page-to"
              type="number"
              min={1}
              value={pageTo}
              onChange={(e) => setPageTo(e.target.value)}
              placeholder="10"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid) onConfirm();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={!isValid} className="text-xs">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Chat list item ────────────────────────────────────────────────────────────

interface ChatListItemProps {
  chat: ChatsResponse;
  isActive: boolean;
  editingId: string | null;
  editTitle: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (chat: ChatsResponse) => void;
  onFinishRename: (id: string) => void;
  setEditTitle: (v: string) => void;
  setEditingId: (v: string | null) => void;
}

function ChatListItem({
  chat,
  isActive,
  editingId,
  editTitle,
  onSelect,
  onDelete,
  onStartRename,
  onFinishRename,
  setEditTitle,
  setEditingId,
}: ChatListItemProps) {
  if (editingId === chat.id) {
    return (
      <div className="px-1.5 py-0.5">
        <Input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => onFinishRename(chat.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onFinishRename(chat.id);
            if (e.key === "Escape") {
              setEditingId(null);
              setEditTitle("");
            }
          }}
          className="h-6 text-xs"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <div
        className={cn(
          "w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1" onClick={() => onSelect(chat.id)}>
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {(chat.title || "Untitled").length > 30 ? (chat.title || "Untitled").slice(0, 30) + "…" : chat.title || "Untitled"}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className="opacity-0 group-hover:opacity-100 h-5 w-5 shrink-0 flex items-center justify-center rounded hover:bg-accent"
            >
              <MoreHorizontal className="h-3 w-3" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onStartRename(chat)}>
              <Pencil className="h-3 w-3 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(chat.id)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
