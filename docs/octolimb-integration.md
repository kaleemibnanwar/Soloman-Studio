# OctoLimb Integration Architecture

OctoLimb lets Octopus Studio control a local Chrome browser via an MCP
(Model Context Protocol) bridge. The bridge runs **in-process inside
Octopus Studio's Electron main process** — there is no separate spawned
process or externally-installed script.

## 1. The Two Components

### A. Octopus Studio (Electron main process)
- **The bridge itself:** `src/main/octolimb_bridge.ts`. When "Enable
  OctoLimb MCP Bridge" is on in Settings, Octopus Studio starts, in-process:
  - An **MCP-over-HTTP server** on `http://127.0.0.1:32527/mcp`, built with
    `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`, with DNS
    rebinding protection enabled (only `127.0.0.1:32527`/`localhost:32527`
    Host headers are accepted).
  - A **WebSocket server** on `ws://127.0.0.1:32528`, the rendezvous point
    for the Chrome extension. Only WebSocket upgrades whose `Origin` starts
    with `chrome-extension://` are accepted.
- **Lifecycle:** `src/main/browser_limb_manager.ts` starts/stops the bridge
  (`startOctoLimbBridge` / `stopOctoLimbBridge`) based on the
  `enableBrowserLimbBridge` setting, on app startup, on settings changes,
  and cleanly on app quit (`before-quit`).
- **Database registration:** `browser_limb_manager.ts` registers the
  bridge's URL (`http://127.0.0.1:32527/mcp`) into the SQLite `mcp_servers`
  table, exactly like any other MCP server.
- **LLM context:** When you talk to an agent, `chat_stream_handlers.ts`
  fetches tools from all *enabled* `mcp_servers` rows (including OctoLimb,
  once it's registered) and injects them into the agent's tool-calling
  context.
- **Status:** `getOctoLimbBridgeStatus()` reports whether the servers are
  running and whether the extension is currently connected; Settings shows
  this live via a small status line under the toggle.

### B. Chrome Extension (`octolimb/chrome-extension/`)
- **Location:** `octolimb/chrome-extension/` in this repo — a plain,
  unbundled Manifest V3 extension with no build step. It is deliberately
  excluded from Octopus Studio's own packaging (Studio's packager only
  copies an explicit allow-list of paths; this directory isn't on it, the
  same way the unrelated `browserbridge-extension/` directory already
  isn't).
- **Install:** loaded unpacked via `chrome://extensions` — see its
  `README.md`. Independent of Studio's build/release process.
- **WebSocket client:** `background.js` persistently connects to
  `ws://127.0.0.1:32528`, reconnecting with backoff on disconnect, browser
  restart (`chrome.runtime.onStartup`), or Studio restart. A
  `chrome.alarms` periodic alarm backstops the retry loop against MV3
  service-worker suspension.
- **Execution engine:** `tools.js` implements the full nanobrowser
  (`browserbridge-extension`) action set — `go_to_url`, `go_back`,
  `search_google`, `click_element`, `input_text`, `switch_tab`, `open_tab`,
  `close_tab`, `scroll_to_percent`/`top`/`bottom`, `previous_page`/
  `next_page`, `scroll_to_text`, `send_keys`, `get_dropdown_options`,
  `select_dropdown_option`, `wait`, `cache_content`, `done` — plus
  `read_page` and `execute_js`, additions beyond nanobrowser's own set
  since this architecture has no local agent loop that automatically
  re-reads the DOM each step (Studio drives every step, so it needs an
  explicit way to get element indices before acting, and a general JS
  escape hatch). The methodology is ported from nanobrowser, studied
  directly from `browserbridge-extension`'s source (Apache 2.0):
  - `read_page` injects `buildDomTree.js` (`octolimb/chrome-extension/`,
    copied verbatim from nanobrowser) to index every visible/interactive
    element, including same-origin iframes and shadow DOM.
  - `click_element`/`input_text`/`send_keys` dispatch through
    `chrome.debugger` (CDP `Input.dispatchMouseEvent`/
    `dispatchKeyEvent`/`insertText` — `cdp.js`), the same underlying
    mechanism nanobrowser gets from Puppeteer-core, without needing
    Puppeteer or a bundler. They fall back to a plain DOM script
    (`element.click()`/setting `.value`) if a debugger can't attach —
    nanobrowser's own fallback tier for the same case.
  - Tab-level actions (navigate, open/close/switch tab) use plain
    `chrome.tabs`/`chrome.windows`, no CDP involved.
  - **Pinned task tab (`tools.js`, `currentTabId`):** every action targets
    one tab, tracked by id — never "whatever tab is currently
    active/focused in Chrome." `go_to_url`/`search_google` open a new tab
    for the task if none is pinned yet (or the pinned one was closed),
    otherwise they navigate the pinned tab; `open_tab`/`switch_tab` pin
    explicitly. `done()` unpins, so the next task gets its own fresh tab.
    This is what lets a task keep running correctly even if the user
    clicks into a different tab mid-task — `chrome.scripting.executeScript`
    and `chrome.debugger` both work against a background tab by id, so
    nothing requires the pinned tab to stay foregrounded.

## 2. The Request Flow (End-to-End)

When you prompt: *"using OctoLimb: post something on x"*

1. **Generation:** The AI emits a tool call (e.g. `OctoLimb__go_to_url`).
2. **Routing:** Octopus Studio routes it to `http://127.0.0.1:32527/mcp`.
3. **Bridge → extension:** The in-process bridge sends
   `{ type: "tool_call", id, tool, args }` over the WebSocket connection to
   the extension. If no extension is connected, or the call times out
   (30s), the bridge returns an `isError: true` MCP result immediately so
   the AI can recover instead of hanging.
4. **Browser action:** The extension executes the action (navigate, click,
   read, or eval) and replies with
   `{ type: "tool_result" | "tool_error", id, ... }`.
5. **Response:** The bridge forwards the result back to Octopus Studio as
   the MCP tool result, which is shown in the chat UI and handed back to
   the model to plan its next step.

## 3. Tool Name Mapping

Octopus Studio prefixes tool names by server to avoid collisions across
multiple active MCP servers, so `go_to_url` becomes `OctoLimb__go_to_url` in
the agent's context, and is mapped back to `go_to_url` when calling the
bridge.

## 4. Token-Usage Optimizations

Browser automation is unusually token-heavy: `read_page` returns an indexed
element list for the whole page, and a multi-step task means many such
payloads accumulate in history. Three mechanisms cut that cost:

### Leaner `read_page`

`read_page`'s body text is opt-in (`include_text`, default `false`, capped by
`max_text_length`, default 4000 chars) — most steps only need element
indices to click/type, not page content. See `octolimbIndexPage` in
`octolimb/chrome-extension/tools.js`. `xpath` stays in the response (not
stripped) because `click_element`/`input_text` accept it as a fallback when
an index goes stale, and it's also what `run_recipe` steps use for
selector stability across replays (see below).

### Nested-wrapper dedup in `read_page`

`buildDomTree.js`'s heuristic interactivity check over-indexes on sites
built from web components that wrap a single clickable target in several
`<span>`/`<div>` layers purely for styling (Reddit's `shreddit-*` elements
do this heavily — one link can produce 4-5 indexed entries in a row with
identical text and no independent action). `octolimbIndexPage` now drops a
non-distinct-interactive-tag entry (anything other than `a`, `button`,
`input`, `select`, `textarea`, `summary`, `details`, `label`, `option`)
from the list sent to the model when an earlier entry in traversal order is
both an ancestor (its xpath is a strict prefix) and shares the same visible
text — the model only ever needs to act on the outermost interactive
ancestor. This only trims what's serialized to the model; `window.__octolimb__`
(used by `click_element`/`input_text` to resolve an index to a live node)
still caches every original entry, so a dropped index would still resolve
if referenced — it's just never offered.

### Task-trajectory caching (`find_recipe` / `run_recipe` / recording)

`src/main/octolimb_recipes.ts` persists step sequences in the
`octolimb_task_recipes` table, keyed by a fingerprint of (normalized
instruction + starting domain). Two MCP tools, defined alongside the rest in
`octolimb_bridge.ts` but handled locally rather than forwarded to the
extension:

- `find_recipe(domain)` — lists every recipe saved for that domain as
  compact summaries (instruction, fingerprint, success/failure counts, no
  `steps`), RAG-style: the model reads the instructions and judges for
  itself whether one matches the task at hand, however it's worded — not a
  string-similarity match on our end. Pass the chosen `fingerprint` to
  `run_recipe` to fetch and replay its `steps`.
- `run_recipe({ steps } | { fingerprint }, save_as?)` — executes a step
  list (ad-hoc or replayed from a saved recipe) via the same
  `callExtensionTool` used for a single live call, in one MCP round trip
  instead of one per step. Runs the steps **exactly as given — nothing is
  injected or skipped**, so replaying a saved recipe behaves identically to
  the model making those same calls one at a time; if a recipe needs a
  `read_page` before an index-based step, that has to actually be one of
  its saved steps. Stops at the first failing step and returns every result
  so far plus which step failed, so the model can pick up manually from
  exactly where a cached trajectory diverged from the live page (e.g. the
  site's UI changed) — a full model-driven fallback, not a special error
  path. A replay by `fingerprint` updates the recipe's
  `successCount`/`failureCount` either way, which is the only staleness
  signal today (no automatic invalidation on UI drift, no auto-patching of
  individual failed steps — deliberately deferred until there's real
  replay-hit-rate data to justify the added complexity).

**Recording is what makes a saved recipe actually replayable**, not
anything at replay time: `createOctoLimbMcpServer` in `octolimb_bridge.ts`
keeps a per-session buffer that every real tool call this session makes
appends to — direct calls (`go_to_url`, `read_page`, `click_element`, ...)
*and* the individual steps `run_recipe` executes, whether ad-hoc or
replaying an existing fingerprint. Two things turn that buffer into a saved
recipe, and both save the *whole* buffer, not just whatever was passed into
one call:

- `done({ text, success: true })` — the model should always call this at
  the end of a task; `text` becomes the recipe's instruction. This is the
  path for a task the model just does step-by-step rather than batching
  through `run_recipe`, which used to mean nothing ever got cached for it.
- `run_recipe(..., save_as: { instruction, domain })` — same buffer, saved
  immediately on that call's success instead of waiting for `done()`. If
  the model called `read_page` as its own direct call before batching the
  rest through `run_recipe`, that `read_page` is still in the buffer and
  still gets saved — `save_as` was previously scoped to just that one
  call's `steps`, which is what let a recipe get saved missing the
  `read_page` its own replay needed.

### In-context history pruning

`chat_stream_handlers.ts`'s existing turn-count trim doesn't look inside a
turn's content, so old `read_page` snapshots stayed fully expanded until
the whole turn was evicted. `collapseStaleOctoLimbSnapshots` (same file)
additionally collapses every `read_page` result in the kept history window
except the most recent one down to a short placeholder — later steps
almost never need to look back at a superseded page snapshot. It only
touches successful (non-`is-error`) OctoLimb `read_page` results; every
other tool result is untouched.
