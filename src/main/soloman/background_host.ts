import { app, Menu, Tray, type NativeImage } from "electron";
import log from "electron-log";
import type { SolomanHostStatus } from "./types";

const logger = log.scope("soloman-background-host");

export interface SolomanBackgroundHostOptions {
  icon: NativeImage;
  openStudio: () => void;
  quitStudio: () => void;
}

/** Owns the process-level UI that keeps the mobile relay alive without a window. */
export class SolomanBackgroundHost {
  private tray: Tray | null = null;
  private status: SolomanHostStatus | null = null;
  private launchAtLoginEnabled: boolean | null = null;

  constructor(private readonly options: SolomanBackgroundHostOptions) {}

  public sync(status: SolomanHostStatus): void {
    this.status = status;
    if (!status.enrolled) {
      this.stop();
      this.syncLaunchAtLogin(false);
      return;
    }

    if (!this.tray) {
      this.tray = new Tray(this.options.icon.resize({ width: 18, height: 18 }));
      this.tray.setToolTip("Soloman Studio mobile host");
      this.tray.on("click", this.options.openStudio);
      this.tray.on("double-click", this.options.openStudio);
      logger.info("Mobile host is running in the background");
    }

    this.rebuildMenu();
    this.syncLaunchAtLogin(true);
  }

  public isActive(): boolean {
    return this.tray !== null && this.status?.enrolled === true;
  }

  public stop(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private rebuildMenu(): void {
    if (!this.tray || !this.status) return;
    const relayLabel = this.status.isRelayConnected
      ? "Mobile relay connected"
      : "Mobile relay reconnecting…";
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: relayLabel, enabled: false },
        { type: "separator" },
        { label: "Open Soloman Studio", click: this.options.openStudio },
        { label: "Quit Soloman Studio", click: this.options.quitStudio },
      ]),
    );
  }

  private syncLaunchAtLogin(enabled: boolean): void {
    if (!app.isPackaged || !["darwin", "win32"].includes(process.platform)) return;
    if (this.launchAtLoginEnabled === enabled) return;
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? ["--background"] : [],
      });
      this.launchAtLoginEnabled = enabled;
    } catch (error) {
      logger.warn("Could not update launch-at-login setting", error);
    }
  }
}
