import { beforeEach, describe, expect, it, vi } from "vitest";

const clarity = vi.hoisted(() => ({
  init: vi.fn(),
  consent: vi.fn(),
  identify: vi.fn(),
  event: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@microsoft/clarity", () => ({ default: clarity }));

import {
  captureTelemetryEvent,
  disableTelemetry,
  identifyTelemetryUser,
  initTelemetry,
} from "../telemetry";

describe("Clarity telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disableTelemetry();
    vi.clearAllMocks();
  });

  it("initializes once and resumes consent when re-enabled", () => {
    initTelemetry();
    initTelemetry();

    expect(clarity.init).toHaveBeenCalledTimes(1);
    expect(clarity.consent).toHaveBeenCalledWith(true);
  });

  it("does not capture or identify after consent is withdrawn", () => {
    initTelemetry();
    disableTelemetry();
    captureTelemetryEvent("hidden-event");
    identifyTelemetryUser("hidden-user");

    expect(clarity.consent).toHaveBeenLastCalledWith(false);
    expect(clarity.event).not.toHaveBeenCalled();
    expect(clarity.identify).not.toHaveBeenCalled();
  });
});
