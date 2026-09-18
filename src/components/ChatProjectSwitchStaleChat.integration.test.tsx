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

describe("switching chat projects while a different chat is already open (integration)", () => {
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

  it("shows the clicked project's own chat list instead of auto-jumping back into the previously open chat", async () => {
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

    // A regular coding app with its own open chat — the "current open chat
    // is not from [the] chat project" condition that was breaking the
    // project switch.
    const [regularApp] = await harness.db
      .insert(apps)
      .values({ name: "some-coding-app", type: "app", path: "some-coding-app" })
      .returning();
    const [regularChat] = await harness.db
      .insert(chats)
      .values({ appId: regularApp.id, title: "Regular app chat" })
      .returning();

    const [namedProject] = await harness.db
      .insert(apps)
      .values({ name: "Research notes", type: "chat", path: "" })
      .returning();
    await harness.db
      .insert(chats)
      .values({ appId: namedProject.id, title: "Kickoff notes" });

    window.localStorage.clear();
    // Start with the regular app's chat already open.
    harness.mountSurface({
      route: "/chat",
      appId: regularApp.id,
      search: { id: regularChat.id, appId: regularApp.id },
      withAppSidebar: true,
      withRealChatPage: true,
    });
    expect(harness.currentLocation().search.id).toBe(regularChat.id);

    const chatsRailButton = await screen.findByRole("button", {
      name: "Chats",
    });
    fireEvent.mouseEnter(chatsRailButton);
    fireEvent.click(chatsRailButton);

    const projectButton = await screen.findByRole("button", {
      name: "Research notes",
    });
    fireEvent.click(projectButton);

    // The project's own chat list must show...
    await screen.findByText("Kickoff notes");
    expect(
      screen.queryByRole("button", { name: "Research notes" }),
    ).toBeNull();
    expect(Number(harness.currentLocation().search.appId)).toBe(
      namedProject.id,
    );
    // ...without auto-jumping into any specific chat (chat projects never
    // auto-select — the user picks from the list or starts a new one).
    expect(harness.currentLocation().search.id).toBeUndefined();
  }, 60_000);
});
