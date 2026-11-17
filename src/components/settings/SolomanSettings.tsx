import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, CheckCircle2, ShieldCheck, Globe, Loader2, Laptop } from "lucide-react";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/toast";

export function SolomanSettings() {
  const queryClient = useQueryClient();

  const { data: status, isLoading: isStatusLoading } = useQuery({
    queryKey: queryKeys.soloman.status,
    queryFn: () => ipc.soloman.getStatus(),
    refetchInterval: 5_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => ipc.soloman.logout(),
    onSuccess: () => {
      showSuccess("Logged out of Soloman. Platform locked.");
      queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
    },
    onError: (err: Error) => {
      showError(`Logout failed: ${err.message}`);
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => ipc.soloman.connectRelay(),
    onSuccess: () => {
      showSuccess("Connected to Soloman relay.");
      queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
    },
    onError: (err: Error) => {
      showError(`Connection failed: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => ipc.soloman.disconnectRelay(),
    onSuccess: () => {
      showSuccess("Disconnected from Soloman relay.");
      queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
    },
  });

  if (isStatusLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Soloman Host status...
      </div>
    );
  }

  const isEnrolled = !!status?.enrolled;
  const isConnected = !!status?.isRelayConnected;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Soloman Cloud Relay Host</h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              Zero-Knowledge E2EE
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active Soloman Desktop Host. Relays encrypted prompts from your authorized devices.
          </p>
        </div>

        {isEnrolled && (
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isConnected
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  isConnected ? "bg-green-600 dark:bg-green-400" : "bg-amber-600 dark:bg-amber-400"
                }`}
              />
              {isConnected ? "Relay Connected" : "Relay Disconnected"}
            </span>

            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                Connect
              </Button>
            )}
          </div>
        )}
      </div>

      {isEnrolled && (
        <div className="space-y-4">
          {/* Host identity card */}
          <div className="rounded-xl border p-5 bg-card text-card-foreground shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Connected to Soloman Cloud
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Your desktop host is active and authenticated under your account.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Log Out
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t">
              <div>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5" />
                  Host Device Name:
                </span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {status.deviceName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Device ID:</span>
                <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded mt-0.5 block w-fit">
                  {status.deviceId}
                </code>
              </div>
              <div>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Cloud Endpoint:
                </span>
                <span className="font-mono text-[11px] text-foreground mt-0.5 block">
                  {status.cloudUrl}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Account:</span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {status.accountEmail || "Active Soloman Account"}
                </span>
              </div>
            </div>
          </div>

          {/* Account-level pairing info */}
          <div className="rounded-xl border p-4 bg-muted/20 text-xs text-muted-foreground flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground text-xs block">
                Automatic Account Trust
              </span>
              <p className="text-[11px]">
                Your mobile apps and controllers logged into this same Soloman account are
                automatically authorized. No pairing codes or manual confirmation steps are needed.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
