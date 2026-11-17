import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  Laptop,
  Lock,
  RefreshCw,
  Minus,
  Square,
  X,
  Globe,
} from "lucide-react";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showSuccess, showError } from "@/lib/toast";
import { solomanLogo } from "@/constants/branding";

export function SolomanAuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.soloman.status,
    queryFn: () => ipc.soloman.getStatus(),
    refetchInterval: 3_000,
  });

  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    authUrl: string;
  } | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [loginMode, setLoginMode] = useState<"browser" | "direct">("browser");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const isEnrolled = !!status?.enrolled;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Listen for push status events from main process (e.g. when loopback callback completes)
  useEffect(() => {
    const unsub = ipc.events.soloman.onStatusChanged((newStatus) => {
      if (newStatus.enrolled) {
        setActiveSession(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
      }
    });
    return () => {
      unsub();
    };
  }, [queryClient]);

  // Poll session while waiting for browser login
  useEffect(() => {
    if (!activeSession || isEnrolled) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const checkSession = async () => {
      try {
        setIsCheckingSession(true);
        const result = await ipc.soloman.checkLoginSession({
          sessionId: activeSession.sessionId,
        });

        if (result.completed) {
          showSuccess("Welcome! Logged in successfully.");
          setActiveSession(null);
          queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
        }
      } catch (err) {
        console.warn("Session check error:", err);
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
    pollTimerRef.current = setInterval(checkSession, 2_500);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activeSession, isEnrolled, queryClient]);

  const startLoginMutation = useMutation({
    mutationFn: async () => {
      return await ipc.soloman.startBrowserLogin({});
    },
    onSuccess: async (data) => {
      setActiveSession(data);
      try {
        await ipc.system.openExternalUrl(data.authUrl);
      } catch (err) {
        showError(`Could not open browser: ${(err as Error).message}`);
      }
    },
    onError: (err: Error) => {
      showError(`Login initialization failed: ${err.message}`);
    },
  });

  const directLoginMutation = useMutation({
    mutationFn: async () => {
      return await ipc.soloman.directLogin({
        username: username.trim(),
        password: password.trim(),
      });
    },
    onSuccess: () => {
      showSuccess("Welcome! Signed in successfully.");
      setActiveSession(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
    },
    onError: (err: Error) => {
      showError(`Sign in failed: ${err.message}`);
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <img src={solomanLogo} alt="Soloman Studio" className="w-12 h-12 animate-pulse" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Verifying Soloman authentication...
          </div>
        </div>
      </div>
    );
  }

  // If already logged in, grant full platform access
  if (isEnrolled) {
    return <>{children}</>;
  }

  // Not logged in: Platform Locked with Soloman Login Gate
  return (
    <div className="fixed inset-0 z-50 flex flex-col h-screen w-screen overflow-hidden bg-background select-none">
      {/* Draggable Title Bar */}
      <div className="h-[var(--layout-title-bar-offset)] w-full app-region-drag bg-(--sidebar) flex items-center justify-between px-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <img src={solomanLogo} alt="Soloman Studio" className="w-4 h-4 rounded" />
          <span className="text-xs font-semibold text-foreground/80">Soloman Studio</span>
        </div>

        <div className="flex items-center gap-1 no-app-region-drag">
          <button
            type="button"
            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => ipc.system.minimizeWindow()}
            aria-label="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => ipc.system.maximizeWindow()}
            aria-label="Maximize"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 hover:bg-destructive hover:text-destructive-foreground rounded text-muted-foreground transition-colors"
            onClick={() => ipc.system.closeWindow()}
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20 overflow-y-auto">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl shadow-black/5 text-card-foreground space-y-6">
          {/* Header branding */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="relative">
              <img
                src={solomanLogo}
                alt="Soloman Studio"
                className="w-16 h-16 rounded-2xl shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground p-1 rounded-full shadow-sm">
                <Lock className="w-3.5 h-3.5" />
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground pt-1">
              Sign In to Soloman
            </h2>
            <p className="text-xs text-muted-foreground max-w-sm">
              Soloman Studio requires an authenticated Soloman account to unlock and use the
              platform.
            </p>
          </div>

          {/* Browser Authentication State */}
          {activeSession ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Browser Login in Progress...
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Sign in through the opened browser tab. Studio will detect your session
                    automatically.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  className="w-full"
                  disabled={isCheckingSession}
                  onClick={async () => {
                    setIsCheckingSession(true);
                    try {
                      const result = await ipc.soloman.checkLoginSession({
                        sessionId: activeSession.sessionId,
                      });
                      if (result.completed) {
                        showSuccess("Signed in successfully!");
                        setActiveSession(null);
                        queryClient.invalidateQueries({ queryKey: queryKeys.soloman.all });
                      } else {
                        showError("Login not yet completed in the browser. Please approve first.");
                      }
                    } finally {
                      setIsCheckingSession(false);
                    }
                  }}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1.5 ${isCheckingSession ? "animate-spin" : ""}`}
                  />
                  Check Session Now
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => ipc.system.openExternalUrl(activeSession.authUrl)}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Re-open Browser
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() => setActiveSession(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Ready to sign in form */
            <div className="space-y-4">
              {/* Login mode selector tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-muted/50 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setLoginMode("browser")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-colors ${
                    loginMode === "browser"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Browser Auth
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode("direct")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-colors ${
                    loginMode === "direct"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Password
                </button>
              </div>

              {loginMode === "browser" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Studio will open your browser to log in on <strong>soloman.si</strong> and
                    receive your secure host token via local loopback.
                  </p>

                  <Button
                    size="lg"
                    className="w-full gap-2 font-medium"
                    disabled={startLoginMutation.isPending}
                    onClick={() => startLoginMutation.mutate()}
                  >
                    {startLoginMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    Log In with Soloman (Browser)
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!username || !password) return;
                    directLoginMutation.mutate();
                  }}
                  className="space-y-3"
                >
                  <div>
                    <Label htmlFor="auth-gate-username" className="text-xs font-medium">
                      Username or Email
                    </Label>
                    <Input
                      id="auth-gate-username"
                      placeholder="alex"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="text-xs mt-1"
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <Label htmlFor="auth-gate-password" className="text-xs font-medium">
                      Password
                    </Label>
                    <Input
                      id="auth-gate-password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="text-xs mt-1"
                      autoComplete="current-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2 font-medium"
                    disabled={directLoginMutation.isPending || !username || !password}
                  >
                    {directLoginMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    Sign In to Soloman
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* Footer Trust Invariants */}
          <div className="pt-2 border-t flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Zero-Knowledge E2EE
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Laptop className="w-3.5 h-3.5 text-primary" />
              Account Device Sync
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
