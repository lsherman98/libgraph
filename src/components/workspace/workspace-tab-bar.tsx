import { useCallback, useState } from "react";
import { Plus, PenLine, Columns2, Square, Save, BookMarked } from "lucide-react";
import { useWorkspaceTabsStore, type WorkspaceTab, type ReaderTab, type WriterTab } from "@/lib/stores/workspace-tabs-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewTabDialog } from "./new-tab-dialog";
import { TabItem } from "./tab-item";

interface WorkspaceTabBarProps {
  onSave?: () => void;
  className?: string;
}

export function WorkspaceTabBar({ onSave, className }: WorkspaceTabBarProps) {
  const navigate = useNavigate();
  const [splitPromptOpen, setSplitPromptOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [initialDialogTab, setInitialDialogTab] = useState<"documents" | "projects">("documents");
  const { tabs, activeTabId, splitMode, splitTabId, focusedPane, setActiveTab, removeTab, setSplitMode, closeSplit, getTab } =
    useWorkspaceTabsStore();

  const focusedTabId = splitMode === "horizontal" && splitTabId && focusedPane === "secondary" ? splitTabId : activeTabId;

  const activeTab = activeTabId ? getTab(activeTabId) : null;
  const activeWriterTab = activeTab?.type === "writer" ? (activeTab as WriterTab) : null;

  const navigateToTab = useCallback(
    (tab: WorkspaceTab) => {
      const isReader = tab.type === "reader";
      navigate({
        to: "/workspace",
        search: {
          id: isReader ? (tab as ReaderTab).uploadId : (tab as WriterTab).projectId,
          type: isReader ? "upload" : "project",
        },
      });
    },
    [navigate],
  );

  const handleTabClick = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab.id);
      navigateToTab(tab);
    },
    [navigateToTab, setActiveTab],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tab: WorkspaceTab) => {
      e.stopPropagation();
      removeTab(tab.id);

      if (tab.id === activeTabId) {
        const remainingTabs = tabs.filter((t) => t.id !== tab.id);
        if (remainingTabs.length > 0) {
          navigateToTab(remainingTabs[0]);
        } else {
          navigate({ to: "/workspace" });
        }
      }
    },
    [removeTab, activeTabId, tabs, navigate, navigateToTab],
  );

  const handleSplitToggle = useCallback(() => {
    if (splitMode === "horizontal") {
      closeSplit();
    } else if (tabs.length > 1) {
      setSplitMode("horizontal");
    } else {
      setSplitPromptOpen(true);
    }
  }, [splitMode, setSplitMode, closeSplit, tabs.length]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <header className={cn("flex h-12 shrink-0 items-center border-b bg-background", className)}>
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>
      <Tabs value={focusedTabId || undefined} className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <TabsList className="h-full bg-transparent p-0 gap-1">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === focusedTabId}
              isOpenPrimary={tab.id === activeTabId}
              isOpenSecondary={tab.id === splitTabId}
              showSplitIndicators={splitMode === "horizontal"}
              onClick={() => handleTabClick(tab)}
              onClose={(e) => handleTabClose(e, tab)}
            />
          ))}
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
      <div className="flex items-center gap-2 px-4">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={splitMode === "horizontal" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={handleSplitToggle}>
              {splitMode === "horizontal" ? <Columns2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{splitMode === "horizontal" ? "Close split view" : "Split view"}</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="h-4" />
        <SidebarTrigger side="right" className="-mr-1" />
      </div>
      <Dialog open={splitPromptOpen} onOpenChange={setSplitPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Another Tab</DialogTitle>
            <DialogDescription>
              To use split view, you need to have at least two tabs open. Open a document or writing project to continue.
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
