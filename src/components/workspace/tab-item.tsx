import { X, PenLine, FileText } from "lucide-react";
import { type WorkspaceTab, type WriterTab } from "@/lib/stores/workspace-tabs-store";
import { TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface TabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  isSplit: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

export function TabItem({ tab, isActive, isSplit, onClick, onClose }: TabItemProps) {
  const isWriter = tab.type === "writer";
  const isDirty = isWriter ? (tab as WriterTab).isDirty : false;

  return (
    <TabsTrigger
      value={tab.id}
      onClick={onClick}
      className={cn("group relative gap-1.5 pr-8 max-w-50 data-[state=active]:shadow-sm", isSplit && !isActive && "bg-primary/10 border-primary/30")}
    >
      {isWriter ? <PenLine className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
      {isDirty && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
      <span className="truncate" title={tab.title}>
        {tab.title || "Untitled"}
      </span>
      {isSplit && !isActive && <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 rounded-full bg-primary/10 shrink-0">Split</span>}
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
