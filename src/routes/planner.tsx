import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import PlannerPage from "@/pages/planner";
import { rootRoute } from "./root";

export const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planner",
  validateSearch: z.object({ appId: z.number().int().positive().optional() }),
  component: PlannerPage,
});
