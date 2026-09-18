import { describe, expect, it } from "vitest";
import {
  getRouteSidebarPanel,
  getSelectedSidebarPanel,
  isSidebarItemActive,
  shouldShowSelectedAppChatList,
} from "@/components/app-sidebar-state";

describe("app sidebar state", () => {
  it("routes chat, home, apps, app-details, and tasks into the merged Apps panel", () => {
    expect(getRouteSidebarPanel("/chat")).toBe("Apps");
    expect(getRouteSidebarPanel("/")).toBe("Apps");
    expect(getRouteSidebarPanel("/apps")).toBe("Apps");
    expect(getRouteSidebarPanel("/app-details")).toBe("Apps");
    expect(getRouteSidebarPanel("/tasks")).toBe("Apps");
  });

  it("selects Apps for app routes", () => {
    expect(getSelectedSidebarPanel({ pathname: "/app-details" })).toBe("Apps");
    expect(getSelectedSidebarPanel({ pathname: "/apps" })).toBe("Apps");
  });

  it("treats Templates as part of the Library panel, since it's a tab there now", () => {
    expect(getRouteSidebarPanel("/templates")).toBe("Library");
    expect(isSidebarItemActive({ title: "Library", pathname: "/templates" })).toBe(
      true,
    );
  });

  it("marks Settings and Library active by route prefix", () => {
    expect(isSidebarItemActive({ title: "Settings", pathname: "/settings" })).toBe(
      true,
    );
    expect(isSidebarItemActive({ title: "Library", pathname: "/library" })).toBe(
      true,
    );
  });

  it("shows the selected app chat list only inside Apps with an app selected", () => {
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/app-details",
      }),
    ).toBe(true);
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: null,
        pathname: "/app-details",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Settings",
        selectedAppId: 1,
        pathname: "/app-details",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/apps",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/chat",
      }),
    ).toBe(true);
  });

  it("shows the chat list for a specific (non-default) chat project", () => {
    // Regression test: clicking a chat project in the merged AppList selects
    // it and navigates to /chat. The sidebar must switch from the merged
    // list to that project's own chat list.
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/chat",
        defaultChatProjectId: 99,
      }),
    ).toBe(true);
  });

  it("never drills into a nested chat list for the default project — its conversations are already flat in the merged list", () => {
    // Regression test: the default (projectless) bucket's conversations are
    // listed directly inside the merged AppList. Selecting one there must
    // keep the sidebar on that flat list — not switch to a second, redundant
    // nested chat-list view the way a real app/chat project does.
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 99,
        pathname: "/chat",
        defaultChatProjectId: 99,
      }),
    ).toBe(false);
    // A real project (not the default bucket) still drills in as before.
    expect(
      shouldShowSelectedAppChatList({
        selectedPanel: "Apps",
        selectedAppId: 1,
        pathname: "/chat",
        defaultChatProjectId: 99,
      }),
    ).toBe(true);
  });
});
