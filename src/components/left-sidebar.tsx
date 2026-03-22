import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { Files, CloudUpload, BookText, GitBranch, MessageSquare } from "lucide-react";
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
        title: "Library",
        url: "/library",
        icon: Files,
      },
      {
        title: "Workspace",
        url: "/workspace",
        icon: BookText,
      },
      {
        title: "Chat",
        url: "/chat",
        icon: MessageSquare,
      },
      {
        title: "Graph",
        url: "/graph",
        icon: GitBranch,
      },
    ],
    navSecondary: [],
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
