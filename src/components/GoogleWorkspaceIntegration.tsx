import { useEffect, useState } from "react";
import { CheckCircle2, HardDriveUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import type { McpServer } from "@/ipc/types";
import { GOOGLE_WORKSPACE_MCP_SLUGS } from "@/ipc/shared/local_mcp_catalog";
import { showError, showSuccess } from "@/lib/toast";

export function GoogleWorkspaceIntegration() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = async () => {
    const [account, allServers] = await Promise.all([
      ipc.googleDrive.getAccountStatus(),
      ipc.mcp.listServers(),
    ]);
    setEmail(account.connected ? account.email : null);
    setServers(
      allServers.filter(
        (s) =>
          s.catalogSlug &&
          (GOOGLE_WORKSPACE_MCP_SLUGS as readonly string[]).includes(s.catalogSlug),
      ),
    );
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await ipc.googleDrive.connect();
      await refresh();
      showSuccess("Google account connected");
    } catch (error) {
      showError(`Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await ipc.googleDrive.disconnect();
      await refresh();
      showSuccess("Google account disconnected");
    } catch (error) {
      showError(
        `Failed to disconnect: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!email) {
    return (
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Google Account</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Connect once to enable Drive sync and the Gmail, Calendar, Docs, Sheets, Slides, Chat,
            and Contacts MCP tools for the agent — no separate sign-in for each one.
          </p>
        </div>
        <Button size="sm" onClick={handleConnect} disabled={connecting}>
          {connecting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <HardDriveUpload className="mr-1.5 h-3.5 w-3.5" />
          )}
          Connect Google Account
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Google Account</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Connected as {email}</p>
        </div>
        <Button onClick={handleDisconnect} variant="destructive" size="sm" disabled={disconnecting}>
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
        {servers.map((server) => (
          <li
            key={server.id}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-muted-foreground"
          >
            {server.oauthConnected ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-600 dark:text-green-500" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
            )}
            <span className="truncate">{server.name}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Manage individual tools and permissions in Plugins.
      </p>
    </div>
  );
}
