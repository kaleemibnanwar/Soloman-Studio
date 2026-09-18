import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { apps, chats } from "@/db/schema";
import {
  setupHybridChatHarness,
  type HybridChatHarness,
} from "@/testing/hybrid_chat_harness";
import { h } from "@/testing/hybrid.setup";

// react-resizable-panels' size measurement doesn't work under happy-dom, which
// crashes real <ChatPage> before its own logic runs. Stub it with trivial
// passthroughs so ChatPage's actual state/effects (what's under test here)
// still run for real.
vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div />,
}));

describe("chat-project picker vs. project chat list (integration)", () => {
  let harness: HybridChatHarness;

  beforeAll(async () => {
    harness = await setupHybridChatHarness({
      electronMock: h,
      settings: { isTestMode: true },
    });
  }, 60_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it("the back/view-all button returns to the project picker on the first click", async () => {
    const [defaultProject] = await harness.db
      .insert(apps)
      .values({
        name: "My Quick Chats",
        type: "chat",
        path: "",
        isDefaultChatProject: true,
      })
      .returning();
    await harness.db
      .insert(chats)
      .values({ appId: defaultProject.id, title: "Quick chat" });

    const [namedProject] = await harness.db
      .insert(apps)
      .values({ name: "Research notes", type: "chat", path: "" })
      .returning();
    await harness.db
      .insert(chats)
      .values({ appId: namedProject.id, title: "Kickoff notes" });

    window.localStorage.clear();
    harness.mountSurface({
      route: "/",
      withAppSidebar: true,
      withRealChatPage: true,
    });

    const chatsRailButton = await screen.findByRole("button", {
      name: "Chats",
    });
    fireEvent.mouseEnter(chatsRailButton);
    fireEvent.click(chatsRailButton);

    const projectButton = await screen.findByRole("button", {
      name: "Research notes",
    });
    fireEvent.click(projectButton);
    await screen.findByText("Kickoff notes");

    const backButton = await screen.findByTestId("view-all-apps-button");
    fireEvent.click(backButton);

    await screen.findByText("Chat Projects");
    expect(
      screen.queryByRole("button", { name: "Research notes" }),
    ).not.toBeNull();
    expect(screen.queryByText("Kickoff notes")).toBeNull();
  }, 60_000);

  it("clicking the default project's own row from within the picker opens its chat list, not the picker again", async () => {
    const defaultProject = await harness.db.query.apps.findFirst({
      where: (a, { eq }) => eq(a.isDefaultChatProject, true),
    });
    if (!defaultProject) {
      throw new Error("expected a default project to already exist");
    }
    await harness.db
      .insert(chats)
      .values({ appId: defaultProject.id, title: "Default chat item" });

    const [namedProject] = await harness.db
      .insert(apps)
      .values({ name: "Other Project", type: "chat", path: "" })
      .returning();
    await harness.db
      .insert(chats)
      .values({ appId: namedProject.id, title: "Other project chat" });

    window.localStorage.clear();
    harness.mountSurface({
      route: "/",
      withAppSidebar: true,
      withRealChatPage: true,
    });

    const chatsRailButton = await screen.findByRole("button", {
      name: "Chats",
    });
    fireEvent.mouseEnter(chatsRailButton);
    fireEvent.click(chatsRailButton);

    // Go into a different project first, so selectedAppId starts off !=
    // the default project's id.
    const otherButton = await screen.findByRole("button", {
      name: "Other Project",
    });
    fireEvent.click(otherButton);
    await screen.findByText("Other project chat");

    // Back to the picker, then click the default project's own row — this
    // used to conflate "selectedAppId === defaultChatProjectId" with
    // "picker is open" and get stuck showing the picker again.
    const backButton = await screen.findByTestId("view-all-apps-button");
    fireEvent.click(backButton);
    await screen.findByText("Chat Projects");

    const defaultRow = await screen.findByRole("button", {
      name: "My Quick Chats",
    });
    fireEvent.click(defaultRow);

    await screen.findByText("Default chat item");
    expect(screen.queryByText("Chat Projects")).toBeNull();
  }, 60_000);
});
