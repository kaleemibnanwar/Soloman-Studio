import { UpdateSourceType, type IElectronUpdateServiceSource } from "update-electron-app";
import type { ReleaseChannel } from "@/lib/schemas";

export const PUBLIC_RELEASE_REPOSITORY = "kaleemibnanwar/OctopusStudio";
export const ELECTRON_UPDATE_SERVICE_HOST = "https://update.electronjs.org";

export function getAutoUpdateConfig(releaseChannel: ReleaseChannel) {
  const updateSource: IElectronUpdateServiceSource = {
    type: UpdateSourceType.ElectronPublicUpdateService,
    repo: PUBLIC_RELEASE_REPOSITORY,
    host: ELECTRON_UPDATE_SERVICE_HOST,
  };
  return {
    updateInterval: "60 minutes" as const,
    updateSource,
    channel: releaseChannel === "beta" ? "beta" : "stable",
  };
}
