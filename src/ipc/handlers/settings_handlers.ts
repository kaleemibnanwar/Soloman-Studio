import { createTypedHandler } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readEffectiveSettings } from "../../main/settings";
import { validateProviderApiKey } from "../services/provider_api_key_validation_service";
import { syncBrowserLimbBridge } from "../../main/browser_limb_manager";
import { getOctoLimbBridgeStatus } from "../../main/octolimb_bridge";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function installedBrowsers() {
  const home = os.homedir();
  const platform = process.platform;
  const linux = (names: string[]) => names.find((candidate) => fs.existsSync(candidate)) ?? null;
  const win = (relative: string) =>
    platform === "win32"
      ? ([process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]]
          .filter(Boolean)
          .map((root) => path.join(root!, relative))
          .find((candidate) => fs.existsSync(candidate)) ?? null)
      : null;
  const mac = (app: string) =>
    platform === "darwin" && fs.existsSync(`/Applications/${app}.app/Contents/MacOS/${app}`)
      ? `/Applications/${app}.app/Contents/MacOS/${app}`
      : null;
  const entries = [
    {
      id: "chrome",
      name: "Google Chrome",
      executablePath:
        platform === "linux"
          ? linux(["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"])
          : (win("Google/Chrome/Application/chrome.exe") ?? mac("Google Chrome")),
      profilePath:
        platform === "linux"
          ? path.join(home, ".config/google-chrome/Default")
          : platform === "darwin"
            ? path.join(home, "Library/Application Support/Google/Chrome/Default")
            : path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/User Data/Default"),
    },
    {
      id: "chromium",
      name: "Chromium",
      executablePath:
        platform === "linux" ? linux(["/usr/bin/chromium", "/usr/bin/chromium-browser"]) : null,
      profilePath: path.join(home, ".config/chromium/Default"),
    },
    {
      id: "brave",
      name: "Brave",
      executablePath:
        platform === "linux"
          ? linux(["/usr/bin/brave-browser", "/usr/bin/brave"])
          : (win("BraveSoftware/Brave-Browser/Application/brave.exe") ?? mac("Brave Browser")),
      profilePath: path.join(home, ".config/BraveSoftware/Brave-Browser/Default"),
    },
    {
      id: "edge",
      name: "Microsoft Edge",
      executablePath:
        platform === "linux"
          ? linux(["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"])
          : (win("Microsoft/Edge/Application/msedge.exe") ?? mac("Microsoft Edge")),
      profilePath: path.join(home, ".config/microsoft-edge/Default"),
    },
    {
      id: "opera",
      name: "Opera",
      executablePath: platform === "linux" ? linux(["/usr/bin/opera"]) : null,
      profilePath: path.join(home, ".config/opera/Default"),
    },
    {
      id: "firefox",
      name: "Firefox",
      executablePath:
        platform === "linux"
          ? linux(["/usr/bin/firefox"])
          : (mac("Firefox") ?? win("Mozilla Firefox/firefox.exe")),
      profilePath: path.join(home, ".mozilla/firefox"),
    },
    {
      id: "safari",
      name: "Safari",
      executablePath: null,
      profilePath: platform === "darwin" ? path.join(home, "Library/Safari") : null,
    },
  ];
  return entries.map((entry) => {
    const profileExists = entry.profilePath ? fs.existsSync(entry.profilePath) : false;
    const detected = Boolean(entry.executablePath || profileExists);
    const sessionImport: "embedded-profile" | "external-bridge" | "unsupported" =
      entry.id === "safari"
        ? "unsupported"
        : entry.id === "firefox"
          ? "external-bridge"
          : "embedded-profile";
    return {
      ...entry,
      profilePath: profileExists ? entry.profilePath : null,
      detected,
      sessionImport,
      note:
        sessionImport === "external-bridge"
          ? "Uses the optional external browser bridge so existing cookies stay in the browser profile."
          : "Safari session import is not available to embedded Chromium on this platform.",
    };
  });
}

export function registerSettingsHandlers() {
  // Note: Settings handlers intentionally use createTypedHandler without logging
  // to avoid logging sensitive data (API keys, tokens, etc.) from args/return values.

  createTypedHandler(settingsContracts.getUserSettings, async () => {
    return readEffectiveSettings();
  });

  createTypedHandler(settingsContracts.setUserSettings, async (_, settings) => {
    writeSettings(settings);
    const updated = await readEffectiveSettings();
    if (settings.enableBrowserLimbBridge !== undefined) {
      await syncBrowserLimbBridge(updated.enableBrowserLimbBridge !== false);
    }
    return updated;
  });

  createTypedHandler(settingsContracts.validateProviderApiKey, async (_, params) => {
    return validateProviderApiKey(params);
  });

  createTypedHandler(settingsContracts.getOctoLimbBridgeStatus, async () => {
    return getOctoLimbBridgeStatus();
  });

  createTypedHandler(settingsContracts.getInstalledBrowsers, async () => installedBrowsers());
}
