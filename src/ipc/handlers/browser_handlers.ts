import { BrowserWindow, WebContentsView, app, session } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { browserContracts, browserEvents } from "../types/browser";
import { readEffectiveSettings } from "../../main/settings";

const logger = log.scope("browser");

type BrowserSession = {
  id: string;
  view: WebContentsView;
  profile: { id: string; name: string; persistent: boolean };
  window: BrowserWindow;
};

const profiles = new Map<string, { id: string; name: string; persistent: boolean }>([
  ["temporary", { id: "temporary", name: "Temporary session", persistent: false }],
  ["work", { id: "work", name: "Work", persistent: true }],
  ["research", { id: "research", name: "Research", persistent: true }],
]);
const sessions = new Map<string, BrowserSession>();
const automationSessionByWindow = new Map<number, string>();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emitChanged(browserSession: BrowserSession, loading = false): void {
  if (!browserSession.window.isDestroyed()) {
    browserSession.window.webContents.send(browserEvents.changed.channel, {
      sessionId: browserSession.id,
      url: browserSession.view.webContents.getURL(),
      title: browserSession.view.webContents.getTitle(),
      loading,
    });
  }
}

function getBrowserSession(id: string): BrowserSession {
  const browserSession = sessions.get(id);
  if (!browserSession) throw new Error("Browser session is no longer available.");
  return browserSession;
}

function assertSafeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Browser navigation only supports HTTP(S) URLs.");
  }
  return url.href;
}

function emitAutomation(
  browserSession: BrowserSession,
  phase: "started" | "completed" | "failed",
  tool: string,
  args: Record<string, unknown>,
  result?: unknown,
  message?: string,
): void {
  const url =
    result && typeof result === "object" && typeof (result as { url?: unknown }).url === "string"
      ? (result as { url: string }).url
      : undefined;
  const rawElements =
    result &&
    typeof result === "object" &&
    Array.isArray((result as { elements?: unknown }).elements)
      ? (result as { elements: unknown[] }).elements
      : undefined;
  const elements = rawElements
    ?.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      index: typeof item.index === "number" ? item.index : -1,
      tag: typeof item.tag === "string" ? item.tag : "element",
      text: typeof item.text === "string" ? item.text : "",
    }))
    .filter((item) => item.index >= 0)
    .slice(0, 80);
  if (!browserSession.window.isDestroyed()) {
    browserSession.window.webContents.send(browserEvents.automation.channel, {
      phase,
      tool,
      args,
      url,
      message,
      elements,
      timestamp: Date.now(),
    });
  }
}

async function createBrowserSession(
  owner: BrowserWindow,
  profileId: string,
): Promise<BrowserSession> {
  const profile = profiles.get(profileId) ?? profiles.get("temporary")!;
  const id = randomUUID();
  const partition = profile.persistent ? `persist:soloman-browser-${profile.id}` : undefined;
  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const browserSession: BrowserSession = { id, view, profile, window: owner };
  sessions.set(id, browserSession);
  if (profile.id === "work") automationSessionByWindow.set(owner.id, id);
  owner.contentView.addChildView(view);
  view.webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  view.webContents.on("did-start-loading", () => emitChanged(browserSession, true));
  view.webContents.on("did-stop-loading", () => emitChanged(browserSession, false));
  view.webContents.on("did-navigate", () => emitChanged(browserSession));
  view.webContents.on("page-title-updated", () => emitChanged(browserSession));
  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      logger.warn(`Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`);
      emitChanged(browserSession);
    },
  );
  view.webContents.on("destroyed", () => {
    sessions.delete(id);
    if (automationSessionByWindow.get(owner.id) === id) automationSessionByWindow.delete(owner.id);
  });
  owner.once("closed", () => {
    sessions.delete(id);
    if (automationSessionByWindow.get(owner.id) === id) automationSessionByWindow.delete(owner.id);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  void view.webContents.loadURL("https://www.google.com").catch((error) => {
    logger.error("Initial navigation failed", error);
    emitChanged(browserSession);
  });
  return browserSession;
}

async function importedBrowserProfilePath(): Promise<string> {
  // The settings UI validates and stores this path explicitly. Requiring it
  // to be configured avoids guessing at or reading unrelated browser data.
  const settingsPath = (await readEffectiveSettings()).webAutomationProfilePath;
  if (!settingsPath)
    throw new Error("No imported browser profile is configured in Web Automation settings.");
  if (!fs.existsSync(settingsPath) || !fs.statSync(settingsPath).isDirectory()) {
    throw new Error("The configured browser profile path does not exist or is not a directory.");
  }
  const fingerprint = crypto.createHash("sha256").update(settingsPath).digest("hex").slice(0, 16);
  const snapshot = path.join(app.getPath("userData"), "browser-imports", fingerprint);
  fs.mkdirSync(snapshot, { recursive: true });
  const readyMarker = path.join(snapshot, ".snapshot-ready");
  if (fs.existsSync(readyMarker)) return snapshot;
  // Copy only browser state needed for authenticated web sessions. This avoids
  // reading the live Cookies SQLite file while Brave/Chrome is running and
  // keeps passwords/history out of Studio's imported profile.
  for (const relative of [
    "Cookies",
    "Network/Cookies",
    "Local Storage",
    "Session Storage",
    "Preferences",
    "Secure Preferences",
    "Web Data",
  ]) {
    const source = path.join(settingsPath, relative);
    const target = path.join(snapshot, relative);
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.cpSync(source, target, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Could not snapshot imported browser state ${relative}`, error);
    }
  }
  fs.writeFileSync(readyMarker, "ready\n", "utf8");
  return snapshot;
}

async function freeTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(
  url: string,
  timeoutMs = 12_000,
): Promise<{ webSocketDebuggerUrl?: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return (await response.json()) as { webSocketDebuggerUrl?: string };
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(
    `The selected browser did not expose a local DevTools session.${lastError ? ` ${String(lastError)}` : ""}`,
  );
}

async function cdpCall(
  socketUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const id = Math.floor(Math.random() * 1_000_000_000);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out calling ${method}.`));
    }, 10_000);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("message", (raw) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.close();
      if (message.error)
        reject(new Error(message.error.message ?? `DevTools call failed: ${method}`));
      else resolve(message.result);
    });
    socket.once("open", () => socket.send(JSON.stringify({ id, method, params })));
  });
}

async function importBrowserCookies(
  executablePath: string,
  profilePath: string,
): Promise<{ imported: number; domains: number }> {
  if (process.platform === "win32" && !path.isAbsolute(executablePath))
    throw new Error("Browser executable path must be absolute.");
  if (!fs.existsSync(executablePath))
    throw new Error("The selected browser executable was not found.");
  if (!fs.existsSync(profilePath) || !fs.statSync(profilePath).isDirectory())
    throw new Error("The selected browser profile was not found.");
  const profileName = path.basename(profilePath) || "Default";
  const userDataDir = path.dirname(profilePath);
  // Chromium 136+ refuses --remote-debugging-port on the normal/default
  // profile. Clone the profile into an isolated temporary user-data directory
  // so the browser can expose DevTools without touching the user's live data.
  const debugUserDataDir = fs.mkdtempSync(
    path.join(app.getPath("temp"), "soloman-browser-import-"),
  );
  fs.copyFileSync(
    path.join(userDataDir, "Local State"),
    path.join(debugUserDataDir, "Local State"),
  );
  fs.cpSync(profilePath, path.join(debugUserDataDir, profileName), { recursive: true });
  const port = await freeTcpPort();
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${debugUserDataDir}`,
      `--profile-directory=${profileName}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    { detached: false, stdio: "ignore" },
  );
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = (await waitForJson(`http://127.0.0.1:${port}/json`)) as unknown as Array<{
      type?: string;
      webSocketDebuggerUrl?: string;
    }>;
    const pageTarget = Array.isArray(targets)
      ? targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl)
      : undefined;
    if (!pageTarget?.webSocketDebuggerUrl)
      throw new Error("The browser did not expose a page DevTools session.");
    const result = await cdpCall(pageTarget.webSocketDebuggerUrl, "Storage.getCookies");
    const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
    const target = session.fromPath(await importedBrowserProfilePath());
    let imported = 0;
    for (const cookie of cookies) {
      if (!cookie?.name || typeof cookie.value !== "string") continue;
      try {
        await target.cookies.set({
          url: cookie.secure
            ? `https://${String(cookie.domain).replace(/^\\./, "")}${cookie.path ?? "/"}`
            : `http://${String(cookie.domain).replace(/^\\./, "")}${cookie.path ?? "/"}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path ?? "/",
          secure: Boolean(cookie.secure),
          httpOnly: Boolean(cookie.httpOnly),
          expirationDate:
            typeof cookie.expires === "number" && cookie.expires > 0 ? cookie.expires : undefined,
          sameSite:
            cookie.sameSite === "no_restriction"
              ? "no_restriction"
              : cookie.sameSite === "strict"
                ? "strict"
                : "lax",
        });
        imported += 1;
      } catch (error) {
        logger.warn(`Could not import cookie ${String(cookie.name)}`, error);
      }
    }
    return {
      imported,
      domains: new Set(cookies.map((cookie: any) => cookie.domain).filter(Boolean)).size,
    };
  } finally {
    try {
      child.kill();
    } catch {
      /* browser may have exited */
    }
    try {
      fs.rmSync(debugUserDataDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn("Could not remove temporary browser import profile", error);
    }
  }
}

function sessionForOwner(owner: BrowserWindow): BrowserSession | undefined {
  const id = automationSessionByWindow.get(owner.id);
  return id ? sessions.get(id) : undefined;
}

export function getEmbeddedBrowserUrl(owner: BrowserWindow): string {
  return sessionForOwner(owner)?.view.webContents.getURL() ?? "";
}

async function ensureAutomationSession(owner: BrowserWindow): Promise<BrowserSession> {
  return sessionForOwner(owner) ?? createBrowserSession(owner, "work");
}

const mapInteractiveElements = `(() => {
  const old = document.querySelectorAll('[data-soloman-overlay]');
  old.forEach((node) => node.remove());
  const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[tabindex]';
  const elements = Array.from(document.querySelectorAll(selectors)).filter((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });
  const mapped = elements.map((el, index) => {
    el.setAttribute('data-soloman-index', String(index));
    const rect = el.getBoundingClientRect();
    const badge = document.createElement('span');
    badge.dataset.solomanOverlay = 'true';
    badge.textContent = '[' + index + ']';
    Object.assign(badge.style, { position:'fixed', left: String(Math.max(0, rect.left)) + 'px', top: String(Math.max(0, rect.top)) + 'px', zIndex:'2147483647', background:'#171717', color:'#fff', borderRadius:'3px', padding:'1px 3px', font:'10px monospace', pointerEvents:'none' });
    document.documentElement.appendChild(badge);
    return { index, tag: el.tagName.toLowerCase(), text: String(el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 80) };
  });
  return { url: location.href, title: document.title, elements: mapped };
})()`;

export async function runEmbeddedBrowserTool(
  owner: BrowserWindow,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const browserSession = await ensureAutomationSession(owner);
  const webContents = browserSession.view.webContents;
  emitAutomation(browserSession, "started", tool, args);
  try {
    let result: unknown;
    switch (tool) {
      case "browser_go_to_url":
        await webContents.loadURL(assertSafeUrl(String(args.url ?? "")));
        result = { url: webContents.getURL() };
        break;
      case "browser_search": {
        const query = String(args.query ?? "");
        await webContents.loadURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        result = { url: webContents.getURL(), query };
        break;
      }
      case "browser_read_page":
        result = await webContents.executeJavaScript(mapInteractiveElements);
        break;
      case "browser_click": {
        const index = Number(args.index);
        result = await webContents.executeJavaScript(
          `(() => { const el = document.querySelector('[data-soloman-index="${index}"]'); if (!el) throw new Error('No mapped element at index ${index}; call browser_read_page again.'); el.scrollIntoView({block:'center'}); el.click(); return {clicked:true,index:${index},url:location.href}; })()`,
        );
        break;
      }
      case "browser_input": {
        const index = Number(args.index);
        const text = String(args.text ?? "");
        result = await webContents.executeJavaScript(
          `(() => { const el = document.querySelector('[data-soloman-index="${index}"]'); if (!el) throw new Error('No mapped element at index ${index}; call browser_read_page again.'); el.focus(); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set; setter?.call(el, ${JSON.stringify(text)}); if (!setter) el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return {input:true,index:${index},url:location.href}; })()`,
        );
        break;
      }
      case "browser_back":
        if (webContents.canGoBack()) webContents.goBack();
        result = { url: webContents.getURL() };
        break;
      case "browser_forward":
        if (webContents.canGoForward()) webContents.goForward();
        result = { url: webContents.getURL() };
        break;
      case "browser_reload":
        await webContents.reload();
        result = { url: webContents.getURL() };
        break;
      case "browser_wait": {
        const seconds = Math.min(30, Math.max(0, Number(args.seconds ?? 3)));
        await delay(seconds * 1000);
        result = { waitedSeconds: seconds, url: webContents.getURL() };
        break;
      }
      case "browser_scroll_to_percent": {
        const percent = Math.min(100, Math.max(0, Number(args.percent ?? 0)));
        const index = args.index == null ? null : Number(args.index);
        result = await webContents.executeJavaScript(`(() => {
          const target = ${index == null ? "document.scrollingElement" : `document.querySelector('[data-soloman-index="${index}"]')`};
          if (!target) throw new Error('No mapped element at the requested index. Call browser_read_page again.');
          if (target === document.scrollingElement) target.scrollTo({ top: target.scrollHeight * ${percent / 100}, behavior: 'instant' });
          else target.scrollTop = target.scrollHeight * ${percent / 100};
          return { percent: ${percent}, index: ${index == null ? "null" : index}, url: location.href };
        })()`);
        break;
      }
      case "browser_scroll_to_top":
      case "browser_scroll_to_bottom": {
        const index = args.index == null ? null : Number(args.index);
        const bottom = tool === "browser_scroll_to_bottom";
        result = await webContents.executeJavaScript(`(() => {
          const target = ${index == null ? "document.scrollingElement" : `document.querySelector('[data-soloman-index="${index}"]')`};
          if (!target) throw new Error('No mapped element at the requested index. Call browser_read_page again.');
          target.scrollTo({ top: ${bottom ? "target.scrollHeight" : "0"}, behavior: 'instant' });
          return { index: ${index == null ? "null" : index}, position: '${bottom ? "bottom" : "top"}', url: location.href };
        })()`);
        break;
      }
      case "browser_previous_page":
      case "browser_next_page": {
        const index = args.index == null ? null : Number(args.index);
        const direction = tool === "browser_next_page" ? 1 : -1;
        result = await webContents.executeJavaScript(`(() => {
          const target = ${index == null ? "document.scrollingElement" : `document.querySelector('[data-soloman-index="${index}"]')`};
          if (!target) throw new Error('No mapped element at the requested index. Call browser_read_page again.');
          const amount = target.clientHeight * ${direction};
          target.scrollBy({ top: amount, behavior: 'instant' });
          return { index: ${index == null ? "null" : index}, direction: ${direction}, url: location.href };
        })()`);
        break;
      }
      case "browser_scroll_to_text": {
        const text = String(args.text ?? "");
        result = await webContents.executeJavaScript(`(() => {
          const needle = ${JSON.stringify(text)}.toLowerCase();
          const node = [...document.querySelectorAll('body *')].find((el) => (el.textContent || '').toLowerCase().includes(needle));
          if (!node) return { found: false, text: ${JSON.stringify(text)}, url: location.href };
          node.scrollIntoView({ block: 'center', behavior: 'instant' });
          return { found: true, text: ${JSON.stringify(text)}, tag: node.tagName.toLowerCase(), url: location.href };
        })()`);
        break;
      }
      case "browser_send_keys": {
        const keys = String(args.keys ?? "");
        result = await webContents.executeJavaScript(`(() => {
          const value = ${JSON.stringify(keys)};
          const target = document.activeElement || document.body;
          target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keyup', { key: value, bubbles: true }));
          return { sent: value, url: location.href };
        })()`);
        break;
      }
      case "browser_get_dropdown_options": {
        const index = Number(args.index);
        result = await webContents.executeJavaScript(`(() => {
          const el = document.querySelector('[data-soloman-index="${index}"]');
          if (!el || el.tagName.toLowerCase() !== 'select') throw new Error('Mapped element is not a native dropdown.');
          return { index: ${index}, options: [...el.options].map((option) => ({ text: option.text, value: option.value, selected: option.selected })), url: location.href };
        })()`);
        break;
      }
      case "browser_select_dropdown_option": {
        const index = Number(args.index);
        const optionText = String(args.option ?? args.text ?? "");
        result = await webContents.executeJavaScript(`(() => {
          const el = document.querySelector('[data-soloman-index="${index}"]');
          if (!el || el.tagName.toLowerCase() !== 'select') throw new Error('Mapped element is not a native dropdown.');
          const option = [...el.options].find((item) => item.text === ${JSON.stringify(optionText)} || item.value === ${JSON.stringify(optionText)});
          if (!option) throw new Error('Dropdown option was not found.');
          el.value = option.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          return { index: ${index}, selected: option.text, value: option.value, url: location.href };
        })()`);
        break;
      }
      case "browser_execute_js": {
        const code = String(args.code ?? "");
        if (!code.trim()) throw new Error("JavaScript code is required.");
        result = await webContents.executeJavaScript(code);
        break;
      }
      case "browser_cache_content": {
        result = await webContents.executeJavaScript(
          `({ url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, 50000) })`,
        );
        break;
      }
      case "browser_open_tab":
        await webContents.loadURL(assertSafeUrl(String(args.url ?? "")));
        result = { tabId: "embedded-task-tab", url: webContents.getURL(), reused: true };
        break;
      case "browser_switch_tab":
        result = {
          tabId: "embedded-task-tab",
          url: webContents.getURL(),
          switched: true,
          note: "Studio uses one isolated automation tab per task.",
        };
        break;
      case "browser_close_tab":
        result = {
          tabId: "embedded-task-tab",
          closed: false,
          note: "The task tab stays available until the browser panel is closed.",
        };
        break;
      case "browser_done":
        result = { completed: true, url: webContents.getURL() };
        break;
      default:
        throw new Error(`Unknown embedded browser tool: ${tool}`);
    }
    emitAutomation(browserSession, "completed", tool, args, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitAutomation(browserSession, "failed", tool, args, undefined, message);
    return `Browser automation failed: ${message}`;
  }
}

export function registerBrowserHandlers(): void {
  createTypedHandler(browserContracts.createSession, async (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error("Browser session has no owning window.");
    // Keep the window-scoped browser alive while React routes/panels unmount.
    // Navigation between Chats, Browser, Planner, and other views must not
    // destroy the user's page, cookies, tabs, or current automation state.
    const existing = sessionForOwner(owner);
    if (existing && existing.profile.id === input.profileId) {
      return { sessionId: existing.id, profile: existing.profile };
    }
    if (existing) {
      sessions.delete(existing.id);
      owner.contentView.removeChildView(existing.view);
      if (!existing.view.webContents.isDestroyed()) existing.view.webContents.close();
      if (automationSessionByWindow.get(owner.id) === existing.id)
        automationSessionByWindow.delete(owner.id);
    }
    const browserSession = await createBrowserSession(owner, input.profileId);
    return { sessionId: browserSession.id, profile: browserSession.profile };
  });

  createTypedHandler(browserContracts.setBounds, async (event, input) => {
    const browserSession = getBrowserSession(input.sessionId);
    if (browserSession.window.webContents !== event.sender)
      throw new Error("Browser session owner mismatch.");
    browserSession.view.setBounds({
      x: Math.max(0, Math.round(input.x)),
      y: Math.max(0, Math.round(input.y)),
      width: Math.max(1, Math.round(input.width)),
      height: Math.max(1, Math.round(input.height)),
    });
    return { ok: true as const };
  });

  createTypedHandler(browserContracts.setVisible, async (event, input) => {
    const browserSession = getBrowserSession(input.sessionId);
    if (browserSession.window.webContents !== event.sender)
      throw new Error("Browser session owner mismatch.");
    browserSession.view.setVisible(input.visible);
    return { ok: true as const };
  });

  createTypedHandler(browserContracts.runAction, async (event, input) => {
    const browserSession = getBrowserSession(input.sessionId);
    if (browserSession.window.webContents !== event.sender)
      throw new Error("Browser session owner mismatch.");
    const webContents = browserSession.view.webContents;
    switch (input.action.type) {
      case "navigate":
        await webContents.loadURL(assertSafeUrl(input.action.url));
        break;
      case "back":
        if (webContents.canGoBack()) webContents.goBack();
        break;
      case "forward":
        if (webContents.canGoForward()) webContents.goForward();
        break;
      case "reload":
        webContents.reload();
        break;
      case "click":
        await webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(input.action.selector)})?.click()`,
        );
        break;
      case "fill":
        await webContents.executeJavaScript(
          `(() => { const el = document.querySelector(${JSON.stringify(input.action.selector)}); if (!el) throw new Error("Element not found"); el.focus(); el.value = ${JSON.stringify(input.action.value)}; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()`,
        );
        break;
    }
    return { ok: true as const, url: webContents.getURL() };
  });

  createTypedHandler(browserContracts.closeSession, async (event, input) => {
    const browserSession = getBrowserSession(input.sessionId);
    if (browserSession.window.webContents !== event.sender)
      throw new Error("Browser session owner mismatch.");
    sessions.delete(input.sessionId);
    if (automationSessionByWindow.get(browserSession.window.id) === input.sessionId) {
      automationSessionByWindow.delete(browserSession.window.id);
    }
    browserSession.window.contentView.removeChildView(browserSession.view);
    browserSession.view.webContents.close();
    return { ok: true as const };
  });
}
