import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { AnnotationsPanel } from "@/components/reader/annotations-panel";
import { Highlighter } from "lucide-react";

interface RightSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentPageId?: string;
  currentPageNumber?: number;
  onNavigateToPage?: (pageNumber: number, blockId?: string) => void;
}

export function RightSidebar({ currentPageId, currentPageNumber, onNavigateToPage, ...props }: RightSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 px-2 py-1.5">
            <Highlighter className="h-4 w-4" />
            <span className="font-semibold text-sm">Annotations</span>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="p-0">
        <AnnotationsPanel
          currentPageId={currentPageId}
          currentPageNumber={currentPageNumber}
          onNavigateToPage={onNavigateToPage}
        />
      </SidebarContent>
    </Sidebar>
  );
}
