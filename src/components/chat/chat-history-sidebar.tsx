import { useChats } from "@/lib/api/queries";
import { useUpdateChat } from "@/lib/api/mutations";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MessageSquare, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ChatsResponse } from "@/lib/pocketbase-types";

interface ChatHistorySidebarProps {
  activeChatId?: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  mode?: "chat" | "search";
}

export function ChatHistorySidebar({ activeChatId, onSelectChat, onNewChat, onDeleteChat, mode }: ChatHistorySidebarProps) {
  const { data: chats, isLoading } = useChats(mode);
  const updateChat = useUpdateChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

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

  const handleDelete = (chatId: string) => {
    onDeleteChat(chatId);
  };

  const groupedChats = groupChatsByTime(chats || []);

  return (
    <div className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col overflow-hidden">
      <div className="p-3">
        <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 **:data-[slot=scroll-area-viewport]:overflow-x-hidden!">
        <div className="p-2 space-y-4 max-w-full overflow-hidden">
          {isLoading && <div className="px-2 py-4 text-xs text-muted-foreground text-center">Loading chats...</div>}
          {!isLoading && (!chats || chats.length === 0) && (
            <div className="px-2 py-4 text-xs text-muted-foreground text-center">No conversations yet</div>
          )}
          {groupedChats.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{group.label}</div>
              <div className="space-y-0.5">
                {group.chats.map((chat) => (
                  <div key={chat.id} className="group relative">
                    {editingId === chat.id ? (
                      <div className="px-2 py-1">
                        <Input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleFinishRename(chat.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleFinishRename(chat.id);
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditTitle("");
                            }
                          }}
                          className="h-7 text-sm"
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "w-full min-w-0 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors overflow-hidden cursor-pointer",
                          activeChatId === chat.id
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1" onClick={() => onSelectChat(chat.id)}>
                          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">
                            {(chat.title || "Untitled").length > 25 ? (chat.title || "Untitled").slice(0, 25) + "…" : chat.title || "Untitled"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <div
                              role="button"
                              tabIndex={0}
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0 flex items-center justify-center rounded hover:bg-accent"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleStartRename(chat)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(chat.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ChatGroup {
  label: string;
  chats: ChatsResponse[];
}

function groupChatsByTime(chats: ChatsResponse[]): ChatGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, ChatsResponse[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    "Previous 30 Days": [],
    Older: [],
  };

  for (const chat of chats) {
    const updated = new Date(chat.updated);
    if (updated >= today) {
      groups["Today"].push(chat);
    } else if (updated >= yesterday) {
      groups["Yesterday"].push(chat);
    } else if (updated >= weekAgo) {
      groups["Previous 7 Days"].push(chat);
    } else if (updated >= monthAgo) {
      groups["Previous 30 Days"].push(chat);
    } else {
      groups["Older"].push(chat);
    }
  }

  return Object.entries(groups)
    .filter(([, chats]) => chats.length > 0)
    .map(([label, chats]) => ({ label, chats }));
}
