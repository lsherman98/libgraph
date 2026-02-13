import { useCallback, useState } from "react";
import { X, Plus, PenLine, Columns2, Square, Save, BookMarked, FileText } from "lucide-react";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type ReaderTab,
  type WriterTab,
} from "@/lib/stores/workspace-tabs-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewTabDialog } from "./new-tab-dialog";

interface WorkspaceTabBarProps {
  onSave?: () => void;
  className?: string;
}

export function WorkspaceTabBar({ onSave, className }: WorkspaceTabBarProps) {
  const navigate = useNavigate();
  const [splitPromptOpen, setSplitPromptOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [initialDialogTab, setInitialDialogTab] = useState<"documents" | "projects">("documents");
  const { tabs, activeTabId, splitMode, splitTabId, setActiveTab, removeTab, setSplitMode, closeSplit, getTab } =
    useWorkspaceTabsStore();

  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const activeWriterTab = activeTab?.type === "writer" ? (activeTab as WriterTab) : null;

  const handleTabClick = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab.id);
      // Update URL based on tab type
      if (tab.type === "reader") {
        navigate({ to: "/workspace", search: { id: (tab as ReaderTab).uploadId, type: "upload" } });
      } else {
        navigate({ to: "/workspace", search: { id: (tab as WriterTab).projectId, type: "project" } });
      }
    },
    [navigate, setActiveTab],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tab: WorkspaceTab) => {
      e.stopPropagation();
      removeTab(tab.id);

      // If this was the active tab, navigate to the next tab or documents
      if (tab.id === activeTabId) {
        const remainingTabs = tabs.filter((t) => t.id !== tab.id);
        if (remainingTabs.length > 0) {
          const nextTab = remainingTabs[0];
          if (nextTab.type === "reader") {
            navigate({ to: "/workspace", search: { id: (nextTab as ReaderTab).uploadId, type: "upload" } });
          } else {
            navigate({ to: "/workspace", search: { id: (nextTab as WriterTab).projectId, type: "project" } });
          }
        } else {
          navigate({ to: "/workspace" });
        }
      }
    },
    [removeTab, activeTabId, tabs, navigate],
  );

  const handleSplitToggle = useCallback(() => {
    if (splitMode === "horizontal") {
      closeSplit();
    } else if (tabs.length > 1) {
      setSplitMode("horizontal");
    } else {
      // Only 1 tab, prompt user to open another
      setSplitPromptOpen(true);
    }
  }, [splitMode, setSplitMode, closeSplit, tabs.length]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <header className={cn("flex h-12 shrink-0 items-center border-b bg-background", className)}>
      {/* Left sidebar trigger */}
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>

      {/* Tabs area */}
      <Tabs value={activeTabId || undefined} className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <TabsList className="h-full bg-transparent p-0 gap-1">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isSplit={tab.id === splitTabId}
              onClick={() => handleTabClick(tab)}
              onClose={(e) => handleTabClose(e, tab)}
            />
          ))}

          {/* Add new tab button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 ml-1"
            onClick={() => {
              setInitialDialogTab("documents");
              setNewTabOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </TabsList>
      </Tabs>

      {/* Right controls */}
      <div className="flex items-center gap-2 px-4">
        {/* Save button for writer tabs */}
        {activeWriterTab?.isDirty && onSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSave}>
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (⌘S)</TooltipContent>
          </Tooltip>
        )}

        {/* Split view toggle - always visible */}
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

        <Separator orientation="vertical" className="h-4" />

        {/* Right sidebar trigger */}
        <SidebarTrigger side="right" className="-mr-1" />
      </div>

      {/* Split prompt dialog */}
      <Dialog open={splitPromptOpen} onOpenChange={setSplitPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Another Tab</DialogTitle>
            <DialogDescription>
              To use split view, you need to have at least two tabs open. Open a document or writing project to
              continue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-center pt-4">
            <Button
              onClick={() => {
                setSplitPromptOpen(false);
                setInitialDialogTab("documents");
                setNewTabOpen(true);
              }}
            >
              <BookMarked className="mr-2 h-4 w-4" />
              Browse Documents
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSplitPromptOpen(false);
                setInitialDialogTab("projects");
                setNewTabOpen(true);
              }}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Writing Projects
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NewTabDialog open={newTabOpen} onOpenChange={setNewTabOpen} initialTab={initialDialogTab} />
    </header>
  );
}

interface TabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  isSplit: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabItem({ tab, isActive, isSplit, onClick, onClose }: TabItemProps) {
  const isWriter = tab.type === "writer";
  const isDirty = isWriter ? (tab as WriterTab).isDirty : false;

  return (
    <TabsTrigger
      value={tab.id}
      onClick={onClick}
      className={cn(
        "group relative gap-1.5 pr-8 max-w-50 data-[state=active]:shadow-sm",
        isSplit && !isActive && "bg-primary/10 border-primary/30",
      )}
    >
      {/* Tab type icon */}
      {isWriter ? <PenLine className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}

      {/* Dirty indicator */}
      {isDirty && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}

      <span className="truncate" title={tab.title}>
        {tab.title || "Untitled"}
      </span>

      {/* Split indicator */}
      {isSplit && !isActive && (
        <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 rounded-full bg-primary/10 shrink-0">
          Split
        </span>
      )}

      {/* Close button - using span to avoid nested button inside TabsTrigger */}
      <span
        role="button"
        tabIndex={0}
        className={cn(
          "absolute right-1.5 h-5 w-5 rounded-sm flex items-center justify-center shrink-0",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-muted",
        )}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose(e as unknown as React.MouseEvent);
          }
        }}
      >
        <X className="h-3 w-3" />
      </span>
    </TabsTrigger>
  );
}
