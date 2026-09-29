// @vitest-environment node
//
// This suite drives the bridge over real loopback HTTP/WebSocket sockets.
// happy-dom's fetch() enforces same-origin/CORS like a real browser, which
// blocks cross-origin requests to 127.0.0.1 from the test's origin — the
// plain Node environment doesn't have that restriction.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@/ipc/utils/query_invalidation_delivery", () => ({
  publishQueryInvalidations: vi.fn(),
}));

import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setDatabaseForTesting } from "@/db";
import { createInMemoryTestDb, type TestDb } from "@/testing/test_db";
import {
  startOctoLimbBridge,
  stopOctoLimbBridge,
  getOctoLimbBridgeStatus,
} from "../octolimb_bridge";

const HTTP_URL = "http://127.0.0.1:32527/mcp";
const WS_URL = "ws://127.0.0.1:32528";

/** Wires an echoing fake extension socket, used by the run_recipe tests below. */
async function connectEchoExtension(): Promise<WebSocket> {
  const extensionSocket = new WebSocket(WS_URL, { origin: "chrome-extension://test-extension-id" });
  await new Promise<void>((resolve, reject) => {
    extensionSocket.on("open", () => resolve());
    extensionSocket.on("error", reject);
  });
  extensionSocket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== "tool_call") return;
    // A step with url "FAIL" simulates the extension throwing mid-step, e.g.
    // a click/input target that no longer resolves on the live page.
    if (message.args?.url === "FAIL") {
      extensionSocket.send(JSON.stringify({ type: "tool_error", id: message.id, error: "boom" }));
      return;
    }
    extensionSocket.send(
      JSON.stringify({ type: "tool_result", id: message.id, result: { echoed: message.args } }),
    );
  });
  await vi.waitFor(() => expect(getOctoLimbBridgeStatus().extensionConnected).toBe(true));
  return extensionSocket;
}

/** Same as connectEchoExtension, but also records the order of tool names it receives. */
async function connectRecordingExtension(): Promise<{ socket: WebSocket; calls: string[] }> {
  const calls: string[] = [];
  const socket = new WebSocket(WS_URL, { origin: "chrome-extension://test-extension-id" });
  await new Promise<void>((resolve, reject) => {
    socket.on("open", () => resolve());
    socket.on("error", reject);
  });
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== "tool_call") return;
    calls.push(message.tool);
    socket.send(
      JSON.stringify({ type: "tool_result", id: message.id, result: { echoed: message.args } }),
    );
  });
  await vi.waitFor(() => expect(getOctoLimbBridgeStatus().extensionConnected).toBe(true));
  return { socket, calls };
}

async function connectMcpClient(): Promise<Client> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(HTTP_URL));
  await client.connect(transport);
  return client;
}

describe("octolimb_bridge", () => {
  afterEach(async () => {
    await stopOctoLimbBridge();
  });

  it("starts and reports the browser tools over MCP", async () => {
    await startOctoLimbBridge();
    expect(getOctoLimbBridgeStatus().running).toBe(true);

    const client = await connectMcpClient();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        "cache_content",
        "click_element",
        "close_tab",
        "done",
        "execute_js",
        "find_recipe",
        "get_dropdown_options",
        "go_back",
        "go_to_url",
        "input_text",
        "next_page",
        "open_tab",
        "previous_page",
        "read_page",
        "run_recipe",
        "scroll_to_bottom",
        "scroll_to_percent",
        "scroll_to_text",
        "scroll_to_top",
        "search_google",
        "select_dropdown_option",
        "send_keys",
        "switch_tab",
        "wait",
      ].sort(),
    );

    // Ported actions should carry nanobrowser's own optional `intent`
    // field, and click_element/input_text should also accept the optional
    // `xpath` fallback nanobrowser's schemas define.
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(byName.go_to_url.inputSchema.properties).toHaveProperty("intent");
    expect(byName.click_element.inputSchema.properties).toHaveProperty("xpath");
    expect(byName.input_text.inputSchema.properties).toHaveProperty("xpath");
    // `done` has no intent field in nanobrowser's own schema either.
    expect(byName.done.inputSchema.properties).not.toHaveProperty("intent");

    await client.close();
  });

  it("serves multiple independent MCP client sessions concurrently", async () => {
    // Regression test: Octopus Studio opens more than one independent MCP
    // session against this server at once (e.g. the chat tool-fetch path
    // and the Settings "list tools" path each hold their own client, and a
    // disabled/re-enabled server gets a freshly reconnecting client). A
    // single shared StreamableHTTPServerTransport can only be initialized
    // once, so a second client's `initialize` used to fail with "Server
    // already initialized" — each session must get its own transport.
    await startOctoLimbBridge();

    const clientA = await connectMcpClient();
    const clientB = await connectMcpClient();

    const [{ tools: toolsA }, { tools: toolsB }] = await Promise.all([
      clientA.listTools(),
      clientB.listTools(),
    ]);
    expect(toolsA.length).toBeGreaterThan(0);
    expect(toolsB.length).toBeGreaterThan(0);

    await clientA.close();
    // The first client closing its session must not affect the second.
    const { tools: toolsBAfter } = await clientB.listTools();
    expect(toolsBAfter.length).toBeGreaterThan(0);

    await clientB.close();
  });

  it("returns isError when no extension is connected", async () => {
    await startOctoLimbBridge();
    const client = await connectMcpClient();

    const result = await client.callTool({
      name: "go_to_url",
      arguments: { url: "https://example.com" },
    });
    expect(result.isError).toBe(true);
    await client.close();
  }, 10_000); // give this one real headroom so it doesn't flake on normal machine load. // rejecting, which sits right at vitest's default 5s test timeout — // callExtensionTool waits out EXTENSION_RECONNECT_GRACE_MS (5s) before

  it("rejects a WebSocket upgrade whose Origin is not a chrome extension", async () => {
    await startOctoLimbBridge();
    const socket = new WebSocket(WS_URL, { origin: "https://evil.example" });
    const opened = await new Promise<boolean>((resolve) => {
      socket.on("open", () => resolve(true));
      socket.on("unexpected-response", () => resolve(false));
      socket.on("close", () => resolve(false));
      socket.on("error", () => resolve(false));
    });
    expect(opened).toBe(false);
  });

  it("round-trips a tool call through a connected extension socket", async () => {
    await startOctoLimbBridge();

    const extensionSocket = new WebSocket(WS_URL, {
      origin: "chrome-extension://test-extension-id",
    });
    await new Promise<void>((resolve, reject) => {
      extensionSocket.on("open", () => resolve());
      extensionSocket.on("error", reject);
    });
    extensionSocket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "tool_call") {
        extensionSocket.send(
          JSON.stringify({
            type: "tool_result",
            id: message.id,
            result: { echoed: message.args },
          }),
        );
      }
    });

    await vi.waitFor(() => expect(getOctoLimbBridgeStatus().extensionConnected).toBe(true));

    const client = await connectMcpClient();
    const result = await client.callTool({
      name: "go_to_url",
      arguments: { url: "https://example.com" },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as { type: string; text: string }[];
    expect(JSON.parse(content.text)).toEqual({
      echoed: { url: "https://example.com" },
    });

    await client.close();
    extensionSocket.close();
  });

  it("rejects pending calls when the extension disconnects mid-call", async () => {
    await startOctoLimbBridge();

    const extensionSocket = new WebSocket(WS_URL, {
      origin: "chrome-extension://test-extension-id",
    });
    await new Promise<void>((resolve, reject) => {
      extensionSocket.on("open", () => resolve());
      extensionSocket.on("error", reject);
    });
    // Never reply to tool_call messages; disconnect instead.
    extensionSocket.on("message", () => {
      extensionSocket.close();
    });

    await vi.waitFor(() => expect(getOctoLimbBridgeStatus().extensionConnected).toBe(true));

    const client = await connectMcpClient();
    const result = await client.callTool({
      name: "go_to_url",
      arguments: { url: "https://example.com" },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe("octolimb_bridge recipe tools", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createInMemoryTestDb();
    setDatabaseForTesting(db);
  });

  afterEach(async () => {
    await stopOctoLimbBridge();
    db.$client.close();
    setDatabaseForTesting(null);
  });

  it("find_recipe reports not found for a domain with no saved recipes", async () => {
    await startOctoLimbBridge();
    const client = await connectMcpClient();

    const result = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "x.com" },
    });
    const [content] = result.content as { type: string; text: string }[];
    expect(JSON.parse(content.text)).toEqual({ found: false, recipes: [] });

    await client.close();
  });

  it("run_recipe executes ad-hoc steps in order and saves them on full success", async () => {
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    const runResult = await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [
          { tool: "go_to_url", args: { url: "https://x.com" } },
          { tool: "click_element", args: { index: 1 } },
        ],
        save_as: { instruction: "post something", domain: "x.com" },
      },
    });
    const [runContent] = runResult.content as { type: string; text: string }[];
    const runParsed = JSON.parse(runContent.text);
    expect(runParsed.completed).toBe(true);
    expect(runParsed.results).toHaveLength(2);
    expect(runParsed.savedFingerprint).toBeTruthy();

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "x.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    const findParsed = JSON.parse(findContent.text);
    expect(findParsed.found).toBe(true);
    expect(findParsed.recipes).toHaveLength(1);
    expect(findParsed.recipes[0]).toMatchObject({
      instruction: "post something",
      successCount: 1,
      failureCount: 0,
    });
    // Summaries, not full steps — run_recipe fetches those by fingerprint.
    expect(findParsed.recipes[0]).not.toHaveProperty("steps");

    await client.close();
    extensionSocket.close();
  });

  it("run_recipe stops at the first failing step and reports where it stopped", async () => {
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    const runResult = await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [
          { tool: "go_to_url", args: { url: "https://x.com" } },
          { tool: "go_to_url", args: { url: "FAIL" } },
          { tool: "go_to_url", args: { url: "https://x.com/never-reached" } },
        ],
      },
    });
    const [content] = runResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content.text);
    expect(parsed.completed).toBe(false);
    expect(parsed.failedAtStep).toBe(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.error).toContain("boom");

    await client.close();
    extensionSocket.close();
  });

  it("run_recipe executes exactly the given steps — nothing injected, nothing skipped", async () => {
    await startOctoLimbBridge();
    const { socket: extensionSocket, calls } = await connectRecordingExtension();
    const client = await connectMcpClient();

    await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [
          { tool: "go_to_url", args: { url: "https://reddit.com/r/test/submit" } },
          { tool: "click_element", args: { index: 3 } },
        ],
      },
    });

    // No auto-inserted read_page or anything else — replay must do exactly
    // what a live model doing these same calls one at a time would do.
    expect(calls).toEqual(["go_to_url", "click_element"]);

    await client.close();
    extensionSocket.close();
  });

  it("save_as persists every tool call made this session, not just the steps passed into this run_recipe call", async () => {
    // Regression test for the real reported failure: a recipe replay used
    // to fail on the first click_element/input_text after navigation
    // ("Cannot read properties of null (reading 'x')") because the model
    // had called read_page as its own direct call to work out the indices,
    // then only passed the click/input steps into run_recipe's `steps` —
    // save_as used to persist just those, dropping the read_page a replay
    // needs to populate the extension's live element-index cache. Fix:
    // save_as now persists the session's full recording buffer, which
    // includes direct calls made before run_recipe was ever invoked.
    await startOctoLimbBridge();
    const { socket: extensionSocket, calls } = await connectRecordingExtension();
    const client = await connectMcpClient();

    await client.callTool({
      name: "go_to_url",
      arguments: { url: "https://reddit.com/r/test/submit" },
    });
    await client.callTool({ name: "read_page", arguments: {} });

    const runResult = await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [
          { tool: "click_element", args: { index: 3 } },
          { tool: "input_text", args: { index: 5, text: "hi" } },
        ],
        save_as: { instruction: "post on r/test", domain: "reddit.com" },
      },
    });
    const [runContent] = runResult.content as { type: string; text: string }[];
    const fingerprint = JSON.parse(runContent.text).savedFingerprint;
    expect(fingerprint).toBeTruthy();

    calls.length = 0; // isolate what the replay itself sends
    await client.callTool({ name: "run_recipe", arguments: { fingerprint } });

    expect(calls).toEqual(["go_to_url", "read_page", "click_element", "input_text"]);

    await client.close();
    extensionSocket.close();
  });

  it("done()-triggered auto-save includes steps that ran via a prior ad-hoc run_recipe call, not just direct calls", async () => {
    await startOctoLimbBridge();
    const { socket: extensionSocket, calls } = await connectRecordingExtension();
    const client = await connectMcpClient();

    // An ad-hoc run_recipe with no save_as — just batching a few calls,
    // not (at this point) meant to be saved on its own.
    await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [
          { tool: "go_to_url", args: { url: "https://reddit.com/r/test/submit" } },
          { tool: "read_page", args: {} },
          { tool: "click_element", args: { index: 3 } },
        ],
      },
    });
    await client.callTool({ name: "input_text", arguments: { index: 5, text: "hi" } });
    await client.callTool({ name: "done", arguments: { text: "post on r/test", success: true } });

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "reddit.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    const found = JSON.parse(findContent.text);
    expect(found.found).toBe(true);

    calls.length = 0;
    await client.callTool({
      name: "run_recipe",
      arguments: { fingerprint: found.recipes[0].fingerprint },
    });
    expect(calls).toEqual(["go_to_url", "read_page", "click_element", "input_text"]);

    await client.close();
    extensionSocket.close();
  });

  it("run_recipe replays a saved recipe by fingerprint and updates its success count", async () => {
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    const saveResult = await client.callTool({
      name: "run_recipe",
      arguments: {
        steps: [{ tool: "go_to_url", args: { url: "https://x.com" } }],
        save_as: { instruction: "post something", domain: "x.com" },
      },
    });
    const [saveContent] = saveResult.content as { type: string; text: string }[];
    const fingerprint = JSON.parse(saveContent.text).savedFingerprint;

    const replayResult = await client.callTool({
      name: "run_recipe",
      arguments: { fingerprint },
    });
    const [replayContent] = replayResult.content as { type: string; text: string }[];
    const replayParsed = JSON.parse(replayContent.text);
    expect(replayParsed.completed).toBe(true);

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "x.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    expect(JSON.parse(findContent.text).recipes[0].successCount).toBe(2); // initial save + one replay

    await client.close();
    extensionSocket.close();
  });

  it("run_recipe errors clearly when replaying an unknown fingerprint", async () => {
    await startOctoLimbBridge();
    const client = await connectMcpClient();

    const result = await client.callTool({
      name: "run_recipe",
      arguments: { fingerprint: "does-not-exist" },
    });
    const [content] = result.content as { type: string; text: string }[];
    expect(JSON.parse(content.text).error).toContain("No recipe found");

    await client.close();
  });

  it("auto-saves a recipe from individual tool calls once done(success: true) is called, without run_recipe", async () => {
    // Regression test: a model that does a task step-by-step via the plain
    // action tools (go_to_url, click_element, input_text, ...) instead of
    // batching through run_recipe's save_as used to leave nothing saved at
    // all — this is the actual reported bug.
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    await client.callTool({
      name: "go_to_url",
      arguments: { url: "https://reddit.com/r/test" },
    });
    await client.callTool({
      name: "click_element",
      arguments: { index: 3 },
    });
    await client.callTool({
      name: "input_text",
      arguments: { index: 5, text: "test post" },
    });
    await client.callTool({
      name: "done",
      arguments: { text: "post a test post on r/test", success: true },
    });

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "reddit.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    const findParsed = JSON.parse(findContent.text);
    expect(findParsed.found).toBe(true);
    expect(findParsed.recipes[0].instruction).toBe("post a test post on r/test");

    await client.close();
    extensionSocket.close();
  });

  it("does not auto-save when done(success: false) is called", async () => {
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    await client.callTool({ name: "go_to_url", arguments: { url: "https://reddit.com/r/test" } });
    await client.callTool({
      name: "done",
      arguments: { text: "post a test post on r/test", success: false },
    });

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "reddit.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    expect(JSON.parse(findContent.text).found).toBe(false);

    await client.close();
    extensionSocket.close();
  });

  it("does not auto-save actions taken before any navigation set a domain", async () => {
    await startOctoLimbBridge();
    const extensionSocket = await connectEchoExtension();
    const client = await connectMcpClient();

    // click_element/input_text carry no URL, so with no prior navigation
    // there's no domain to file the recipe under.
    await client.callTool({ name: "click_element", arguments: { index: 1 } });
    await client.callTool({ name: "done", arguments: { text: "did something", success: true } });

    const findResult = await client.callTool({
      name: "find_recipe",
      arguments: { domain: "reddit.com" },
    });
    const [findContent] = findResult.content as { type: string; text: string }[];
    expect(JSON.parse(findContent.text).found).toBe(false);

    await client.close();
    extensionSocket.close();
  });
});
