import { createFileRoute, Outlet } from "@tanstack/react-router";
import { protectPage } from "@/lib/auth";
import Layout from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_app")({
  component: () => (
      <Layout>
        <Outlet />
        <Toaster position="bottom-right" />
      </Layout>
  ),
  beforeLoad: ({ location }) => {
    // All routes under /_app are protected
    protectPage(location);
  },
});
