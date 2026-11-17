import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock3,
  Globe2,
  Home,
  LockKeyhole,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { ipc } from "@/ipc/types";
import { useSettings } from "@/hooks/useSettings";
import type { BrowserAutomationPayload, BrowserChangedPayload } from "@/ipc/types/browser";

type BrowserState = {
  sessionId: string;
  url: string;
  title: string;
  loading: boolean;
};

type BrowserVisit = {
  url: string;
  title: string;
  visitedAt: number;
};

const HISTORY_STORAGE_KEY = "soloman.browser.history";
const HOME_URL = "https://www.google.com";
const SUGGESTED_SITES: BrowserVisit[] = [
  { url: HOME_URL, title: "Google", visitedAt: 0 },
  { url: "https://github.com", title: "GitHub", visitedAt: 0 },
  { url: "https://stackoverflow.com", title: "Stack Overflow", visitedAt: 0 },
  { url: "https://reddit.com", title: "Reddit", visitedAt: 0 },
];

interface BrowserAutomationPanelProps {
  onClose: () => void;
}

function urlForAutomation(event: BrowserAutomationPayload): string | undefined {
  if (event.url) return event.url;
  const candidate = event.args.url;
  if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  if (event.tool === "search_google" && typeof event.args.query === "string") {
    return `https://www.google.com/search?q=${encodeURIComponent(event.args.query)}`;
  }
  return undefined;
}

function readBrowserHistory(): BrowserVisit[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is BrowserVisit =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.url === "string" &&
        typeof entry.title === "string" &&
        typeof entry.visitedAt === "number",
    );
  } catch {
    return [];
  }
}

function toNavigableUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function displayHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Search or enter address";
  }
}

export function BrowserAutomationPanel({ onClose }: BrowserAutomationPanelProps) {
  const { settings } = useSettings();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [address, setAddress] = useState("https://www.google.com");
  const [history, setHistory] = useState<BrowserVisit[]>([]);
  const [addressFocused, setAddressFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [task, setTask] = useState("Waiting for the browser task…");
  const [running, setRunning] = useState(false);
  const [mappedElements, setMappedElements] = useState<BrowserAutomationPayload["elements"]>([]);

  const suggestions = useMemo(() => {
    const query = address.trim().toLowerCase();
    const recent = history.filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.url === entry.url) === index,
    );
    const pool = [...recent, ...SUGGESTED_SITES].filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.url === entry.url) === index,
    );
    return query
      ? pool.filter(
          (entry) =>
            entry.url.toLowerCase().includes(query) || entry.title.toLowerCase().includes(query),
        )
      : pool.slice(0, 6);
  }, [address, history]);

  const recordVisit = useCallback((url: string, title = "") => {
    const visit = { url, title: title || displayHost(url), visitedAt: Date.now() };
    setHistory((current) => {
      const next = [visit, ...current.filter((entry) => entry.url !== url)].slice(0, 30);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // History is a convenience and should never block navigation.
      }
      return next;
    });
  }, []);

  const syncBounds = useCallback(() => {
    if (!browser || !surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    void ipc.browser.setBounds({
      sessionId: browser.sessionId,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }, [browser]);

  const navigate = useCallback(
    async (url: string) => {
      if (!browser) return;
      const navigableUrl = toNavigableUrl(url);
      try {
        const result = await ipc.browser.runAction({
          sessionId: browser.sessionId,
          action: { type: "navigate", url: navigableUrl },
        });
        const nextUrl = result.url || navigableUrl;
        setAddress(nextUrl);
        recordVisit(nextUrl);
        setAddressFocused(false);
      } catch (error) {
        setTask(error instanceof Error ? error.message : String(error));
      }
    },
    [browser, recordVisit],
  );

  useEffect(() => {
    setHistory(readBrowserHistory());
  }, []);

  useEffect(() => {
    void ipc.browser
      .createSession({ profileId: "work" })
      .then((result) => {
        setBrowser({
          sessionId: result.sessionId,
          url: "https://www.google.com",
          title: "Browser automation",
          loading: true,
        });
      })
      .catch((error) => setTask(error instanceof Error ? error.message : String(error)));
  }, [settings?.webAutomationProfilePath]);

  useEffect(() => {
    const unsubscribe = ipc.events.browser.onChanged((event: BrowserChangedPayload) => {
      setBrowser((current) =>
        current && current.sessionId === event.sessionId ? { ...current, ...event } : current,
      );
      if (event.url) {
        setAddress(event.url);
        recordVisit(event.url, event.title);
      }
    });
    const frame = requestAnimationFrame(syncBounds);
    const resize = () => syncBounds();
    window.addEventListener("resize", resize);
    const observer = surfaceRef.current ? new ResizeObserver(() => syncBounds()) : null;
    if (observer && surfaceRef.current) observer.observe(surfaceRef.current);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", resize);
    visualViewport?.addEventListener("scroll", resize);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("scroll", resize);
      observer?.disconnect();
    };
  }, [recordVisit, syncBounds]);

  useEffect(() => {
    if (!browser) return;
    void ipc.browser.setVisible({ sessionId: browser.sessionId, visible: true }).catch(() => {});
    const frame = requestAnimationFrame(syncBounds);
    return () => {
      cancelAnimationFrame(frame);
      void ipc.browser.setVisible({ sessionId: browser.sessionId, visible: false }).catch(() => {});
    };
  }, [browser, syncBounds]);

  useEffect(() => {
    const unsubscribe = ipc.events.browser.onAutomation((event: BrowserAutomationPayload) => {
      const target = urlForAutomation(event);
      setRunning(event.phase === "started");
      if (event.phase === "started") setTask(`Running ${event.tool.replaceAll("_", " ")}…`);
      if (event.phase === "completed") setTask(`${event.tool.replaceAll("_", " ")} completed`);
      if (event.phase === "failed") setTask(event.message ?? `${event.tool} failed`);
      if (event.elements) setMappedElements(event.elements);
      if (target && event.phase !== "failed") {
        setAddress(target);
        void navigate(target);
      }
    });
    return unsubscribe;
  }, [navigate]);

  const run = async (action: Parameters<typeof ipc.browser.runAction>[0]["action"]) => {
    if (!browser) return;
    try {
      const result = await ipc.browser.runAction({ sessionId: browser.sessionId, action });
      const nextUrl = result.url || address;
      setAddress(nextUrl);
      if (nextUrl) recordVisit(nextUrl, browser.title);
    } catch (error) {
      setTask(error instanceof Error ? error.message : String(error));
    }
  };

  const submitAddress = (value = address) => {
    const target = value.trim();
    if (!target) return;
    void navigate(target);
  };

  const goHome = () => submitAddress(HOME_URL);

  const close = async () => {
    if (browser) await ipc.browser.closeSession({ sessionId: browser.sessionId }).catch(() => {});
    onClose();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
          <Globe2 className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">Live browser</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3" /> Manual control stays available
          </div>
        </div>
        <span
          className={`flex items-center gap-1 text-[10px] ${running ? "text-blue-600" : "text-muted-foreground"}`}
        >
          {running ? <Loader2 className="size-3 animate-spin" /> : <Bot className="size-3" />}
          {running ? "Automating" : "Ready"}
        </span>
        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          onClick={() => void close()}
          aria-label="Close browser panel"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5">
        <button
          className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
          onClick={() => void run({ type: "back" })}
          aria-label="Back"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
          onClick={() => void run({ type: "forward" })}
          aria-label="Forward"
        >
          <ArrowRight className="size-3.5" />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          onClick={() => void run({ type: "reload" })}
          aria-label="Reload"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          onClick={goHome}
          aria-label="Home"
        >
          <Home className="size-3.5" />
        </button>
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            submitAddress();
          }}
        >
          <div className="flex h-7 items-center rounded-md border bg-muted/30 px-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            {addressFocused ? (
              <Search className="mr-1.5 size-3 text-muted-foreground" />
            ) : (
              <LockKeyhole className="mr-1.5 size-3 text-emerald-600" />
            )}
            <input
              value={address}
              onFocus={() => setAddressFocused(true)}
              onBlur={() => window.setTimeout(() => setAddressFocused(false), 120)}
              onChange={(event) => {
                setAddress(event.target.value);
                setSelectedSuggestion(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedSuggestion((current) =>
                    Math.min(current + 1, Math.max(0, suggestions.length - 1)),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedSuggestion((current) => Math.max(0, current - 1));
                }
                if (event.key === "Enter" && suggestions[selectedSuggestion]) {
                  event.preventDefault();
                  submitAddress(suggestions[selectedSuggestion].url);
                }
                if (event.key === "Escape") setAddressFocused(false);
              }}
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
              aria-label="Browser address"
              placeholder="Search or enter address"
            />
            <button
              type="button"
              onClick={() => setBookmarked((value) => !value)}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark page"}
            >
              <Star
                className={`size-3.5 ${bookmarked ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
              />
            </button>
          </div>
          {addressFocused && suggestions.length > 0 && (
            <div className="absolute inset-x-0 top-8 z-30 overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg">
              {suggestions.slice(0, 6).map((suggestion, index) => (
                <button
                  type="button"
                  key={suggestion.url}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] ${index === selectedSuggestion ? "bg-muted" : "hover:bg-muted/70"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => submitAddress(suggestion.url)}
                >
                  {index < history.length ? (
                    <Clock3 className="size-3 text-muted-foreground" />
                  ) : (
                    <Globe2 className="size-3 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{suggestion.title}</span>
                  <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">
                    {suggestion.url}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>
        <button
          className={`rounded p-1.5 hover:bg-muted ${showHistory ? "bg-muted" : "text-muted-foreground"}`}
          onClick={() => setShowHistory((value) => !value)}
          aria-label="Website history"
        >
          <Clock3 className="size-3.5" />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Browser menu"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
      {showHistory && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-[10px]">
          <Clock3 className="size-3 text-muted-foreground" />
          <span className="font-medium">Recent sites</span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {history.slice(0, 5).map((entry) => (
              <button
                key={entry.url}
                className="flex shrink-0 items-center gap-1 rounded border bg-background px-1.5 py-0.5 hover:bg-muted"
                onClick={() => submitAddress(entry.url)}
              >
                <span className="max-w-28 truncate">{entry.title}</span>
              </button>
            ))}
            {history.length === 0 && (
              <span className="text-muted-foreground">Visited sites will appear here.</span>
            )}
          </div>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setHistory([]);
              localStorage.removeItem(HISTORY_STORAGE_KEY);
            }}
          >
            Clear
          </button>
        </div>
      )}
      {mappedElements && mappedElements.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-blue-50/60 px-2 py-1.5 text-[10px] dark:bg-blue-950/20">
          <span className="shrink-0 font-medium text-blue-700 dark:text-blue-300">
            OctoLimb map
          </span>
          {mappedElements.slice(0, 12).map((element) => (
            <span
              key={`${element.index}-${element.tag}`}
              className="shrink-0 rounded border border-blue-200 bg-background px-1.5 py-0.5 text-muted-foreground dark:border-blue-900"
              title={`${element.tag}: ${element.text || "interactive element"}`}
            >
              <b className="mr-1 text-blue-700 dark:text-blue-300">[{element.index}]</b>
              {element.text || element.tag}
            </span>
          ))}
          <span className="shrink-0 text-muted-foreground">
            read_page indexed interactive elements
          </span>
        </div>
      )}
      <div className="relative min-h-0 flex-1 bg-muted/20" ref={surfaceRef}>
        {!browser && (
          <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
            Opening your interactive browser…
          </div>
        )}
        {browser?.loading && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
            <Loader2 className="mr-1 inline size-3 animate-spin" /> Loading
          </div>
        )}
      </div>
      <footer className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-t px-3 text-[10px] text-muted-foreground">
        <span className="truncate">{task}</span>
        <span className="shrink-0">{browser?.title || "Browser"}</span>
      </footer>
    </div>
  );
}
