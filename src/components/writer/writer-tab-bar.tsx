import { useCallback } from "react";
import { X, Plus, Columns2, Square, PanelRight, Save } from "lucide-react";
import { useWriterTabsStore, type WriterTab } from "@/lib/stores/writer-tabs-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface WriterTabBarProps {
  onAddTab?: () => void;
  onSave?: () => void;
  className?: string;
}

export function WriterTabBar({ onAddTab, onSave, className }: WriterTabBarProps) {
  const {
    tabs,
    activeTabId,
    splitMode,
    splitTabId,
    workspacePanelOpen,
    setActiveTab,
    removeTab,
    setSplitMode,
    closeSplit,
    toggleWorkspacePanel,
  } = useWriterTabsStore();

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      removeTab(tabId);
    },
    [removeTab],
  );

  const handleSplitToggle = useCallback(() => {
    if (splitMode === "horizontal") {
      closeSplit();
    } else {
      setSplitMode("horizontal");
    }
  }, [splitMode, setSplitMode, closeSplit]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <header className={cn("flex h-12 shrink-0 items-center border-b bg-background", className)}>
      {/* Left sidebar trigger */}
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>

      {/* Tabs area */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isSplit={tab.id === splitTabId}
            onClick={() => handleTabClick(tab.id)}
            onClose={(e) => handleTabClose(e, tab.id)}
          />
        ))}
        {onAddTab && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 ml-1" onClick={onAddTab}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New writing project</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 px-4">
        {/* Save button */}
        {activeTab?.isDirty && onSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSave}>
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (⌘S)</TooltipContent>
          </Tooltip>
        )}

        {/* Split view toggle */}
        {tabs.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={splitMode === "horizontal" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={handleSplitToggle}
              >
                {splitMode === "horizontal" ? <Columns2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{splitMode === "horizontal" ? "Close split view" : "Split view"}</TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="h-4" />

        {/* Workspace panel toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={workspacePanelOpen ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={toggleWorkspacePanel}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{workspacePanelOpen ? "Hide workspace" : "Show workspace"}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        {/* Right sidebar trigger */}
        <SidebarTrigger side="right" className="-mr-1" />
      </div>
    </header>
  );
}

interface TabItemProps {
  tab: WriterTab;
  isActive: boolean;
  isSplit: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabItem({ tab, isActive, isSplit, onClick, onClose }: TabItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all shrink-0 max-w-50 border-b-2 -mb-px",
        isActive ? "border-primary bg-muted/50" : "border-transparent hover:bg-muted/30",
        isSplit && !isActive && "bg-primary/5 border-primary/30",
      )}
      onClick={onClick}
    >
      {/* Dirty indicator */}
      {tab.isDirty && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
      <span className="text-sm truncate" title={tab.title}>
        {tab.title || "Untitled"}
      </span>
      {isSplit && !isActive && (
        <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 rounded-full bg-primary/10 shrink-0">
          Split
        </span>
      )}
      <button
        className={cn(
          "h-5 w-5 rounded flex items-center justify-center shrink-0",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-muted-foreground/20",
        )}
        onClick={onClose}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
