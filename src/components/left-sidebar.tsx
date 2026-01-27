import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { Settings, Files, CloudUpload, BookText, GitBranch, PenLine } from "lucide-react";
import { pb } from "@/lib/pocketbase";

export function LeftSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const data = {
    navMain: [
      {
        title: "Upload",
        url: "/upload",
        icon: CloudUpload,
      },
      {
        title: "Documents",
        url: "/documents",
        icon: Files,
      },
      {
        title: "Reader",
        url: "/reader",
        icon: BookText,
      },
      {
        title: "Writer",
        url: "/writer",
        icon: PenLine,
      },
      {
        title: "Graph",
        url: "/graph",
        icon: GitBranch,
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
      },
    ],
  };

  const user = pb.authStore.model;
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader></SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="flex-1"></div>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={user?.email} />
      </SidebarFooter>
    </Sidebar>
  );
}
