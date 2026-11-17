import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getDefaultOctopusStudioAppsDirectory, isLegacyOctopusStudioAppsFolder } from "../paths";

describe("Studio project paths", () => {
  it("puts new projects directly under the home directory, not Documents", () => {
    expect(getDefaultOctopusStudioAppsDirectory()).toBe(
      path.join(os.homedir(), "Soloman Studio", "Projects", "Apps"),
    );
  });

  it("treats old Octopus and Documents defaults as legacy folders", () => {
    expect(isLegacyOctopusStudioAppsFolder(path.join(os.homedir(), "octopusstudio-projects"))).toBe(
      true,
    );
    expect(
      isLegacyOctopusStudioAppsFolder(
        path.join(os.homedir(), "Documents", "Soloman Studio", "Projects", "Apps"),
      ),
    ).toBe(true);
    expect(isLegacyOctopusStudioAppsFolder(path.join(os.homedir(), "Projects", "Apps"))).toBe(
      false,
    );
  });
});
