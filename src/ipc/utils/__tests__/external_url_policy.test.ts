import { describe, expect, it } from "vitest";
import { shouldSuppressExternalUrlOpen } from "../external_url_policy";

describe("shouldSuppressExternalUrlOpen", () => {
  it("suppresses browser windows during an active packaged E2E run", () => {
    expect(
      shouldSuppressExternalUrlOpen({
        isTestBuild: true,
        e2ePortBlockIndex: "0",
      }),
    ).toBe(true);
  });

  it("allows browser windows when an E2E package is launched manually", () => {
    expect(
      shouldSuppressExternalUrlOpen({
        isTestBuild: true,
        e2ePortBlockIndex: undefined,
      }),
    ).toBe(false);
  });

  it("allows browser windows in normal builds", () => {
    expect(
      shouldSuppressExternalUrlOpen({
        isTestBuild: false,
        e2ePortBlockIndex: "0",
      }),
    ).toBe(false);
  });
});
