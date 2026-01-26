import { LeftSidebar } from "@/components/left-sidebar";
import { RightSidebar } from "@/components/right-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import type { PropsWithChildren } from "react";
import { AppHeader } from "./header/app-header";
import { useReaderStore } from "@/lib/stores/reader-store";

export default function Layout({ children }: PropsWithChildren) {
  const isReadingMode = useReaderStore((state) => state.isReadingMode);
  const currentPageId = useReaderStore((state) => state.currentPageId);
  const currentPageNumber = useReaderStore((state) => state.currentPageNumber);
  const navigateToPage = useReaderStore((state) => state.navigateToPage);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
      className={
        "text-foreground group/body overscroll-none font-sans antialiased [--footer-height:calc(var(--spacing)*14)] [--header-height:calc(var(--spacing)*14)] xl:[--footer-height:calc(var(--spacing)*24)]"
      }
      defaultOpen={true}
    >
      <LeftSidebar variant="sidebar" />
      <SidebarInset className="overflow-hidden flex flex-col h-screen">
        {!isReadingMode && <AppHeader />}
        <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>
      </SidebarInset>
      <RightSidebar
        variant="sidebar"
        side="right"
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 90)",
          } as React.CSSProperties
        }
        currentPageId={currentPageId ?? undefined}
        currentPageNumber={currentPageNumber ?? undefined}
        onNavigateToPage={navigateToPage ?? undefined}
      />
    </SidebarProvider>
  );
}
