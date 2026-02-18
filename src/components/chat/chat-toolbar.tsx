import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PanelLeftClose, MessagesSquare, SlidersHorizontal, Settings2, MessageSquare, Search, RotateCcw } from "lucide-react";

interface ChatToolbarProps {
  mode: "chat" | "search";
  onModeChange: (mode: "chat" | "search") => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isFiltersPanelOpen: boolean;
  onOpenFilters: () => void;
  isSettingsPanelOpen: boolean;
  onOpenSettings: () => void;
  activeFilterCount: number;
  hasMessages: boolean;
  onNewChat: () => void;
}

export function ChatToolbar({
  mode,
  onModeChange,
  isSidebarOpen,
  onToggleSidebar,
  isFiltersPanelOpen,
  onOpenFilters,
  isSettingsPanelOpen,
  onOpenSettings,
  activeFilterCount,
  hasMessages,
  onNewChat,
}: ChatToolbarProps) {
  return (
    <div className="h-12 shrink-0 border-b border-border flex items-center px-4">
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar}>
                {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isSidebarOpen ? "Hide chat history" : "Show chat history"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {!isFiltersPanelOpen && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={onOpenFilters}>
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pipeline settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex-1 flex justify-center">
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as "chat" | "search")} className="h-8">
          <TabsList className="h-8 bg-transparent p-0 gap-1">
            <TabsTrigger value="chat" className="h-7 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none">
              <MessageSquare className="h-3 w-3 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="search" className="h-7 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none">
              <Search className="h-3 w-3 mr-1.5" />
              Search
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className={hasMessages ? "" : "invisible"}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onNewChat} className="gap-1.5 text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                New chat
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Start a new conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
