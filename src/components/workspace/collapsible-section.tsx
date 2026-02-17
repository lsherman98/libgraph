import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CollapsibleSectionProps {
  sectionKey: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}

export function CollapsibleSection({ sectionKey, label, icon, count, expanded, onToggle, children }: CollapsibleSectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={() => onToggle(sectionKey)}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 text-left">
          <ChevronDown className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")} />
          {icon}
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 space-y-1 mt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
