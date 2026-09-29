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
  const notice = "\n\n[context truncated to fit the sub-agent's context budget]";
  const keepChars = Math.max(0, maxTokens * 4 - notice.length);
  return content.slice(0, keepChars) + notice;
}

export function createAgentOrchestrator(deps: AgentOrchestratorDeps) {
  const spawnSubAgent = async (spec: SubAgentSpec): Promise<string> => {
    const requestedRole = (spec.role ?? "executor") as AgentRole;
    const role: AgentRole = (AGENT_ROLES as readonly string[]).includes(requestedRole)
      ? requestedRole
      : "executor";
    const budget = ROLE_BUDGETS[role] ?? ROLE_BUDGETS.executor;
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
      executionBudget: budget.executionBudget,
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
        agentTaskContext: {
          taskId,
          allowedFiles: spec.allowedFiles ?? null,
          allowedSymbols: null,
          agentRole: role,
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

      const result = streamText({
        headers: getAiHeaders({ builtinProviderId: roleClient.builtinProviderId }),
        maxOutputTokens: await getMaxOutputTokens(roleModel, deps.economyMode),
        temperature: await getTemperature(roleModel),
        providerOptions: roleClient.supportsCacheControl
          ? { anthropic: { cacheControl: { type: "ephemeral" as const } } }
          : undefined,
        maxRetries: 1,
        model: roleClient.model,
        stopWhen: [stepCountIs(budget.executionBudget)],
        system: [
          deps.getSystemPrompt(),
          "",
          "--- SUB-AGENT DIRECTIVES ---",
          `You are a sub-agent (role: ${role}) in Octopus Studio, working on one bounded subtask delegated by the main agent.`,
          `Do only this task and do not expand its scope. Read only what you need.`,
          `Minimize tool output: prefer a tool's compact mode over verbose output. For browser tools, read the page WITHOUT requesting full body text — the indexed interactive elements are enough to decide the next action; request body text only when you must read a specific value.`,
          ...(role === "executor" || role === "debugger"
            ? [
                "",
                "--- OFFICE TOOLS ---",
                "You have direct access to the Office document tools: create_document, create_spreadsheet, create_presentation, create_office_documents_batch, edit_document, edit_spreadsheet, edit_presentation, read_office_file, read_office_template. When your task involves creating or editing an Office file, use these tools directly — do NOT delegate again.",
                "To create a document, spreadsheet, or presentation: you can either use a pre-built template (call read_office_template to list templates and their [placeholders], then pass `template` and `values`), OR create custom-designed files directly (for DOCX pass `markdown`, `title`, or `blocks`; for PPTX pass `slides` with layouts like title/bullets/stats/table/split/quote/closing; for XLSX pass `csv`, `data`, or `sheets`). Both approaches produce beautifully styled, complete OOXML binary files.",
                "Always produce real OOXML binary files (.docx, .xlsx, .pptx), never raw HTML saved under a legacy .doc/.xls/.ppt extension.",
              ]
            : []),
          `Report your result compactly at the end.`,
        ].join("\n"),
        tools: allTools,
        messages: [
          {
            role: "user",
            content: limitContextTokens(
              description + (spec.context ? `\n\nContext:\n${spec.context}` : "") + resumeContext,
              budget.contextBudget,
            ),
          },
        ],
        abortSignal: deps.abortController.signal,
      });

      const text = await result.text;
      const steps = await result.steps;
      const usage = await result.totalUsage;
      let inputTokens = usage?.inputTokens ?? 0;
      let outputTokens = usage?.outputTokens ?? 0;

      for (const step of steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          if (tr.toolName === "spawn_subagent") {
            try {
              const env = JSON.parse(tr.output as string);
              if (typeof env.inputTokens === "number") inputTokens += env.inputTokens;
              if (typeof env.outputTokens === "number") outputTokens += env.outputTokens;
            } catch (e) {
              // ignore
            }
          }
        }
      }

      const costUsd = estimateAgentCostUsd(roleModel.name, inputTokens, outputTokens);
      // Action history (tool + args), capped to the most recent 20, so a follow-up
      // can resume instead of restarting, and the parent can see what was done.
      const actionsTaken = (steps ?? [])
        .flatMap((s) => (s.toolCalls ?? []).map((tc) => ({ tool: tc.toolName, input: tc.input })))
        .slice(-20);

      let status: "complete" | "partial" = "complete";
      let notes = "Subtask completed successfully.";
      let outputText = text;

      if (!outputText || outputText.trim() === "") {
        status = "partial";
        const toolNames =
          steps && steps.length > 0
            ? steps.flatMap((s) => s.toolCalls?.map((tc) => tc.toolName) || [])
            : [];
        if (toolNames.length > 0) {
          notes = `Sub-agent hit its step limit. Tools used: ${toolNames.join(", ")}.`;
          outputText = "Partial progress made. Check chat history for tool results.";
        } else {
          notes = "Sub-agent terminated without taking action.";
          outputText = "No outputs.";
        }
      }

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
    const subtasks = spec.subtasks || [];
    const completed = new Map<string, string>();
    const running = new Set<string>();
    const promises = new Map<string, Promise<string>>();

    const startTask = (task: any) => {
      const run = async (): Promise<string> => {
        try {
          const deps = (task.depends_on || [])
            .map((id: string) => `[${id}]: ${completed.get(id) ?? ""}`)
            .join("\n");
          const context = (task.context || "") + (deps ? `\n\nPrevious outputs:\n${deps}` : "");
          const resultStr = await spawnSubAgent({
            role: task.role,
            description: task.goal,
            context,
            allowedFiles: task.allowed_files,
          });
          completed.set(task.id, resultStr);
          return resultStr;
        } catch (e) {
          const blocked = JSON.stringify({
            status: "blocked",
            outputs: { error: String(e) },
          });
          completed.set(task.id, blocked);
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

    return JSON.stringify({
      status: completed.size === subtasks.length ? "complete" : "partial",
      outputs: Object.fromEntries(completed.entries()),
      notes: "DAG execution completed.",
    });
  };

  return { spawnSubAgent, planTaskGraph };
}
