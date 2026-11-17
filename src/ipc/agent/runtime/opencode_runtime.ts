import path from "node:path";

import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type JSONValue,
  type LanguageModel,
} from "ai";

import { getUserDataPath } from "../../../paths/paths";
import type { AgentRole } from "../task_types";
import { buildOpenCodePermissionRules, isLanguageModelV3 } from "./opencode_policy";

export { canUseOpenCodeRuntime } from "./opencode_policy";

type OpenCodeHost = Awaited<ReturnType<typeof import("@opencode/sdk").OpenCode.create>>;
type LanguageModelV3 = Extract<LanguageModel, { specificationVersion: "v3" }>;

export interface OpenCodeAction {
  tool: string;
  input: unknown;
  outputPreview?: string;
}

export interface OpenCodeRunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  actionsTaken: OpenCodeAction[];
  status: "complete" | "partial";
  notes: string;
}

export interface OpenCodeRunInput {
  model: LanguageModel;
  role: AgentRole;
  workspacePath: string;
  systemPrompt: string;
  prompt: string;
  maxSteps: number;
  maxOutputTokens: number;
  temperature?: number;
  headers?: Record<string, string>;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  allowedFiles?: string[] | null;
  abortSignal: AbortSignal;
  requestConsent: (request: {
    action: string;
    resources: string[];
    message?: string;
  }) => Promise<boolean>;
}

export class OpenCodeRuntimeError extends Error {
  constructor(
    message: string,
    readonly safeToFallback: boolean,
  ) {
    super(message);
    this.name = "OpenCodeRuntimeError";
  }
}

interface ModelSlot {
  id: string;
  providerID: string;
}

const languageModels = new Map<string, LanguageModelV3>();
const SOLOMAN_RUNTIME_PROVIDER = "soloman-runtime";
const SOLOMAN_RUNTIME_SLOT_COUNT = 4;
const freeSlots: ModelSlot[] = [];
const slotWaiters: Array<(slot: ModelSlot) => void> = [];
let hostPromise: Promise<OpenCodeHost> | null = null;

async function createHost(): Promise<OpenCodeHost> {
  const { OpenCode } = (await import("@opencode/sdk")) as typeof import("@opencode/sdk");
  const host = await OpenCode.create({
    app: { name: "soloman-studio", version: "1" },
    database: { path: path.join(getUserDataPath(), "opencode-runtime.db") },
    models: { fetch: false },
    config: {
      project: false,
      claude: false,
      content: JSON.stringify({ snapshots: false, update: "disable", share: "disabled" }),
    },
    fs: { filewatcher: false },
    plugins: [
      {
        id: "soloman-language-model-bridge",
        async setup(context) {
          await context.provider.transform((editor) => {
            const templateProvider = editor.get("opencode");
            const templateModel = templateProvider?.models.values().next().value;
            if (!templateProvider || !templateModel) return;
            editor.add({
              info: {
                ...templateProvider.provider,
                id: SOLOMAN_RUNTIME_PROVIDER as typeof templateProvider.provider.id,
                name: "Soloman runtime",
                package: "aisdk:@ai-sdk/openai-compatible",
                integrationID: undefined,
                settings: {},
              },
              models: Array.from({ length: SOLOMAN_RUNTIME_SLOT_COUNT }, (_, index) => ({
                ...templateModel,
                id: `slot-${index}` as typeof templateModel.id,
                modelID: `slot-${index}` as typeof templateModel.modelID,
                providerID: SOLOMAN_RUNTIME_PROVIDER as typeof templateModel.providerID,
                name: `Soloman model slot ${index + 1}`,
                package: "aisdk:@ai-sdk/openai-compatible",
                settings: {},
                variants: [],
              })),
            });
          });
          await context.aisdk.hook("sdk", (request) => {
            const bridged = languageModels.get(`${request.model.providerID}/${request.model.id}`);
            if (!bridged) return;
            // Supplying the provider facade here prevents OpenCode from loading
            // or authenticating its catalog provider before the language hook
            // gets a chance to inject Soloman's already-configured model.
            const provider = Object.assign(() => bridged, {
              languageModel: () => bridged,
            });
            request.sdk = provider;
          });
          await context.aisdk.hook("language", (request) => {
            const bridged = languageModels.get(`${request.model.providerID}/${request.model.id}`);
            if (bridged) request.language = bridged;
          });
        },
      },
    ],
  });

  const models = await host.model.list();
  for (const model of models.data.filter(
    (candidate) => candidate.providerID === SOLOMAN_RUNTIME_PROVIDER,
  )) {
    freeSlots.push({ id: model.id, providerID: model.providerID });
  }
  if (freeSlots.length === 0) {
    await host.close();
    throw new Error("OpenCode did not expose a model slot for the Soloman model bridge");
  }
  return host;
}

async function getHost(): Promise<OpenCodeHost> {
  if (!hostPromise) {
    hostPromise = createHost().catch((error) => {
      hostPromise = null;
      throw error;
    });
  }
  return hostPromise;
}

export async function closeOpenCodeRuntime(): Promise<void> {
  const current = hostPromise;
  hostPromise = null;
  languageModels.clear();
  freeSlots.length = 0;
  slotWaiters.length = 0;
  if (current) await (await current).close();
}

async function acquireSlot(): Promise<ModelSlot> {
  const slot = freeSlots.shift();
  if (slot) return slot;
  return new Promise<ModelSlot>((resolve) => slotWaiters.push(resolve));
}

function releaseSlot(slot: ModelSlot): void {
  languageModels.delete(`${slot.providerID}/${slot.id}`);
  const waiter = slotWaiters.shift();
  if (waiter) waiter(slot);
  else freeSlots.push(slot);
}

function previewToolContent(content: unknown, maxChars = 350): string {
  const value = Array.isArray(content)
    ? content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text)
            : JSON.stringify(part),
        )
        .join("\n")
    : String(content ?? "");
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}…` : compact;
}

export async function runWithOpenCode(input: OpenCodeRunInput): Promise<OpenCodeRunResult> {
  if (!isLanguageModelV3(input.model)) {
    throw new OpenCodeRuntimeError("The selected model does not implement AI SDK v3", true);
  }

  const host = await getHost().catch((error) => {
    throw new OpenCodeRuntimeError(
      `OpenCode host failed to start: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  });
  const slot = await acquireSlot();
  const slotKey = `${slot.providerID}/${slot.id}`;
  languageModels.set(
    slotKey,
    wrapLanguageModel({
      model: input.model,
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: input.maxOutputTokens,
          temperature: input.temperature,
          headers: input.headers,
          providerOptions: input.providerOptions,
        },
      }),
    }),
  );

  let sessionID: string | undefined;
  const executedToolIDs = new Set<string>();
  let permissionDenied = false;
  const actions = new Map<string, OpenCodeAction>();
  const texts = new Map<number, string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let stepCount = 0;
  let interruptedAtStepLimit = false;

  try {
    const session = await host.session.create({
      agent: "build",
      model: slot,
      location: { directory: input.workspacePath },
      permissions: buildOpenCodePermissionRules(input),
      metadata: { owner: "soloman", runtime: "opencode" },
    });
    sessionID = session.id;

    const eventTypes = [
      "session.text.delta",
      "session.text.ended",
      "session.tool.input.started",
      "session.tool.called",
      "session.tool.success",
      "session.tool.failed",
      "session.step.ended",
      "session.execution.succeeded",
      "session.execution.failed",
      "session.execution.interrupted",
      "permission.asked",
    ] as const;
    const events = host.event.subscribe({ types: eventTypes });
    const eventIterator = events[Symbol.asyncIterator]();
    let nextEvent = eventIterator.next();
    const abort = () =>
      void host.session.interrupt({ sessionID: session.id }).catch(() => undefined);
    input.abortSignal.addEventListener("abort", abort, { once: true });
    if (input.abortSignal.aborted) abort();

    await host.session.prompt({
      sessionID: session.id,
      text: `${input.systemPrompt}\n\n--- ASSIGNED SUBTASK ---\n${input.prompt}`,
    });

    let terminalError: string | undefined;
    try {
      while (true) {
        const item = await nextEvent;
        if (item.done) break;
        const event = item.value;
        if (
          !("data" in event) ||
          !("sessionID" in event.data) ||
          event.data.sessionID !== session.id
        ) {
          nextEvent = eventIterator.next();
          continue;
        }
        switch (event.type) {
          case "session.text.delta":
            texts.set(event.data.ordinal, (texts.get(event.data.ordinal) ?? "") + event.data.delta);
            break;
          case "session.text.ended":
            texts.set(event.data.ordinal, event.data.text);
            break;
          case "session.tool.input.started":
            actions.set(event.data.id, { tool: event.data.name, input: {} });
            break;
          case "session.tool.called": {
            const action = actions.get(event.data.id) ?? { tool: "unknown", input: {} };
            action.input = event.data.input;
            actions.set(event.data.id, action);
            if (event.data.executed) executedToolIDs.add(event.data.id);
            break;
          }
          case "session.tool.success": {
            const action = actions.get(event.data.id) ?? { tool: "unknown", input: {} };
            action.outputPreview = previewToolContent(event.data.content);
            actions.set(event.data.id, action);
            if (event.data.executed) executedToolIDs.add(event.data.id);
            break;
          }
          case "session.tool.failed": {
            const action = actions.get(event.data.id) ?? { tool: "unknown", input: {} };
            action.outputPreview = previewToolContent(event.data.content ?? event.data.error);
            actions.set(event.data.id, action);
            if (event.data.executed) executedToolIDs.add(event.data.id);
            break;
          }
          case "session.step.ended":
            stepCount += 1;
            inputTokens += event.data.tokens.input;
            outputTokens += event.data.tokens.output;
            if (stepCount >= input.maxSteps) {
              interruptedAtStepLimit = true;
              await host.session.interrupt({ sessionID: session.id });
            }
            break;
          case "permission.asked": {
            const approved = await input.requestConsent({
              action: event.data.action,
              resources: event.data.resources,
              message: event.data.message,
            });
            await host.permission.reply({
              sessionID: session.id,
              requestID: event.data.id,
              decision: approved ? "once" : "reject",
            });
            if (!approved) permissionDenied = true;
            break;
          }
          case "session.execution.failed":
            terminalError = previewToolContent(event.data.error);
            break;
          case "session.execution.succeeded":
          case "session.execution.interrupted":
            break;
        }
        if (
          event.type === "session.execution.succeeded" ||
          event.type === "session.execution.failed" ||
          event.type === "session.execution.interrupted"
        ) {
          break;
        }
        nextEvent = eventIterator.next();
      }
    } finally {
      input.abortSignal.removeEventListener("abort", abort);
      await eventIterator.return?.();
    }

    if (terminalError) {
      throw new OpenCodeRuntimeError(
        `OpenCode execution failed: ${terminalError}`,
        executedToolIDs.size === 0 && !permissionDenied,
      );
    }
    if (input.abortSignal.aborted && !interruptedAtStepLimit) {
      throw new OpenCodeRuntimeError("OpenCode execution was aborted", false);
    }

    const text = [...texts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, value]) => value.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const actionsTaken = [...actions.values()].slice(-20);
    const status = interruptedAtStepLimit || !text ? "partial" : "complete";
    const notes = interruptedAtStepLimit
      ? `OpenCode reached the ${input.maxSteps}-step limit.`
      : text
        ? "Subtask completed successfully with the OpenCode runtime."
        : "OpenCode completed without a final text summary.";

    return {
      text:
        text ||
        (actionsTaken.length > 0
          ? `OpenCode completed these tool actions:\n${actionsTaken
              .map(
                (action, index) =>
                  `${index + 1}. ${action.tool}: ${action.outputPreview ?? "completed"}`,
              )
              .join("\n")}`
          : "No outputs."),
      inputTokens,
      outputTokens,
      actionsTaken,
      status,
      notes,
    };
  } catch (error) {
    if (error instanceof OpenCodeRuntimeError) throw error;
    throw new OpenCodeRuntimeError(
      error instanceof Error ? error.message : String(error),
      executedToolIDs.size === 0 && !permissionDenied,
    );
  } finally {
    if (sessionID) await host.session.remove({ sessionID }).catch(() => undefined);
    releaseSlot(slot);
  }
}
