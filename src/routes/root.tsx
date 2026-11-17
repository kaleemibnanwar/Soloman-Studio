import { createRootRoute, Outlet } from "@tanstack/react-router";
import Layout from "../app/layout";
import { useNotificationHandler } from "../hooks/useNotificationHandler";
import { usePlannerReminders } from "../hooks/usePlannerReminders";

export const rootRoute = createRootRoute({
  component: () => {
    useNotificationHandler();
    usePlannerReminders();
    return (
      <Layout>
        <Outlet />
      </Layout>
    );
  },
});
