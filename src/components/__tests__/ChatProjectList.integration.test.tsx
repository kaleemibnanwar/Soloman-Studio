import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { apps, chats } from "@/db/schema";
import { setupHybridChatHarness, type HybridChatHarness } from "@/testing/hybrid_chat_harness";
import { h } from "@/testing/hybrid.setup";

// react-resizable-panels' size measurement doesn't work under happy-dom (no
// real layout engine / ResizeObserver), which crashes real <ChatPage> with
// "Previous layout not found for panel index -1" before any of its own logic
// runs. Stub it with trivial passthroughs so ChatPage's actual state/effects
// (the thing under test here) still run for real.
vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div />,
}));

describe("AppSidebar chat-project switching (integration)", () => {
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

  it("switches the sidebar to a clicked chat project's chat history", async () => {
    // Default chat project ("Chats" rail entry point), the way
    // ensureDefaultChatProject seeds it at startup, holding a quick chat
    // unrelated to the named project below. Named "My Quick Chats" (not the
    // literal "Chats") so its row's accessible name doesn't collide with the
    // "Chats" rail button's aria-label.
    const [defaultProject] = await harness.db
      .insert(apps)
      .values({
        name: "My Quick Chats",
        type: "chat",
        path: "",
        isDefaultChatProject: true,
      })
      .returning();
    await harness.db.insert(chats).values({
      appId: defaultProject.id,
      title: "Quick chat",
    });

    // A second, named chat project with its own chat history — clicking it
    // in the project list is the interaction reported broken.
    const [namedProject] = await harness.db
      .insert(apps)
      .values({
        name: "Research notes",
        type: "chat",
        path: "",
      })
      .returning();
    await harness.db.insert(chats).values({
      appId: namedProject.id,
      title: "Kickoff notes",
    });

    window.localStorage.clear();
    harness.mountSurface({
      route: "/",
      withAppSidebar: true,
      withRealChatPage: true,
    });

    // Hover-expand the sidebar the way a real user does (SidebarProvider
    // starts collapsed), then click the "Chats" rail entry.
    const chatsRailButton = await screen.findByRole("button", {
      name: "Chats",
    });
    fireEvent.mouseEnter(chatsRailButton);
    fireEvent.click(chatsRailButton);

    // The project list should now be showing both projects.
    const projectButton = await screen.findByRole("button", {
      name: "Research notes",
    });
    expect(screen.queryByText("Quick chat")).toBeNull();

    fireEvent.click(projectButton);

    // Poll observable DOM content over a full second to catch a glitch/
    // bounce-back — the sidebar flashing to the chat list and then reverting
    // to the project list — not just the eventually-settled value.
    let sawChatList = false;
    let revertedAfterShowingChatList = false;
    for (let i = 0; i < 20; i++) {
      const projectListShowing = screen.queryByRole("button", { name: "Research notes" }) !== null;
      const chatListShowing = screen.queryByText("Kickoff notes") !== null;
      if (chatListShowing) sawChatList = true;
      if (sawChatList && projectListShowing) {
        revertedAfterShowingChatList = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(revertedAfterShowingChatList).toBe(false);

    // ...and it must actually have switched (not just never reverted because
    // it never switched in the first place).
    await waitFor(() => {
      expect(screen.getByText("Kickoff notes")).toBeTruthy();
    });
    expect(screen.queryByText("Quick chat")).toBeNull();
    expect(screen.queryByRole("button", { name: "Research notes" })).toBeNull();

    expect(Number(harness.currentLocation().search.appId)).toBe(namedProject.id);
  }, 60_000);
});
