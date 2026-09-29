import { useEffect, useState } from "react";
import { CloudOff, HardDriveUpload, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import type { DriveSyncSummary } from "@/ipc/types";

interface GoogleDriveSyncPanelProps {
  appId: number;
}

function summarizeSync(summary: {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
}): string {
  const parts: string[] = [];
  if (summary.uploaded) parts.push(`${summary.uploaded} uploaded`);
  if (summary.downloaded) parts.push(`${summary.downloaded} downloaded`);
  if (summary.deletedLocal) parts.push(`${summary.deletedLocal} removed locally`);
  if (summary.deletedRemote) parts.push(`${summary.deletedRemote} removed on Drive`);
  if (summary.conflicts) parts.push(`${summary.conflicts} conflicts kept as copies`);
  return parts.length > 0 ? parts.join(", ") : "Already up to date";
}

export function GoogleDriveSyncPanel({ appId }: GoogleDriveSyncPanelProps) {
  const [accountEmail, setAccountEmail] = useState<string | null | undefined>(undefined);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    const [account, status] = await Promise.all([
      ipc.googleDrive.getAccountStatus(),
      ipc.googleDrive.getProjectSyncStatus({ appId }),
    ]);
    setAccountEmail(account.connected ? account.email : null);
    setSyncEnabled(status.enabled);
    setLastSyncedAt(status.lastSyncedAt);
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await ipc.googleDrive.connect();
      await refresh();
      showSuccess("Google Drive connected");
    } catch (error) {
      showError(
        `Failed to connect Google Drive: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      if (checked) {
        const summary: DriveSyncSummary = await ipc.googleDrive.enableProjectSync({ appId });
        showSuccess(`Drive sync enabled — ${summarizeSync(summary)}`);
      } else {
        await ipc.googleDrive.disableProjectSync({ appId });
        showSuccess("Drive sync disabled (files stay on Drive)");
      }
      await refresh();
    } catch (error) {
      showError(
        `Failed to update Drive sync: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setToggling(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const summary = await ipc.googleDrive.syncProjectNow({ appId });
      showSuccess(summarizeSync(summary));
      await refresh();
    } catch (error) {
      showError(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Drive status…
      </div>
    );
  }

  if (!accountEmail) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudOff className="h-4 w-4" />
          Connect Google Drive to sync this project's files
        </div>
        <Button size="sm" onClick={handleConnect} disabled={connecting}>
          {connecting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <HardDriveUpload className="mr-1.5 h-3.5 w-3.5" />
          )}
          Connect Google Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Switch
            id={`drive-sync-${appId}`}
            checked={syncEnabled}
            disabled={toggling}
            onCheckedChange={handleToggle}
          />
          <Label htmlFor={`drive-sync-${appId}`}>Sync with Google Drive</Label>
        </div>
        {syncEnabled && (
          <Button size="sm" variant="outline" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync now
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Connected as {accountEmail}
        {syncEnabled &&
          (lastSyncedAt ? ` · Last synced ${lastSyncedAt.toLocaleString()}` : " · Not yet synced")}
      </p>
    </div>
  );
}
