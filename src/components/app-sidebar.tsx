import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {  Home, Settings, CreditCard } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { Link } from "@tanstack/react-router";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const data = {
    navMain: [
      {
        title: "Home",
        url: "/",
        icon: Home,
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
      },
      {
        title: "Subscription",
        url: "/subscription",
        icon: CreditCard,
      },
    ],
  };

  const user = pb.authStore.model;
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/" className="flex items-center">
              Home
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="flex-1"></div>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="text-xs text-muted-foreground pl-2">
          <a href="mailto:example@example.com" className="text-primary hover:underline">
            example@example.com
          </a>
        </div>
        <NavUser email={user?.email} />
      </SidebarFooter>
    </Sidebar>
  );
}
