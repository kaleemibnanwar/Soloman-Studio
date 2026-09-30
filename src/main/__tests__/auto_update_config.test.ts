import { describe, expect, it } from "vitest";
import {
  ELECTRON_UPDATE_SERVICE_HOST,
  PUBLIC_RELEASE_REPOSITORY,
  getAutoUpdateConfig,
} from "../auto_update_config";

describe("auto-update configuration", () => {
  it("uses the public distribution repository and Electron's live update service", () => {
    const config = getAutoUpdateConfig("stable");
    expect(config.updateSource).toMatchObject({
      repo: PUBLIC_RELEASE_REPOSITORY,
      host: ELECTRON_UPDATE_SERVICE_HOST,
    });
    expect(config.channel).toBe("stable");
  });

  it("keeps beta channel selection explicit", () => {
    expect(getAutoUpdateConfig("beta").channel).toBe("beta");
  });
});
