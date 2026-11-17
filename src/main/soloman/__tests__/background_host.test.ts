import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SolomanHostStatus } from "../types";

const trayInstances: Array<{
  destroyed: boolean;
  menu: unknown;
  handlers: Map<string, () => void>;
}> = [];

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    setLoginItemSettings: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
  },
  Tray: class {
    destroyed = false;
    menu: unknown = null;
    handlers = new Map<string, () => void>();

    constructor() {
      trayInstances.push(this);
    }

    setToolTip() {}
    setContextMenu(menu: unknown) {
      this.menu = menu;
    }
    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));

vi.mock("electron-log", () => ({
  default: { scope: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

import { SolomanBackgroundHost } from "../background_host";

function status(overrides: Partial<SolomanHostStatus> = {}): SolomanHostStatus {
  return {
    enrolled: true,
    deviceId: "desktop-1",
    deviceName: "Desktop",
    cloudUrl: "https://example.test",
    isRelayConnected: true,
    activeGrantsCount: 1,
    pendingPairingsCount: 0,
    lastConnectedAt: null,
    lastError: null,
    accountEmail: "owner@example.test",
    autoTrustAccountDevices: true,
    ...overrides,
  };
}

describe("SolomanBackgroundHost", () => {
  beforeEach(() => trayInstances.splice(0));

  it("keeps an enrolled relay available from the tray without a renderer window", () => {
    const openStudio = vi.fn();
    const host = new SolomanBackgroundHost({
      icon: { resize: () => ({}) } as never,
      openStudio,
      quitStudio: vi.fn(),
    });

    host.sync(status());

    expect(host.isActive()).toBe(true);
    expect(trayInstances).toHaveLength(1);
    expect(trayInstances[0].menu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Mobile relay connected" })]),
    );
    trayInstances[0].handlers.get("click")?.();
    expect(openStudio).toHaveBeenCalledOnce();
  });

  it("reports reconnecting state and stops residency after logout", () => {
    const host = new SolomanBackgroundHost({
      icon: { resize: () => ({}) } as never,
      openStudio: vi.fn(),
      quitStudio: vi.fn(),
    });

    host.sync(status({ isRelayConnected: false }));
    expect(trayInstances[0].menu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Mobile relay reconnecting…" })]),
    );

    host.sync(status({ enrolled: false }));
    expect(host.isActive()).toBe(false);
    expect(trayInstances[0].destroyed).toBe(true);
  });
});
