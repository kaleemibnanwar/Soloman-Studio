import { desc, eq } from "drizzle-orm";
import { stepCountIs, streamText, type ToolSet } from "ai";
import log from "electron-log";
import type { IpcMainInvokeEvent } from "electron";

import type { ModelSelection, UserSettings } from "@/lib/schemas";

import { db } from "../../db";
import { agentArtifacts, agentEvents, agentTasks, mcpServers } from "../../db/schema";
import { uuidIdSource } from "../../state_machines/clock";

import { AGENT_ROLES, ROLE_BUDGETS, type AgentRole } from "./task_types";
import { getAgentModelTier, resolveAgentRoleModel } from "./role_model";
import { agentResultCache, agentResultCacheKey } from "./result_cache";
import { estimateAgentCostUsd } from "./pricing";
import { Semaphore } from "./semaphore";
import {
  buildBuiltinTools,
  toolResultCharBudget,
  truncateToolResult,
  type SubAgentSpec,
} from "./tools";

import { getModelClient, type ModelClient } from "../utils/get_model_client";
import { getAiHeaders } from "../utils/provider_options";
import { estimateTokens, getMaxOutputTokens, getTemperature } from "../utils/token_utils";
import { mcpManager } from "../mcp/mcp_manager";
import { buildMcpToolKey, sanitizeMcpName } from "../mcp/mcp_tool_utils";
import { requireAgentToolConsent } from "./agent_consent";
import { getMissionHitlPolicy, requestHitlApproval, shouldInterceptTool } from "./hitl_interceptor";
import {
  canUseOpenCodeRuntime,
  OpenCodeRuntimeError,
  runWithOpenCode,
} from "./runtime/opencode_runtime";

const logger = log.scope("agent-orchestrator");

// Bounded concurrency for sub-agents. Independent DAG nodes run in parallel up
// to this limit, bounding cost/rate pressure while always releasing cleanly.
const AGENT_SUBAGENT_CONCURRENCY = Math.max(
  1,
  Number(process.env.OCTOPUS_STUDIO_AGENT_CONCURRENCY ?? 3),
);
const subagentSemaphore = new Semaphore(AGENT_SUBAGENT_CONCURRENCY);

/**
 * Per-request values the orchestrator needs from the chat-stream handler. Every
 * statically-importable dependency (db, tool builder, model client factory,
 * semaphore, cache, pricing) lives at module scope; only these turn-scoped
 * values are injected.
 */
export interface AgentOrchestratorDeps {
  settings: UserSettings;
  selectedModel: ModelSelection;
  modelClient: ModelClient;
  economyMode: boolean;
  /** Lazily reads the (possibly still-being-assigned) system prompt. */
  getSystemPrompt: () => string;
  appPath: string;
  appId: number;
  chatId: number;
  chatMode: string;
  abortController: AbortController;
  event: IpcMainInvokeEvent;
}

/**
 * The sub-agent + task-graph execution engine (Octopus-Studio Implementation
 * Guide §13/§16). Extracted from the chat-stream handler so the orchestrator
 * owns its own state (DB rows, cache, semaphore) instead of living inside a
 * 3k-line handler.
 */
/**
 * Cap the dynamic sub-task context (goal + injected prior outputs) at the
 * role's `contextBudget`. The static system prompt + tool schemas are separate
 * and per-role-stable; this bounds only the variable part that can blow up when
 * a DAG node inherits large upstream results.
 */
function limitContextTokens(content: string, maxTokens: number): string {
  if (estimateTokens(content) <= maxTokens) return content;
  const notice = "\n\n[… context middle truncated to fit the sub-agent's context budget …]\n\n";
  const budgetChars = Math.max(0, maxTokens * 4 - notice.length);
  const headChars = Math.floor(budgetChars * 0.65);
  const tailChars = Math.max(0, budgetChars - headChars);
  return content.slice(0, headChars) + notice + content.slice(content.length - tailChars);
}

function summarizeToolOutput(output: unknown, maxChars = 400): string {
  const raw =
    typeof output === "string"
      ? output
      : output === undefined || output === null
        ? ""
        : JSON.stringify(output);
  const compact = raw.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}…`;
}

function buildSubAgentSystemPrompt({
  role,
  appPath,
  economyMode,
  hasOfficeTools,
}: {
  role: AgentRole;
  appPath: string;
  economyMode: boolean;
  hasOfficeTools: boolean;
}): string {
  const roleDirectives: Record<AgentRole, string> = {
    explorer:
      "Your job is fast, accurate codebase discovery. Use list_files, grep, code_search, and read_file (in parallel when reading multiple files) to locate exact files, symbols, and line numbers. Never guess or fabricate file contents.",
    executor:
      "Your job is to implement the requested changes completely and cleanly. Read target files before editing, use search_replace for targeted edits or write_file for new/full files, and verify your changes.",
    tester:
      "Your job is to verify behavior using type checks, sandbox scripts, and file inspection. Report concrete pass/fail evidence and exact error locations.",
    debugger:
      "Your job is root-cause diagnosis and surgical bug fixing. Inspect the relevant code, git diff/status, and type checks, apply the minimal fix, and verify it.",
    reviewer:
      "Your job is code review. Inspect the relevant files and diffs for bugs, regressions, security issues, or incomplete logic, and report concrete findings with file paths.",
    architect:
      "Your job is technical design. Inspect existing codebase conventions and module boundaries, then return a concise, grounded implementation plan with exact file paths.",
    verifier:
      "Your job is post-change verification. Check that all requested files/edits exist, run type checks or verification scripts, and confirm whether the task is truly complete.",
  };

  return [
    `You are a specialized ${role} sub-agent in Octopus Studio working on a single bounded subtask.`,
    `Workspace root: \`${appPath}\``,
    "",
    "--- CORE RULES ---",
    `- ${roleDirectives[role]}`,
    "- Stay strictly within the scope of your assigned subtask.",
    "- Ground every claim in actual tool outputs. NEVER hallucinate file paths, code snippets, or tool results, and never claim an edit was made unless the tool call succeeded.",
    "- Batch independent read/search tool calls in parallel to save steps.",
    "- Always reserve your final step to output a clear, compact summary of what you found or changed.",
    "- Minimize tool output: for browser/MCP tools, read the page WITHOUT requesting full body text unless a specific text value is required.",
    ...(hasOfficeTools
      ? [
          "",
          "--- OFFICE TOOLS ---",
          "You have direct access to the Office document tools: create_document, create_spreadsheet, create_presentation, create_office_documents_batch, edit_document, edit_spreadsheet, edit_presentation, read_office_file, read_office_template. Use them directly to produce real OOXML binary files (.docx, .xlsx, .pptx) — never delegate again or save raw HTML under .doc/.xls/.ppt.",
        ]
      : []),
    ...(economyMode
      ? [
          "",
          "--- ECONOMY MODE ---",
          "Be maximally concise. No preamble or filler — output only concrete findings, edits made, and verification status.",
        ]
      : []),
  ].join("\n");
}

export function createAgentOrchestrator(deps: AgentOrchestratorDeps) {
  const spawnSubAgent = async (spec: SubAgentSpec): Promise<string> => {
    const requestedRole = (spec.role ?? "executor") as AgentRole;
    const role: AgentRole = (AGENT_ROLES as readonly string[]).includes(requestedRole)
      ? requestedRole
      : "executor";
    const budget = ROLE_BUDGETS[role] ?? ROLE_BUDGETS.executor;
    const effectiveMaxSteps =
      spec.maxSteps !== undefined
        ? Math.min(Math.max(1, spec.maxSteps), 30)
        : budget.executionBudget;
    const taskId = uuidIdSource.next("agent-task");
    const description = spec.description;

    // Resolve the model tier up front so the persisted ledger records the actual
    // model the sub-agent ran on (fast = routerModel, strong = selectedModel).
    const roleModel = resolveAgentRoleModel({
      role,
      settings: deps.settings,
      selectedModel: deps.selectedModel,
    });
    const tier = getAgentModelTier(role);
    const cacheKey = agentResultCacheKey(role, description, spec.context);

    await db.insert(agentTasks).values({
      id: taskId,
      chatId: deps.chatId,
      description,
      role,
      dependencies: [],
      allowedFiles: spec.allowedFiles ?? null,
      allowedSymbols: null,
      contextBudget: budget.contextBudget,
      outputBudget: budget.outputBudget,
      executionBudget: effectiveMaxSteps,
      status: "running",
    });
    await db.insert(agentEvents).values({
      taskId,
      eventType: "started",
      payload: { role, description, model: roleModel.name, tier },
    });

    // Read-only roles short-circuit through the result cache: a repeated
    // read/analysis subtask skips the model entirely (token/cost win).
    if (tier === "fast") {
      const cached = agentResultCache.get(cacheKey);
      if (cached !== null) {
        await db
          .update(agentTasks)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(agentTasks.id, taskId));
        await db.insert(agentArtifacts).values({
          taskId,
          result: {
            status: "complete",
            cached: true,
            role,
            model: roleModel.name,
            tier,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            outputs: { result: cached },
            notes: "Served from the result cache (no model call).",
          },
        });
        await db.insert(agentEvents).values({
          taskId,
          eventType: "completed",
          payload: { cached: true },
        });
        return cached;
      }
    }

    const release = await subagentSemaphore.acquire();
    try {
      // Resolve the tier's model client. If it differs from the primary model,
      // resolve it through getModelClient so every provider (Ollama, DeepSeek,
      // GPT, Claude, Gemini, Vertex, Bedrock, LM Studio, custom) works.
      let roleClient = deps.modelClient;
      if (
        roleModel.provider !== deps.selectedModel.provider ||
        roleModel.name !== deps.selectedModel.name
      ) {
        try {
          const resolved = await getModelClient(roleModel, deps.settings);
          roleClient = resolved.modelClient;
        } catch (error) {
          logger.warn(
            `Failed to resolve ${tier} model for role ${role}; falling back to the primary model`,
            error,
          );
        }
      }

      const subTools = buildBuiltinTools({
        appPath: deps.appPath,
        appId: deps.appId,
        chatId: deps.chatId,
        chatMode: deps.chatMode,
        agentToolConsents: deps.settings.agentToolConsents,
        event: deps.event,
        prompt: `${description}\n${spec.context ?? ""}`,
        requestToolConsent: ({ abortSignal, ...consent }) =>
          requireAgentToolConsent(deps.event, {
            chatId: deps.chatId,
            ...consent,
            abortSignal: abortSignal ?? deps.abortController.signal,
          }),
        agentTaskContext: {
          taskId,
          allowedFiles: spec.allowedFiles ?? null,
          allowedSymbols: null,
          agentRole: role,
          toolAllowlist: spec.toolAllowlist ?? null,
          isSubAgent: true,
          missionSlug: spec.missionSlug,
          botName: spec.botName,
        },
      });

      // Load only the MCP servers this sub-agent requested (by name), so its
      // tool schema stays scoped to what the task needs instead of every enabled
      // server. This is the "load MCPs only when required" path — the main agent
      // never loads MCP tools; it delegates here via `spawn_subagent(mcp_servers)`.
      let allTools: ToolSet = subTools;
      const mcpCallHistory: { name: string; args: string }[] = [];
      const requestedMcpServers = Array.isArray(spec.mcpServers) ? spec.mcpServers : [];
      if (requestedMcpServers.length > 0) {
        const requested = new Set(requestedMcpServers.map((name: string) => name.toLowerCase()));
        try {
          const servers = await db.select().from(mcpServers).where(eq(mcpServers.enabled, true));
          for (const server of servers) {
            if (!requested.has(server.name.toLowerCase())) continue;
            try {
              const client = await mcpManager.getClient(server.id);
              const mcpToolDefs = await client.tools();
              if (mcpToolDefs) {
                const safeServerName = sanitizeMcpName(server.name);
                allTools = { ...allTools };
                for (const [toolName, toolDef] of Object.entries(mcpToolDefs)) {
                  const wrapped = { ...toolDef };
                  if (wrapped.execute) {
                    const originalExecute = wrapped.execute;
                    wrapped.execute = (async (args: any, options?: any) => {
                      const argsStr = JSON.stringify(args);
                      const repeats = mcpCallHistory.filter(
                        (c) => c.name === toolName && c.args === argsStr,
                      ).length;
                      if (repeats >= 3) {
                        return `WARNING: you have already called ${toolName} with these exact arguments ${repeats} times. Stop repeating and either try a different action or report your current state.`;
                      }
                      mcpCallHistory.push({ name: toolName, args: argsStr });
                      const interception = shouldInterceptTool(
                        toolName,
                        args as Record<string, unknown>,
                        spec.missionSlug
                          ? getMissionHitlPolicy(deps.appPath, spec.missionSlug)
                          : undefined,
                      );
                      if (interception.shouldBlock && spec.missionSlug) {
                        const approval = await requestHitlApproval({
                          projectPath: deps.appPath,
                          missionSlug: spec.missionSlug,
                          requestingBot: spec.botName ?? role,
                          toolName,
                          args: args as Record<string, unknown>,
                          summary: `${spec.botName ?? role} requested ${interception.category}.`,
                        });
                        if (!approval.approved) {
                          return `BLOCKED: ${approval.reason ?? "The user rejected this action."}`;
                        }
                      }
                      return truncateToolResult(
                        await originalExecute(args, options),
                        toolResultCharBudget(budget.contextBudget),
                        false, // MCP results (browser page dumps) keep the head, drop the body text
                      );
                    }) as typeof originalExecute;
                  }
                  allTools[buildMcpToolKey(safeServerName, toolName)] = wrapped;
                }
              }
            } catch (e) {
              logger.warn(`Failed to fetch MCP tools for server ${server.name}`, e);
            }
          }
        } catch (e) {
          logger.warn("Failed to fetch MCP servers for sub-agent", e);
        }
      }

      // Resume: load a prior sub-task's action history and inject it so this run
      // continues instead of restarting from zero (the state-loss-on-respawn fix).
      let resumeContext = "";
      if (spec.resumeFromTaskId) {
        try {
          const prior = await db
            .select()
            .from(agentArtifacts)
            .where(eq(agentArtifacts.taskId, spec.resumeFromTaskId))
            .orderBy(desc(agentArtifacts.id))
            .limit(1);
          const actions = prior[0]?.result?.actionsTaken;
          if (Array.isArray(actions) && actions.length > 0) {
            resumeContext = `\n\n[RESUMING prior sub-task ${spec.resumeFromTaskId}. These actions were ALREADY taken — do NOT repeat them. External state (browser/DB/files) is still exactly as it was left.]\n${JSON.stringify(actions, null, 2)}`;
          }
        } catch (e) {
          logger.warn(`Failed to load resume state for ${spec.resumeFromTaskId}`, e);
        }
      }

      const hasOfficeTools = "create_document" in allTools;
      const subAgentSystemPrompt = buildSubAgentSystemPrompt({
        role,
        appPath: deps.appPath,
        economyMode: deps.economyMode,
        hasOfficeTools,
      });

      const boundedContext = spec.context
        ? `\n\nContext:\n${limitContextTokens(spec.context, budget.contextBudget)}`
        : "";
      const userMessageContent = `${description}${boundedContext}${resumeContext}`;

      const maxOutputTokens = Math.min(
        budget.outputBudget,
        (await getMaxOutputTokens(roleModel, deps.economyMode)) ?? budget.outputBudget,
      );
      const temperature = await getTemperature(roleModel);
      const headers = getAiHeaders({ builtinProviderId: roleClient.builtinProviderId });
      const providerOptions = roleClient.supportsCacheControl
        ? { anthropic: { cacheControl: { type: "ephemeral" as const } } }
        : undefined;

      let inputTokens = 0;
      let outputTokens = 0;
      let outputText = "";
      let status: "complete" | "partial" = "complete";
      let notes = "Subtask completed successfully.";
      let actionsTaken: Array<{ tool: string; input: unknown; outputPreview?: string }> = [];

      const useOpenCode = canUseOpenCodeRuntime({
        model: roleClient.model,
        requestedMcpServers,
        toolAllowlist: spec.toolAllowlist,
      });
      if (useOpenCode) {
        try {
          const openCodeResult = await runWithOpenCode({
            model: roleClient.model,
            role,
            workspacePath: deps.appPath,
            systemPrompt: subAgentSystemPrompt,
            prompt: userMessageContent,
            maxSteps: effectiveMaxSteps,
            maxOutputTokens,
            temperature,
            headers,
            providerOptions,
            allowedFiles: spec.allowedFiles,
            abortSignal: deps.abortController.signal,
            requestConsent: ({ action, resources, message }) =>
              requireAgentToolConsent(deps.event, {
                chatId: deps.chatId,
                toolName: `opencode:${action}`,
                toolDescription: message ?? `Allow OpenCode to perform ${action}`,
                inputPreview: resources.join("\n"),
                abortSignal: deps.abortController.signal,
              }),
          });
          inputTokens = openCodeResult.inputTokens;
          outputTokens = openCodeResult.outputTokens;
          outputText = openCodeResult.text;
          status = openCodeResult.status;
          notes = openCodeResult.notes;
          actionsTaken = openCodeResult.actionsTaken;
        } catch (error) {
          if (!(error instanceof OpenCodeRuntimeError) || !error.safeToFallback) throw error;
          logger.warn("OpenCode failed before executing a tool; using the legacy runtime", error);
        }
      }

      if (!outputText) {
        const result = streamText({
          headers,
          maxOutputTokens,
          temperature,
          providerOptions,
          maxRetries: 1,
          model: roleClient.model,
          stopWhen: [stepCountIs(effectiveMaxSteps)],
          system: subAgentSystemPrompt,
          tools: allTools,
          messages: [{ role: "user", content: userMessageContent }],
          abortSignal: deps.abortController.signal,
        });

        const text = await result.text;
        const steps = await result.steps;
        const usage = await result.totalUsage;
        inputTokens = usage?.inputTokens ?? 0;
        outputTokens = usage?.outputTokens ?? 0;

        for (const step of steps ?? []) {
          for (const tr of step.toolResults ?? []) {
            if (tr.toolName === "spawn_subagent" || tr.toolName === "plan_task_graph") {
              try {
                const env = JSON.parse(tr.output as string);
                if (typeof env.inputTokens === "number") inputTokens += env.inputTokens;
                if (typeof env.outputTokens === "number") outputTokens += env.outputTokens;
              } catch {
                // An invalid nested envelope is already represented in its tool output.
              }
            }
          }
        }

        actionsTaken = (steps ?? [])
          .flatMap((s) => {
            const resultsByCallId = new Map(
              (s.toolResults ?? []).map((tr) => [tr.toolCallId, tr.output]),
            );
            return (s.toolCalls ?? []).map((tc) => {
              const output = resultsByCallId.get(tc.toolCallId);
              return {
                tool: tc.toolName,
                input: tc.input,
                ...(output !== undefined
                  ? { outputPreview: summarizeToolOutput(output, 350) }
                  : {}),
              };
            });
          })
          .slice(-20);

        const stepTexts = (steps ?? [])
          .map((s) => s.text?.trim())
          .filter((value): value is string => Boolean(value));
        outputText = (text?.trim() || stepTexts.join("\n\n")).trim();

        if (!outputText) {
          status = "partial";
          const toolNames =
            steps && steps.length > 0
              ? steps.flatMap((s) => s.toolCalls?.map((tc) => tc.toolName) || [])
              : [];
          if (toolNames.length > 0) {
            notes = `Sub-agent reached its step limit (${effectiveMaxSteps} steps). Tools used: ${toolNames.join(", ")}.`;
            const recentOutputs = actionsTaken
              .slice(-8)
              .map(
                (action, index) =>
                  `${index + 1}. ${action.tool}(${summarizeToolOutput(action.input, 120)}) -> ${action.outputPreview ?? "completed"}`,
              )
              .join("\n");
            outputText = `Sub-agent reached step limit (${effectiveMaxSteps}) before writing a final summary. Completed tool actions:\n${recentOutputs}`;
          } else {
            notes = "Sub-agent terminated without taking action.";
            outputText = "No outputs.";
          }
        }
      }

      const costUsd = estimateAgentCostUsd(roleModel.name, inputTokens, outputTokens);

      const dbStatus = status === "complete" ? "completed" : "partial";

      await db
        .update(agentTasks)
        .set({ status: dbStatus, updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
      await db.insert(agentArtifacts).values({
        taskId,
        result: {
          status,
          role,
          model: roleModel.name,
          tier,
          inputTokens,
          outputTokens,
          costUsd,
          outputs: { result: outputText },
          notes,
          actionsTaken,
        },
      });
      await db.insert(agentEvents).values({
        taskId,
        eventType: status === "complete" ? "completed" : "partial",
        payload: { inputTokens, outputTokens, costUsd },
      });

      const envelope = JSON.stringify({
        taskId,
        status,
        outputs: { result: outputText },
        notes,
        model: roleModel.name,
        tier,
        inputTokens,
        outputTokens,
        costUsd,
        // Only attach the action history when the run didn't complete: that's
        // the only time the parent needs it (to resume / debug). On success the
        // result text already summarizes, so carrying it would bloat the parent's
        // context for nothing.
        ...(status !== "complete" ? { actionsTaken } : {}),
      });

      if (tier === "fast" && status === "complete") {
        agentResultCache.set(cacheKey, envelope);
      }
      return envelope;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(agentTasks)
        .set({ status: "blocked", updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
      await db.insert(agentArtifacts).values({
        taskId,
        result: {
          status: "blocked",
          role,
          model: roleModel.name,
          tier,
          outputs: { error: message },
          notes: "Sub-agent crashed or errored.",
        },
      });
      await db.insert(agentEvents).values({
        taskId,
        eventType: "failed",
        payload: { error: message },
      });
      return JSON.stringify({
        status: "blocked",
        outputs: { error: message },
        notes: "Sub-agent crashed or errored.",
        model: roleModel.name,
        tier,
      });
    } finally {
      release();
    }
  };

  const planTaskGraph = async (spec: any): Promise<string> => {
    const subtasks = Array.isArray(spec?.subtasks) ? spec.subtasks : [];
    const completed = new Map<string, string>();
    const parsedStatuses = new Map<string, "complete" | "partial" | "blocked">();
    const unwrappedOutputs = new Map<string, string>();
    const running = new Set<string>();
    const promises = new Map<string, Promise<string>>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    const recordTaskEnvelope = (id: string, envelopeStr: string) => {
      completed.set(id, envelopeStr);
      try {
        const parsed = JSON.parse(envelopeStr);
        const st =
          parsed?.status === "blocked"
            ? "blocked"
            : parsed?.status === "partial"
              ? "partial"
              : "complete";
        parsedStatuses.set(id, st);
        const textOut =
          typeof parsed?.outputs?.result === "string"
            ? parsed.outputs.result
            : typeof parsed?.outputs?.error === "string"
              ? `ERROR: ${parsed.outputs.error}`
              : envelopeStr;
        unwrappedOutputs.set(id, textOut);
        if (typeof parsed?.inputTokens === "number") totalInputTokens += parsed.inputTokens;
        if (typeof parsed?.outputTokens === "number") totalOutputTokens += parsed.outputTokens;
        if (typeof parsed?.costUsd === "number") totalCostUsd += parsed.costUsd;
      } catch {
        parsedStatuses.set(id, "complete");
        unwrappedOutputs.set(id, envelopeStr);
      }
    };

    const startTask = (task: any) => {
      const run = async (): Promise<string> => {
        try {
          const depIds: string[] = Array.isArray(task.depends_on) ? task.depends_on : [];
          const blockedDep = depIds.find((id) => parsedStatuses.get(id) === "blocked");
          if (blockedDep) {
            const skipped = JSON.stringify({
              status: "blocked",
              outputs: {
                error: `Skipped "${task.id}" because upstream dependency "${blockedDep}" was blocked.`,
              },
              notes: `Blocked by upstream dependency "${blockedDep}".`,
            });
            recordTaskEnvelope(task.id, skipped);
            return skipped;
          }

          const depsContext = depIds
            .map((id: string) => `[${id}]: ${unwrappedOutputs.get(id) ?? completed.get(id) ?? ""}`)
            .join("\n\n");
          const context =
            (task.context || "") + (depsContext ? `\n\nPrevious outputs:\n${depsContext}` : "");
          const resultStr = await spawnSubAgent({
            role: task.role,
            description: task.goal ?? task.description ?? "",
            context,
            allowedFiles: task.allowed_files,
            toolAllowlist: task.tool_allowlist,
            maxSteps: task.max_steps,
          });
          recordTaskEnvelope(task.id, resultStr);
          return resultStr;
        } catch (e) {
          const blocked = JSON.stringify({
            status: "blocked",
            outputs: { error: String(e) },
          });
          recordTaskEnvelope(task.id, blocked);
          return blocked;
        } finally {
          running.delete(task.id);
        }
      };
      const p = run();
      promises.set(task.id, p);
      running.add(task.id);
    };

    const isReady = (task: any) =>
      !completed.has(task.id) &&
      !running.has(task.id) &&
      (task.depends_on || []).every((id: string) => completed.has(id));

    // Deterministic parallel scheduler: start every ready node (the sub-agent
    // semaphore bounds actual concurrency), then wait for one to finish before
    // re-scanning. Breaks on a dependency cycle.
    while (completed.size < subtasks.length) {
      for (const task of subtasks) {
        if (isReady(task)) startTask(task);
      }
      const inFlight = Array.from(promises.entries())
        .filter(([id]) => running.has(id))
        .map(([, p]) => p);
      if (inFlight.length === 0) break; // cycle or all settled
      await Promise.race(inFlight);
    }

    const anyBlocked = [...parsedStatuses.values()].some((s) => s === "blocked");
    const anyPartial = [...parsedStatuses.values()].some((s) => s === "partial");
    const overallStatus =
      completed.size < subtasks.length || anyBlocked
        ? anyBlocked && completed.size === subtasks.length
          ? "partial"
          : "partial"
        : anyPartial
          ? "partial"
          : "complete";

    return JSON.stringify({
      status: overallStatus,
      outputs: Object.fromEntries(unwrappedOutputs.entries()),
      rawEnvelopes: Object.fromEntries(completed.entries()),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: Math.round(totalCostUsd * 10_000) / 10_000,
      notes:
        overallStatus === "complete"
          ? "DAG execution completed."
          : "DAG execution finished with partial or blocked subtasks.",
    });
  };

  return { spawnSubAgent, planTaskGraph };
}
