import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

function useOctoLimbBridgeStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.octolimb.status,
    queryFn: () => ipc.settings.getOctoLimbBridgeStatus(),
    enabled,
    refetchInterval: 5_000,
  });
}

function statusLabel(
  isEnabled: boolean,
  status: ReturnType<typeof useOctoLimbBridgeStatus>["data"],
): string {
  if (!isEnabled) return "Stopped";
  if (!status) return "Checking status…";
  if (status.lastError) return `Error: ${status.lastError}`;
  if (status.extensionConnected) return "Extension connected";
  if (status.running) return "Waiting for the OctoLimb browser extension…";
  return "Starting…";
}

export function BrowserLimbBridgeSwitch() {
  const { settings, updateSettings } = useSettings();
  const isEnabled = settings?.enableBrowserLimbBridge === true;
  const { data: status } = useOctoLimbBridgeStatus(isEnabled);

  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2">
        <Switch
          id="enable-browser-limb-bridge"
          aria-label="Enable OctoLimb MCP Bridge"
          checked={isEnabled}
          onCheckedChange={(checked) => {
            updateSettings({
              enableBrowserLimbBridge: checked,
            });
          }}
        />
        <Label htmlFor="enable-browser-limb-bridge">Enable OctoLimb MCP Bridge</Label>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Optional compatibility mode for the external Chrome/OctoLimb extension. Studio's embedded
        browser automation is used by default and does not require this bridge.
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Status: {statusLabel(isEnabled, status)}
      </div>
    </div>
  );
}
