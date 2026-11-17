import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apps } from "@/db/schema";
import { setupHandlerTestHarness, type HandlerTestHarness } from "@/testing/handler_test_harness";
import type { PlannerTask } from "../../types/planner";
import { registerPlannerHandlers } from "../planner_handlers";

describe("planner handlers", () => {
  let harness: HandlerTestHarness;
  let appId: number;

  beforeEach(() => {
    harness = setupHandlerTestHarness();
    registerPlannerHandlers();
    appId = harness.db
      .insert(apps)
      .values({ name: "Planner test", path: "planner-test" })
      .returning()
      .get().id;
  });

  afterEach(() => harness.dispose());

  it("creates, updates, moves, and deletes project tasks", async () => {
    const dueAt = new Date("2027-01-02T15:30:00.000Z");
    const created = await harness.invokeHandler<PlannerTask>("planner:create-task", {
      appId,
      title: "Prepare release",
      description: "Verify the production checklist",
      status: "todo",
      priority: "high",
      dueAt,
      botName: "QA Sentinel",
    });

    expect(created).toMatchObject({
      appId,
      title: "Prepare release",
      status: "todo",
      priority: "high",
      botName: "QA Sentinel",
    });
    expect(created.dueAt).toEqual(dueAt);

    const moved = await harness.invokeHandler<PlannerTask>("planner:move-task", {
      taskId: created.id,
      status: "in_progress",
      position: 0,
    });
    expect(moved.status).toBe("in_progress");

    const updated = await harness.invokeHandler<PlannerTask>("planner:update-task", {
      taskId: created.id,
      title: "Prepare public release",
    });
    expect(updated.title).toBe("Prepare public release");

    const listed = await harness.invokeHandler<PlannerTask[]>("planner:list-tasks", { appId });
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("in_progress");

    await harness.invokeHandler("planner:delete-task", created.id);
    expect(await harness.invokeHandler<PlannerTask[]>("planner:list-tasks", { appId })).toEqual([]);
  });

  it("creates an unassigned task and can assign it to a project later", async () => {
    const created = await harness.invokeHandler<PlannerTask>("planner:create-task", {
      appId: null,
      title: "Review inbox",
      description: "",
      status: "backlog",
      priority: "medium",
      dueAt: null,
    });
    expect(created.appId).toBeNull();

    const assigned = await harness.invokeHandler<PlannerTask>("planner:update-task", {
      taskId: created.id,
      appId,
    });
    expect(assigned.appId).toBe(appId);
  });
});
