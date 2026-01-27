import { useCallback } from "react";
import { X, Plus, FileText, PenLine } from "lucide-react";
import { useReaderTabsStore, type ReaderTab } from "@/lib/stores/reader-tabs-store";
import { useWriterTabsStore, type WriterTab } from "@/lib/stores/writer-tabs-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UnifiedTab = { type: "reader"; tab: ReaderTab } | { type: "writer"; tab: WriterTab };

interface UnifiedTabBarProps {
  className?: string;
}

export function UnifiedTabBar({ className }: UnifiedTabBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Reader tabs state
  const readerTabs = useReaderTabsStore((state) => state.tabs);
  const activeReaderTabId = useReaderTabsStore((state) => state.activeTabId);
  const setActiveReaderTab = useReaderTabsStore((state) => state.setActiveTab);
  const removeReaderTab = useReaderTabsStore((state) => state.removeTab);
  const getReaderTab = useReaderTabsStore((state) => state.getTab);

  // Writer tabs state
  const writerTabs = useWriterTabsStore((state) => state.tabs);
  const activeWriterTabId = useWriterTabsStore((state) => state.activeTabId);
  const setActiveWriterTab = useWriterTabsStore((state) => state.setActiveTab);
  const removeWriterTab = useWriterTabsStore((state) => state.removeTab);
  const getWriterTab = useWriterTabsStore((state) => state.getTab);

  // Determine which tab is currently active based on route
  const isReaderRoute = location.pathname.startsWith("/reader");
  const isWriterRoute = location.pathname.startsWith("/writer");

  // Combine tabs into unified list
  const unifiedTabs: UnifiedTab[] = [
    ...readerTabs.map((tab) => ({ type: "reader" as const, tab })),
    ...writerTabs.map((tab) => ({ type: "writer" as const, tab })),
  ];

  const handleTabClick = useCallback(
    (unifiedTab: UnifiedTab) => {
      if (unifiedTab.type === "reader") {
        setActiveReaderTab(unifiedTab.tab.id);
        navigate({ to: "/reader", search: { uploadId: unifiedTab.tab.uploadId } });
      } else {
        setActiveWriterTab(unifiedTab.tab.id);
        navigate({ to: "/writer", search: { projectId: unifiedTab.tab.projectId } });
      }
    },
    [navigate, setActiveReaderTab, setActiveWriterTab],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, unifiedTab: UnifiedTab) => {
      e.stopPropagation();
      if (unifiedTab.type === "reader") {
        removeReaderTab(unifiedTab.tab.id);
        // If this was the active tab, navigate appropriately
        if (unifiedTab.tab.id === activeReaderTabId) {
          const remainingReaderTabs = readerTabs.filter((t) => t.id !== unifiedTab.tab.id);
          if (remainingReaderTabs.length > 0) {
            // Stay on reader with next tab
          } else if (writerTabs.length > 0 && activeWriterTabId) {
            // Switch to writer
            const writerTab = getWriterTab(activeWriterTabId);
            if (writerTab) {
              navigate({ to: "/writer", search: { projectId: writerTab.projectId } });
            }
          }
        }
      } else {
        removeWriterTab(unifiedTab.tab.id);
        // If this was the active tab, navigate appropriately
        if (unifiedTab.tab.id === activeWriterTabId) {
          const remainingWriterTabs = writerTabs.filter((t) => t.id !== unifiedTab.tab.id);
          if (remainingWriterTabs.length > 0) {
            // Stay on writer with next tab
          } else if (readerTabs.length > 0 && activeReaderTabId) {
            // Switch to reader
            const readerTab = getReaderTab(activeReaderTabId);
            if (readerTab) {
              navigate({ to: "/reader", search: { uploadId: readerTab.uploadId } });
            }
          }
        }
      }
    },
    [
      removeReaderTab,
      removeWriterTab,
      activeReaderTabId,
      activeWriterTabId,
      readerTabs,
      writerTabs,
      navigate,
      getReaderTab,
      getWriterTab,
    ],
  );

  const isTabActive = useCallback(
    (unifiedTab: UnifiedTab) => {
      if (unifiedTab.type === "reader") {
        return isReaderRoute && unifiedTab.tab.id === activeReaderTabId;
      } else {
        return isWriterRoute && unifiedTab.tab.id === activeWriterTabId;
      }
    },
    [isReaderRoute, isWriterRoute, activeReaderTabId, activeWriterTabId],
  );

  if (unifiedTabs.length === 0) {
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
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {unifiedTabs.map((unifiedTab) => (
          <TabItem
            key={`${unifiedTab.type}-${unifiedTab.tab.id}`}
            unifiedTab={unifiedTab}
            isActive={isTabActive(unifiedTab)}
            onClick={() => handleTabClick(unifiedTab)}
            onClose={(e) => handleTabClose(e, unifiedTab)}
          />
        ))}

        {/* Add new tab dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 ml-1">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => navigate({ to: "/documents" })}>
              <FileText className="mr-2 h-4 w-4" />
              Open Document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/writer" })}>
              <PenLine className="mr-2 h-4 w-4" />
              New Writing Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 px-4">
        <Separator orientation="vertical" className="h-4" />
        <SidebarTrigger side="right" className="-mr-1" />
      </div>
    </header>
  );
}

interface TabItemProps {
  unifiedTab: UnifiedTab;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabItem({ unifiedTab, isActive, onClick, onClose }: TabItemProps) {
  const isWriter = unifiedTab.type === "writer";
  const title = unifiedTab.tab.title;
  const isDirty = isWriter ? (unifiedTab.tab as WriterTab).isDirty : false;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all shrink-0 max-w-50 border-b-2 -mb-px",
        isActive ? "border-primary bg-muted/50" : "border-transparent hover:bg-muted/30",
      )}
      onClick={onClick}
    >
      {/* Tab type icon */}
      {isWriter ? (
        <PenLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}

      {/* Dirty indicator */}
      {isDirty && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}

      <span className="text-sm truncate" title={title}>
        {title || "Untitled"}
      </span>

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
