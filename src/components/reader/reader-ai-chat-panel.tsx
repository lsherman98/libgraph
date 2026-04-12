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
import { Plus, ArrowUp, Loader2, FileText, X, MessageSquare, MoreHorizontal, Pencil, Trash2, ChevronDown, Type, BookOpen } from "lucide-react";
import { cn, getUserId } from "@/lib/utils";
import type { MessagesResponse, ChatsResponse, ChatContextsResponse } from "@/lib/pocketbase-types";
import { ChatsTypeOptions, UploadsTypeOptions } from "@/lib/pocketbase-types";
import type { ChatSource } from "@/lib/types";
import { PreviewDialog } from "@/components/workspace/preview-dialog";

type DraftContextSelection =
  | { type: "upload"; uploadId: string }
  | { type: "page"; pageId: string; uploadId?: string; pageNumber?: number }
  | { type: "range"; uploadId: string; pageFrom: number; pageTo: number; title?: string }
  | { type: "text"; text: string };

export function ReaderAiChatPanel() {
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [pendingMessages, setPendingMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [showChatList, setShowChatList] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [previewSource, setPreviewSource] = useState<ChatSource | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pageRangeDialog, setPageRangeDialog] = useState<{ uploadId: string; title: string } | null>(null);
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [draftContextSelections, setDraftContextSelections] = useState<DraftContextSelection[]>([]);
  const [confirmedDefaultContextByChat, setConfirmedDefaultContextByChat] = useState<Record<string, DraftContextSelection>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingContextAddKeysRef = useRef<Set<string>>(new Set());

  const currentUploadId = useReaderStore((state) => state.currentUploadId);
  const currentPageId = useReaderStore((state) => state.currentPageId);
  const currentPageNumber = useReaderStore((state) => state.currentPageNumber);
  const pendingChatText = useReaderStore((state) => state.pendingChatText);
  const setPendingChatText = useReaderStore((state) => state.setPendingChatText);

  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const otherReaderTabs = useMemo(
    () => tabs.filter((t): t is ReaderTab => t.type === "reader" && t.id !== activeTabId && !t.isSummary),
    [tabs, activeTabId],
  );

  const { data: sidebarChats = [] } = useSidebarChats();

  const { data: dbMessages, isLoading: isLoadingMessages } = useMessages(activeChatId);
  const { data: chatContexts = [] } = useChatContexts(activeChatId);
  const { data: currentUpload } = useUploadById(currentUploadId ?? undefined);
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
      }));
    }
    return pendingMessages;
  }, [activeChatId, dbMessages, pendingMessages]);

  const activeChatContexts = useMemo(
    () => (activeChatId ? chatContexts.filter((ctx: ChatContextsResponse) => ctx.chat === activeChatId) : []),
    [chatContexts, activeChatId],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    if (activeChatId) setPendingMessages([]);
  }, [activeChatId]);

  // Handle pending chat text from highlight popover
  useEffect(() => {
    if (!pendingChatText) return;

    const addTextToChat = async () => {
      if (!activeChatId) {
        addDraftContext({ type: "text", text: pendingChatText });
        setPendingChatText(null);
        return;
      }

      const existingContexts = [...activeChatContexts];
      await Promise.all(existingContexts.map((ctx: ChatContextsResponse) => removeContext.mutateAsync({ id: ctx.id, chatId: ctx.chat })));

      await addContext.mutateAsync({
        chat: activeChatId,
        text: pendingChatText,
        user: getUserId(),
      } as any);
      setPendingChatText(null);
    };

    addTextToChat();
  }, [pendingChatText, activeChatId, activeChatContexts, addContext, removeContext, setPendingChatText]);

  const contextCount = activeChatContexts.length;
  const activeConfirmedDefaultContext = activeChatId ? confirmedDefaultContextByChat[activeChatId] : undefined;
  const hasImplicitActiveContext =
    !!activeChatId && contextCount === 0 && !activeConfirmedDefaultContext && !!currentUploadId && (!isBookUpload || !!currentPageId);
  const hasExplicitDraftContexts = !activeChatId && draftContextSelections.length > 0;
  const hasImplicitDraftContext = !activeChatId && draftContextSelections.length === 0 && !!currentUploadId && (!isBookUpload || !!currentPageId);
  const hasDraftContext = hasExplicitDraftContexts || hasImplicitDraftContext;
  const hasSendContext = activeChatId ? contextCount > 0 || hasImplicitActiveContext || !!activeConfirmedDefaultContext : hasDraftContext;
  const displayedContextCount = activeChatId
    ? contextCount > 0
      ? contextCount
      : activeConfirmedDefaultContext
        ? 1
        : hasImplicitActiveContext
          ? 1
          : 0
    : hasExplicitDraftContexts
      ? draftContextSelections.length
      : hasImplicitDraftContext
        ? 1
        : 0;
  const canSend = input.trim().length > 0 && !sendMessage.isPending && hasSendContext;

  const singlePageContext = useMemo(() => {
    const pageContexts = activeChatContexts.filter((ctx: ChatContextsResponse) => !!ctx.page && !ctx.text && !ctx.page_from);
    if (pageContexts.length !== 1) return null;

    const ctx = pageContexts[0] as ChatContextsResponse & {
      expand?: {
        page?: {
          page?: number;
        };
      };
    };

    const pageNumber = ctx.expand?.page?.page;
    return {
      uploadId: ctx.upload,
      pageNumber: typeof pageNumber === "number" && pageNumber > 0 ? pageNumber : undefined,
    };
  }, [activeChatContexts]);

  const getDraftContextKey = (selection: DraftContextSelection) => {
    if (selection.type === "upload") return `upload:${selection.uploadId}`;
    if (selection.type === "page") return `page:${selection.uploadId || ""}:${selection.pageId}`;
    if (selection.type === "range") return `range:${selection.uploadId}:${selection.pageFrom}:${selection.pageTo}`;
    return `text:${selection.text}`;
  };

  const addDraftContext = (selection: DraftContextSelection) => {
    const key = getDraftContextKey(selection);
    setDraftContextSelections((prev) => {
      if (prev.some((ctx) => getDraftContextKey(ctx) === key)) return prev;
      return [...prev, selection];
    });
  };

  const handleRemoveDraftContext = (selection: DraftContextSelection) => {
    const key = getDraftContextKey(selection);
    setDraftContextSelections((prev) => prev.filter((ctx) => getDraftContextKey(ctx) !== key));
  };

  const handleConfirmImplicitDraftContext = () => {
    if (activeChatId || !hasImplicitDraftContext || !currentUploadId) return;

    if (isBookUpload && currentPageId) {
      addDraftContext({
        type: "page",
        uploadId: currentUploadId,
        pageId: currentPageId,
        pageNumber: currentPageNumber || undefined,
      });
      return;
    }

    addDraftContext({
      type: "upload",
      uploadId: currentUploadId,
    });
  };

  const createChatShell = async () => {
    const userId = getUserId();
    const record = await createChat.mutateAsync({
      title: "New chat",
      type: ChatsTypeOptions.context_chat,
      user: userId,
    });
    setActiveChatId(record.id);
    setPendingMessages([]);
    setInput("");
    return record.id;
  };

  const handleNewChat = () => {
    setActiveChatId(undefined);
    setPendingMessages([]);
    setInput("");
    setShowChatList(false);
    setDraftContextSelections([]);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setPendingMessages([]);
    setInput("");
    setDraftContextSelections([]);
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat.mutate(chatId);
    if (activeChatId === chatId) {
      setActiveChatId(undefined);
      setPendingMessages([]);
      setInput("");
      setDraftContextSelections([]);
    }
    setConfirmedDefaultContextByChat((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
  };

  const handleSendMessage = async () => {
    if (!canSend) return;
    const message = input.trim();

    if (!activeChatId) {
      if (!currentUploadId) return;

      const userId = getUserId();
      const newChatId = await createChatShell();
      if (!newChatId) {
        return;
      }

      const contextsToPersist =
        draftContextSelections.length > 0
          ? draftContextSelections
          : isBookUpload && currentPageId
            ? ([
                {
                  type: "page",
                  uploadId: currentUploadId,
                  pageId: currentPageId,
                  pageNumber: currentPageNumber || undefined,
                },
              ] as DraftContextSelection[])
            : ([{ type: "upload", uploadId: currentUploadId }] as DraftContextSelection[]);

      const uniqueContexts = contextsToPersist.filter(
        (ctx, idx, arr) => arr.findIndex((other) => getDraftContextKey(other) === getDraftContextKey(ctx)) === idx,
      );

      for (const draftContextSelection of uniqueContexts) {
        if (draftContextSelection.type === "text") {
          await addContext.mutateAsync({
            chat: newChatId,
            text: draftContextSelection.text,
            user: userId,
          } as any);
          continue;
        }

        if (draftContextSelection.type === "page") {
          await addContext.mutateAsync({
            chat: newChatId,
            upload: draftContextSelection.uploadId || currentUploadId,
            page: draftContextSelection.pageId,
            user: userId,
          });
          continue;
        }

        if (draftContextSelection.type === "range") {
          await addContext.mutateAsync({
            chat: newChatId,
            upload: draftContextSelection.uploadId,
            page_from: draftContextSelection.pageFrom,
            page_to: draftContextSelection.pageTo,
            user: userId,
          } as any);
          continue;
        }

        await addContext.mutateAsync({
          chat: newChatId,
          upload: draftContextSelection.uploadId,
          user: userId,
        });
      }

      sendMessage.mutate({ message, chatId: newChatId });
      return;
    }

    if (activeConfirmedDefaultContext && activeChatId) {
      if (activeConfirmedDefaultContext.type === "page") {
        await addContext.mutateAsync({
          chat: activeChatId,
          upload: activeConfirmedDefaultContext.uploadId,
          page: activeConfirmedDefaultContext.pageId,
          user: getUserId(),
        });
      } else if (activeConfirmedDefaultContext.type === "upload") {
        await addContext.mutateAsync({
          chat: activeChatId,
          upload: activeConfirmedDefaultContext.uploadId,
          user: getUserId(),
        });
      }

      setConfirmedDefaultContextByChat((prev) => {
        const next = { ...prev };
        delete next[activeChatId];
        return next;
      });
    } else if (hasImplicitActiveContext && activeChatId && currentUploadId) {
      await addContext.mutateAsync(
        isBookUpload && currentPageId
          ? {
              chat: activeChatId,
              upload: currentUploadId,
              page: currentPageId,
              user: getUserId(),
            }
          : {
              chat: activeChatId,
              upload: currentUploadId,
              user: getUserId(),
            },
      );
    }

    sendMessage.mutate({ message });
  };

  const handleAddUpload = async (uploadId: string) => {
    if (!activeChatId) {
      addDraftContext({ type: "upload", uploadId });
      return;
    }

    const chatId = activeChatId;
    const contextKey = `upload:${chatId}:${uploadId}`;
    if (pendingContextAddKeysRef.current.has(contextKey)) return;

    const alreadyAdded = activeChatContexts.some((ctx: ChatContextsResponse) => ctx.upload === uploadId && !ctx.page && !ctx.text && !ctx.page_from);
    if (alreadyAdded) return;

    pendingContextAddKeysRef.current.add(contextKey);
    try {
      await addContext.mutateAsync({
        chat: chatId,
        upload: uploadId,
        user: getUserId(),
      });
    } finally {
      pendingContextAddKeysRef.current.delete(contextKey);
    }
  };

  const handleAddCurrentPage = async () => {
    if (!currentPageId) return;

    if (!activeChatId) {
      addDraftContext({
        type: "page",
        pageId: currentPageId,
        uploadId: currentUploadId || undefined,
        pageNumber: currentPageNumber || undefined,
      });
      return;
    }

    const chatId = activeChatId;

    const contextKey = `page:${chatId}:${currentPageId}`;
    if (pendingContextAddKeysRef.current.has(contextKey)) return;

    pendingContextAddKeysRef.current.add(contextKey);
    try {
      const contextsForChat = activeChatId === chatId ? activeChatContexts : [];
      const isAlreadyCurrentPageContext = contextsForChat.some(
        (ctx: ChatContextsResponse) => ctx.page === currentPageId && !ctx.text && !ctx.page_from,
      );

      if (isAlreadyCurrentPageContext) return;

      const defaultDocContexts = contextsForChat.filter(
        (ctx: ChatContextsResponse) => ctx.upload === currentUploadId && !ctx.page && !ctx.text && !ctx.page_from,
      );

      if (defaultDocContexts.length > 0) {
        await Promise.all(defaultDocContexts.map((ctx: ChatContextsResponse) => removeContext.mutateAsync({ id: ctx.id, chatId: ctx.chat })));
      }

      await addContext.mutateAsync({
        chat: chatId,
        upload: currentUploadId || undefined,
        page: currentPageId,
        user: getUserId(),
      });
    } finally {
      pendingContextAddKeysRef.current.delete(contextKey);
    }
  };

  const handleOpenPageRangeDialog = (uploadId: string, title: string) => {
    setPageRangeDialog({ uploadId, title });
    setPageFrom("");
    setPageTo("");
  };

  const handleAddPageRange = async () => {
    if (!pageRangeDialog) return;

    const from = parseInt(pageFrom, 10);
    const to = parseInt(pageTo, 10);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) return;

    if (!activeChatId) {
      addDraftContext({
        type: "range",
        uploadId: pageRangeDialog.uploadId,
        pageFrom: from,
        pageTo: to,
        title: pageRangeDialog.title,
      });
      setPageRangeDialog(null);
      return;
    }

    const chatId = activeChatId;

    const contextKey = `range:${chatId}:${pageRangeDialog.uploadId}:${from}-${to}`;
    if (pendingContextAddKeysRef.current.has(contextKey)) return;

    pendingContextAddKeysRef.current.add(contextKey);
    try {
      await addContext.mutateAsync({
        chat: chatId,
        upload: pageRangeDialog.uploadId,
        page_from: from,
        page_to: to,
        user: getUserId(),
      } as any);
      setPageRangeDialog(null);
    } finally {
      pendingContextAddKeysRef.current.delete(contextKey);
    }
  };

  const handleRemoveContext = (contextId: string) => {
    if (!activeChatId) return;
    removeContext.mutate({ id: contextId, chatId: activeChatId });
  };

  const handleConfirmImplicitActiveContext = async () => {
    if (!activeChatId || !hasImplicitActiveContext || !currentUploadId) return;

    setConfirmedDefaultContextByChat((prev) => ({
      ...prev,
      [activeChatId]:
        isBookUpload && currentPageId
          ? {
              type: "page",
              uploadId: currentUploadId,
              pageId: currentPageId,
              pageNumber: currentPageNumber || undefined,
            }
          : {
              type: "upload",
              uploadId: currentUploadId,
            },
    }));
  };

  const handleRemoveConfirmedDefaultContext = () => {
    if (!activeChatId) return;
    setConfirmedDefaultContextByChat((prev) => {
      const next = { ...prev };
      delete next[activeChatId];
      return next;
    });
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

  const handleSourceClick = (source: ChatSource) => {
    const fallbackUploadId = source.upload_id ?? singlePageContext?.uploadId;
    const fallbackPageNumber = source.page_number ?? singlePageContext?.pageNumber;

    setPreviewSource({
      ...source,
      upload_id: fallbackUploadId,
      page_number: fallbackPageNumber,
    });
    setIsPreviewOpen(true);
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

  const getContextHoverLabel = (ctx: ChatContextsResponse) => {
    const expanded = (ctx as any).expand;
    const uploadTitle = expanded?.upload?.title || "Document";

    if (ctx.text) {
      return ctx.text;
    }

    if (ctx.page_from && ctx.page_to) {
      return `${uploadTitle} · Pages ${ctx.page_from}-${ctx.page_to}`;
    }

    if (ctx.page) {
      const pageNumber = expanded?.page?.page;
      return `${uploadTitle} · Page ${pageNumber || "?"}`;
    }

    if (ctx.upload) {
      return uploadTitle;
    }

    return "Context item";
  };

  const getContextIcon = (ctx: ChatContextsResponse) => {
    if (ctx.text) return <Type className="h-2.5 w-2.5 shrink-0" />;
    if (ctx.page_from) return <BookOpen className="h-2.5 w-2.5 shrink-0" />;
    return <FileText className="h-2.5 w-2.5 shrink-0" />;
  };

  const currentDocTitle = useMemo(() => {
    if (!currentUploadId) return null;
    const tab = tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === currentUploadId);
    return tab?.title || "Current document";
  }, [currentUploadId, tabs]);

  const getUploadTitleById = (uploadId?: string) => {
    if (!uploadId) return "Document";
    if (uploadId === currentUploadId) return currentDocTitle || "Current document";
    const tab = tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === uploadId);
    return tab?.title || "Document";
  };

  const getDraftContextHoverLabel = (selection: DraftContextSelection) => {
    if (selection.type === "text") return selection.text;

    if (selection.type === "page") {
      const title = getUploadTitleById(selection.uploadId);
      const pageNumber = selection.pageNumber || currentPageNumber || "?";
      return `${title} · Page ${pageNumber}`;
    }

    if (selection.type === "range") {
      const title = selection.title || getUploadTitleById(selection.uploadId);
      return `${title} · Pages ${selection.pageFrom}-${selection.pageTo}`;
    }

    return getUploadTitleById(selection.uploadId);
  };

  const getDraftContextLabel = (selection: DraftContextSelection) => {
    if (selection.type === "text") {
      return selection.text.length > 40 ? selection.text.slice(0, 40) + "…" : selection.text;
    }

    if (selection.type === "page") {
      const title = getUploadTitleById(selection.uploadId);
      const pageNumber = selection.pageNumber || currentPageNumber || "?";
      return `${title} · p.${pageNumber}`;
    }

    if (selection.type === "range") {
      const title = selection.title || getUploadTitleById(selection.uploadId);
      return `${title} · pp.${selection.pageFrom}-${selection.pageTo}`;
    }

    return getUploadTitleById(selection.uploadId);
  };

  const getDraftContextIcon = (selection: DraftContextSelection) => {
    if (selection.type === "text") return <Type className="h-2.5 w-2.5 shrink-0" />;
    if (selection.type === "range") return <BookOpen className="h-2.5 w-2.5 shrink-0" />;
    return <FileText className="h-2.5 w-2.5 shrink-0" />;
  };

  const addContextDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {!isBookUpload && (
          <DropdownMenuItem onClick={() => currentUploadId && void handleAddUpload(currentUploadId)} disabled={!currentUploadId}>
            <FileText className="h-3.5 w-3.5 mr-2" />
            Add current document
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void handleAddCurrentPage()} disabled={!currentPageId}>
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
                  <DropdownMenuItem key={tab.id} onClick={() => void handleAddUpload(tab.uploadId)}>
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
      <div className="border-b px-2 py-2.5">
        <div className="flex w-full items-center gap-1 h-8.5">
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
        ) : displayMessages.length > 0 ? (
          <div className="p-3 space-y-4">
            {displayMessages.map((message) => (
              <MessageBubble key={message.id} message={message} mode="chat" onSourceClick={handleSourceClick} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : null}
      </ScrollArea>

      {/* Input area — context chips live here */}
      <div className="p-2 border-t">
        <div className="rounded-lg border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-shadow">
          {/* Context chips inside input box */}
          {displayedContextCount > 0 && (
            <div className="flex flex-wrap gap-1 items-center px-2 pt-2">
              {!activeChatId &&
                hasExplicitDraftContexts &&
                draftContextSelections.map((selection) => {
                  const contextKey = getDraftContextKey(selection);
                  return (
                    <Badge
                      key={contextKey}
                      variant="secondary"
                      className="text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45"
                      title={getDraftContextHoverLabel(selection)}
                    >
                      {getDraftContextIcon(selection)}
                      <span className="truncate">{getDraftContextLabel(selection)}</span>
                      <button
                        onClick={() => handleRemoveDraftContext(selection)}
                        className="ml-0.5 h-3.5 w-3.5 rounded-sm flex items-center justify-center hover:bg-destructive/20"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
              {!activeChatId && hasImplicitDraftContext && (
                <Badge
                  asChild
                  variant="secondary"
                  className="text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45 opacity-50 cursor-pointer hover:opacity-80"
                >
                  <button
                    type="button"
                    title={
                      isBookUpload && currentPageNumber
                        ? `${currentDocTitle || "Current document"} · Page ${currentPageNumber}`
                        : currentDocTitle || "Current document"
                    }
                    onClick={handleConfirmImplicitDraftContext}
                  >
                    {isBookUpload && currentPageNumber ? (
                      <BookOpen className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {isBookUpload && currentPageNumber
                        ? `${currentDocTitle || "Current document"} · p.${currentPageNumber}`
                        : currentDocTitle || "Current document"}
                    </span>
                  </button>
                </Badge>
              )}
              {!!activeChatId && !!activeConfirmedDefaultContext && (
                <Badge
                  variant="secondary"
                  className="text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45"
                  title={getDraftContextHoverLabel(activeConfirmedDefaultContext)}
                >
                  {getDraftContextIcon(activeConfirmedDefaultContext)}
                  <span className="truncate">{getDraftContextLabel(activeConfirmedDefaultContext)}</span>
                  <button
                    onClick={handleRemoveConfirmedDefaultContext}
                    className="ml-0.5 h-3.5 w-3.5 rounded-sm flex items-center justify-center hover:bg-destructive/20"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {!!activeChatId && hasImplicitActiveContext && (
                <Badge
                  asChild
                  variant="secondary"
                  className="text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45 opacity-50 cursor-pointer hover:opacity-80"
                >
                  <button
                    type="button"
                    title={
                      isBookUpload && currentPageNumber
                        ? `${currentDocTitle || "Current document"} · Page ${currentPageNumber}`
                        : currentDocTitle || "Current document"
                    }
                    onClick={() => void handleConfirmImplicitActiveContext()}
                  >
                    {isBookUpload && currentPageNumber ? (
                      <BookOpen className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {isBookUpload && currentPageNumber
                        ? `${currentDocTitle || "Current document"} · p.${currentPageNumber}`
                        : currentDocTitle || "Current document"}
                    </span>
                  </button>
                </Badge>
              )}
              {activeChatContexts.map((ctx: ChatContextsResponse) => {
                return (
                  <Badge key={ctx.id} variant="secondary" className="text-[10px] h-5 gap-1 pl-1.5 pr-0.5 max-w-45" title={getContextHoverLabel(ctx)}>
                    {getContextIcon(ctx)}
                    <span className="truncate">{getContextLabel(ctx)}</span>
                    <button
                      onClick={() => handleRemoveContext(ctx.id)}
                      className="ml-0.5 h-3.5 w-3.5 rounded-sm flex items-center justify-center hover:bg-destructive/20"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                );
              })}
              {addContextDropdown}
            </div>
          )}

          {displayedContextCount === 0 && (
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
                  void handleSendMessage();
                }
              }}
              disabled={sendMessage.isPending || !hasSendContext}
              rows={3}
              className="min-h-20 max-h-48 resize-none border-0 bg-transparent px-3 py-2 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            />
            <div className="absolute right-1.5 bottom-1.5">
              <Button type="button" size="icon" disabled={!canSend} onClick={() => void handleSendMessage()} className="h-6 w-6 rounded-md">
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

      <PreviewDialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen} type="source" item={null} source={previewSource} />
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
