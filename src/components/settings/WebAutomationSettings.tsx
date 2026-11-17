import { useEffect, useState } from "react";
import { Globe2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import type { GetInstalledBrowsersOutput } from "@/ipc/types/settings";

export function WebAutomationSettings() {
  const { settings, updateSettings } = useSettings();
  const [browsers, setBrowsers] = useState<GetInstalledBrowsersOutput>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setBrowsers(await ipc.settings.getInstalledBrowsers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = settings?.webAutomationBrowser ?? "auto";
  const external = settings?.webAutomationSessionSource === "external";

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Globe2 className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Web Automation</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose the browser session used for live website tasks and recipe replay.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Detect
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="web-automation-browser">Preferred browser</Label>
          <select
            id="web-automation-browser"
            value={selected}
            onChange={(event) =>
              (() => {
                const value = event.target.value as typeof selected;
                const detected = browsers.find((browser) => browser.id === value);
                updateSettings({
                  webAutomationBrowser: value,
                  ...(detected?.profilePath
                    ? { webAutomationProfilePath: detected.profilePath }
                    : {}),
                  ...(detected?.executablePath
                    ? { webAutomationExecutablePath: detected.executablePath }
                    : {}),
                });
              })()
            }
            className="h-9 w-full rounded-md border bg-background px-2 text-xs"
          >
            <option value="auto">Automatic</option>
            {browsers.map((browser) => (
              <option key={browser.id} value={browser.id} disabled={!browser.detected}>
                {browser.name}
                {browser.detected ? "" : " (not detected)"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            id="web-automation-external"
            checked={external}
            onCheckedChange={(checked) =>
              updateSettings({
                webAutomationSessionSource: checked ? "external" : "embedded",
                enableBrowserLimbBridge: checked,
              })
            }
          />
          <Label htmlFor="web-automation-external">Use external browser session</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="web-automation-executable">Browser executable (optional)</Label>
        <input
          id="web-automation-executable"
          value={settings?.webAutomationExecutablePath ?? ""}
          onChange={(event) => updateSettings({ webAutomationExecutablePath: event.target.value })}
          placeholder="/usr/bin/google-chrome or C:\\…\\chrome.exe"
          className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          External sessions can access sites where you are signed in. Enable this only for trusted
          automation tasks. Embedded mode is isolated and remains the default.
        </span>
      </div>

      <div className="space-y-1">
        {browsers
          .filter((browser) => browser.detected)
          .map((browser) => (
            <div key={browser.id} className="flex items-center justify-between text-[11px]">
              <span className="min-w-0 font-medium">{browser.name}</span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-muted-foreground">
                  {browser.profilePath ?? browser.executablePath ?? "Detected"}
                </span>
              </div>
            </div>
          ))}
        {browsers.every((browser) => !browser.detected) && (
          <p className="text-[11px] text-muted-foreground">
            No supported installed browser detected.
          </p>
        )}
      </div>
    </div>
  );
}
