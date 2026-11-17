import { randomUUID } from "node:crypto";
import { spawn as spawnPty, type IPty } from "node-pty";
import { BrowserWindow } from "electron";
import log from "electron-log";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apps,
  chats,
  messages,
  language_models,
  language_model_providers,
  plannerTasks,
  tasks,
} from "@/db/schema";
import { runTask } from "@/ipc/services/task_scheduler";
import { readSettings, writeSettings } from "../settings";
import { executeChatStreamFromActor } from "@/ipc/handlers/chat_stream_handlers";
import type { ChatResponseChunk } from "@/ipc/types/chat";
import { computeChatTurnPayloadHash } from "@/ipc/utils/chat_turn_intent_hash";
import { createChatForApp } from "@/ipc/utils/chat_creation_utils";
import { publishQueryInvalidations } from "@/ipc/utils/query_invalidation_delivery";
import { handleIncomingApprovalResponse } from "@/ipc/agent/hitl_interceptor";
import type { SerializableChatTurnIntent } from "@/chat_stream/transport";
import type {
  ApplicationMessage,
  ChatPromptRequest,
  ChatResponseChunkStream,
  ChatResponseEndStream,
  SessionHelloRequest,
  SessionReadyResponse,
} from "./types";

const logger = log.scope("soloman-local-engine");

export type StreamChunkCallback = (chunk: ApplicationMessage) => Promise<void>;

export type CustomPromptHandler = (
  req: ChatPromptRequest,
  emitChunk: StreamChunkCallback,
) => Promise<void>;

export class LocalEngine {
  private readonly remoteTerminalSessions = new Map<string, IPty>();
  private customPromptHandler: CustomPromptHandler | null = null;
  private hostDeviceId: string;
  private inMemoryScheduledTasks: any[] = [];

  constructor(hostDeviceId: string) {
    this.hostDeviceId = hostDeviceId;
  }

  public setHostDeviceId(id: string): void {
    this.hostDeviceId = id;
  }

  /**
   * Allows injecting a custom agent runtime or mock executor for tests/custom plugins
   */
  public setCustomPromptHandler(handler: CustomPromptHandler | null): void {
    this.customPromptHandler = handler;
  }

  /**
   * Handles an incoming decrypted application message.
   * If it's a chat prompt, streams chunks via emitChunk.
   */
  public async handleMessage(
    message: ApplicationMessage,
    emitChunk: StreamChunkCallback,
  ): Promise<ApplicationMessage | null> {
    logger.info(`LocalEngine handling messageType: ${message.messageType}`, {
      messageId: message.messageId,
      kind: message.kind,
    });

    if (message.messageType === "session.hello") {
      const helloReq = message as SessionHelloRequest;
      const readyResp: SessionReadyResponse = {
        protocolVersion: 1,
        kind: "response",
        messageId: randomUUID(),
        correlationId: helloReq.messageId,
        messageType: "session.ready",
        sentAt: new Date().toISOString(),
        payload: {
          status: "ready",
          hostDeviceId: this.hostDeviceId,
        },
      };
      return readyResp;
    }

    if (message.messageType === "chat.prompt") {
      const promptReq = message as ChatPromptRequest;
      await this.executePrompt(promptReq, emitChunk);
      return null;
    }

    if (message.messageType === "approval.respond") {
      const payload = message.payload as {
        approvalId?: string;
        decision?: "approved" | "rejected";
        feedback?: string;
      };
      if (!payload.approvalId || !payload.decision) {
        throw new Error("Invalid approval response");
      }
      handleIncomingApprovalResponse(payload.approvalId, payload.decision, payload.feedback);
      return null;
    }

    if (message.messageType === "desktop.snapshot.request") {
      return this.getDesktopSnapshot(message);
    }

    if (message.messageType === "chat.history.request") {
      return this.getChatHistory(message);
    }

    if (message.messageType === "chat.create.request") {
      return this.createChat(message);
    }

    if (
      message.messageType === "chat.model.update" ||
      message.messageType === "desktop.model.update"
    ) {
      return this.updateChatModel(message);
    }

    if (message.messageType === "chat.mode.update") {
      return this.updateChatMode(message);
    }

    if (message.messageType === "terminal.exec") {
      await this.executeTerminalCommand(message, emitChunk);
      return null;
    }

    if (
      message.messageType === "task.schedule.create" ||
      message.messageType === "scheduled_task.create"
    ) {
      return this.createScheduledTask(message);
    }

    if (message.messageType === "planner.task.create") {
      return this.createPlannerTask(message);
    }

    if (message.messageType === "planner.task.update") {
      return this.updatePlannerTask(message);
    }

    if (message.messageType === "planner.task.delete") {
      return this.deletePlannerTask(message);
    }

    if (
      message.messageType === "task.schedule.update" ||
      message.messageType === "scheduled_task.update"
    ) {
      return this.updateScheduledTask(message);
    }

    if (
      message.messageType === "task.schedule.delete" ||
      message.messageType === "scheduled_task.delete"
    ) {
      return this.deleteScheduledTask(message);
    }

    if (
      message.messageType === "task.schedule.run_now" ||
      message.messageType === "scheduled_task.run_now"
    ) {
      return this.runScheduledTask(message);
    }

    if (
      message.messageType === "task.schedule.list" ||
      message.messageType === "scheduled_task.list"
    ) {
      return this.listScheduledTasks(message);
    }

    logger.warn(`Unhandled application messageType: ${message.messageType}`);
    return null;
  }

  private async getDesktopSnapshot(request: ApplicationMessage): Promise<ApplicationMessage> {
    const currentDesktopSettings = readSettings();
    const [projectRows, chatRows, customModelsDb, customProvidersDb, dbTasks, plannerTaskRows] =
      await Promise.all([
        db.query.apps.findMany({
          columns: {
            id: true,
            name: true,
            type: true,
            path: true,
            directory: true,
            githubBranch: true,
            previewUrl: true,
            isFavorite: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [desc(apps.updatedAt)],
        }),
        db.query.chats.findMany({
          columns: {
            id: true,
            appId: true,
            title: true,
            createdAt: true,
            chatMode: true,
            modelSelection: true,
            isFavorite: true,
          },
          with: { messages: { columns: { id: true } } },
          orderBy: [desc(chats.createdAt)],
          limit: 500,
        }),
        db.select().from(language_models),
        db.select().from(language_model_providers),
        db.query.tasks.findMany({
          orderBy: [desc(tasks.createdAt)],
          limit: 100,
        }),
        db.query.plannerTasks.findMany({
          orderBy: [desc(plannerTasks.updatedAt)],
          limit: 500,
        }),
      ]);

    const providerSettings = (currentDesktopSettings.providerSettings ?? {}) as Record<string, any>;

    // Filter custom models: only include if the custom provider is active, configured, and not a dead proxy
    const activeCustomProviders = new Set<string>();
    for (const cp of customProvidersDb) {
      if (cp.id === "custom::anitygravity" || cp.api_base_url?.includes("127.0.0.1:8045")) {
        continue; // Skip offline/dead proxy
      }
      const hasKey = Boolean(providerSettings[cp.id]?.apiKey?.value);
      const hasBaseUrl = Boolean(cp.api_base_url);
      if (hasKey || hasBaseUrl) {
        activeCustomProviders.add(cp.id);
      }
    }

    const customModelItems = customModelsDb
      .filter((m) => {
        const provId = m.customProviderId || m.builtinProviderId || "";
        return (
          activeCustomProviders.has(provId) || Boolean(providerSettings[provId]?.apiKey?.value)
        );
      })
      .map((m) => ({
        id: m.apiName,
        name: m.displayName || m.apiName,
        provider: m.customProviderId || m.builtinProviderId || "custom",
        customModelId: m.id,
        tag: "Desktop Custom",
        description: `Configured in Octopus Studio via ${m.customProviderId?.replace("custom::", "") || "desktop"}`,
      }));

    // Built-in models: ONLY include if the provider is actually configured with an API key in Octopus Studio
    const builtinModels: {
      id: string;
      name: string;
      provider: string;
      tag?: string;
      description?: string;
      customModelId?: number;
    }[] = [];

    const isGoogleConfigured = Boolean(
      providerSettings.google?.apiKey?.value || process.env.GEMINI_API_KEY,
    );
    if (isGoogleConfigured) {
      builtinModels.push(
        {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          provider: "google",
          tag: "Fast",
          description: "Sub-second speed",
        },
        {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          provider: "google",
          tag: "2M Context",
          description: "Massive context & high reasoning",
        },
        {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          provider: "google",
          tag: "Multimodal",
          description: "Next-gen multimodal",
        },
      );
    }

    const isDeepSeekConfigured = Boolean(
      providerSettings.deepseek?.apiKey?.value || process.env.DEEPSEEK_API_KEY,
    );
    if (isDeepSeekConfigured) {
      builtinModels.push(
        {
          id: "deepseek-chat",
          name: "DeepSeek V3",
          provider: "deepseek",
          tag: "Coding",
          description: "General & code generation",
        },
        {
          id: "deepseek-reasoner",
          name: "DeepSeek R1",
          provider: "deepseek",
          tag: "Reasoning",
          description: "Open reasoning model",
        },
      );
    }

    const isAnthropicConfigured = Boolean(
      providerSettings.anthropic?.apiKey?.value || process.env.ANTHROPIC_API_KEY,
    );
    if (isAnthropicConfigured) {
      builtinModels.push(
        {
          id: "claude-3-7-sonnet",
          name: "Claude 3.7 Sonnet",
          provider: "anthropic",
          tag: "Recommended",
          description: "Hybrid reasoning & expert coding",
        },
        {
          id: "claude-3-5-sonnet-20241022",
          name: "Claude 3.5 Sonnet",
          provider: "anthropic",
          tag: "Reliable",
          description: "High coding accuracy",
        },
        {
          id: "claude-3-5-haiku",
          name: "Claude 3.5 Haiku",
          provider: "anthropic",
          tag: "Fast",
          description: "Ultra-low latency",
        },
      );
    }

    const isOpenAIConfigured = Boolean(
      providerSettings.openai?.apiKey?.value || process.env.OPENAI_API_KEY,
    );
    if (isOpenAIConfigured) {
      builtinModels.push(
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          tag: "Smart",
          description: "Omni multimodal model",
        },
        {
          id: "o3-mini",
          name: "o3-mini",
          provider: "openai",
          tag: "Reasoning",
          description: "High-reasoning STEM & math",
        },
      );
    }

    const isAutoConfigured = Boolean(providerSettings.auto?.apiKey?.value);
    if (isAutoConfigured) {
      builtinModels.push({
        id: "auto",
        name: "Auto Router",
        provider: "auto",
        tag: "Auto",
        description: "Routes based on complexity",
      });
    }

    let availableModels = [...customModelItems, ...builtinModels];

    // Ensure currently selected desktop model is present in the list if configured
    if (
      currentDesktopSettings.selectedModel?.name &&
      !availableModels.some((m) => m.id === currentDesktopSettings.selectedModel?.name)
    ) {
      availableModels.unshift({
        id: currentDesktopSettings.selectedModel.name,
        name: currentDesktopSettings.selectedModel.name,
        provider: currentDesktopSettings.selectedModel.provider || "desktop",
        customModelId: (currentDesktopSettings.selectedModel as any)?.customModelId,
        tag: "Active Default",
        description: "Currently active default model in Octopus Studio",
      });
    }

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "desktop.snapshot",
      sentAt: new Date().toISOString(),
      payload: {
        generatedAt: new Date().toISOString(),
        currentDesktopModel: {
          name: currentDesktopSettings.selectedModel?.name,
          provider: currentDesktopSettings.selectedModel?.provider,
          customModelId: currentDesktopSettings.selectedModel?.customModelId,
        },
        currentDesktopMode:
          currentDesktopSettings.selectedChatMode === "ask"
            ? "ask"
            : currentDesktopSettings.selectedChatMode === "plan"
              ? "plan"
              : currentDesktopSettings.selectedChatMode === "build"
                ? "build"
                : "agent",
        projects: projectRows.map((project) => ({
          id: `app_${project.id}`,
          name: project.name,
          type: project.type,
          path: project.type === "chat" ? (project.directory ?? "") : project.path,
          branch: project.githubBranch ?? "main",
          status: "idle",
          devServerUrl: `https://soloman.si/api/v1/preview/${this.hostDeviceId}/${project.id}/`,
          isFavorite: project.isFavorite,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        })),
        chats: chatRows.map((chat) => {
          const selection = chat.modelSelection as {
            model?: string;
            name?: string;
            provider?: string;
          } | null;
          return {
            id: `chat_${chat.id}`,
            workspaceId: `app_${chat.appId}`,
            title: chat.title?.trim() || "Untitled chat",
            createdAt: chat.createdAt.toISOString(),
            updatedAt: chat.createdAt.toISOString(),
            messageCount: chat.messages.length,
            model: selection?.model ?? selection?.name ?? "desktop default",
            provider: selection?.provider,
            mode:
              chat.chatMode === "ask"
                ? "ask"
                : chat.chatMode === "plan"
                  ? "plan"
                  : chat.chatMode === "build"
                    ? "build"
                    : "agent",
            isFavorite: chat.isFavorite,
          };
        }),
        availableModels,
        plannerTasks: plannerTaskRows.map((task) => ({
          id: task.id,
          workspaceId: task.appId === null ? null : `app_${task.appId}`,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
          position: task.position,
          updatedAt: task.updatedAt.toISOString(),
        })),
        scheduledTasks: dbTasks.map((t) => ({
          id: `task_${t.id}`,
          taskId: t.id,
          chatId: t.lastChatId
            ? `chat_${t.lastChatId}`
            : t.projectId
              ? `app_${t.projectId}`
              : `task_${t.id}`,
          title: t.title,
          description: t.prompt,
          prompt: t.prompt,
          role: "autonomous-engineer",
          status: (t.enabled ? (t.lastRunAt ? "completed" : "scheduled") : "scheduled") as
            | "completed"
            | "running"
            | "scheduled",
          enabled: Boolean(t.enabled),
          scheduleMinutes: t.scheduleMinutes,
          workspaceId: t.projectId ? `app_${t.projectId}` : undefined,
          createdAt:
            t.createdAt instanceof Date
              ? Math.floor(t.createdAt.getTime() / 1000)
              : typeof t.createdAt === "number"
                ? t.createdAt
                : Math.floor(Date.now() / 1000),
          completedAt:
            t.lastRunAt instanceof Date
              ? Math.floor(t.lastRunAt.getTime() / 1000)
              : typeof t.lastRunAt === "number"
                ? t.lastRunAt
                : null,
          lastRunAt:
            t.lastRunAt instanceof Date
              ? Math.floor(t.lastRunAt.getTime() / 1000)
              : typeof t.lastRunAt === "number"
                ? t.lastRunAt
                : null,
        })),
      },
    };
  }

  private async createPlannerTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      title?: string;
      description?: string;
      workspaceId?: string | null;
      status?: "backlog" | "todo" | "in_progress" | "done";
      priority?: "low" | "medium" | "high";
      dueAt?: string | null;
    };
    const title = payload.title?.trim() ?? "";
    if (!title || title.length > 180) throw new Error("Task title must be 1–180 characters");
    if ((payload.description?.length ?? 0) > 8_000) throw new Error("Task details are too long");

    let appId: number | null = null;
    if (payload.workspaceId) {
      const match = payload.workspaceId.match(/^app_(\d+)$/);
      if (!match) throw new Error("Invalid planner project");
      appId = Number(match[1]);
      const project = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
        columns: { id: true },
      });
      if (!project) throw new Error("Planner project not found");
    }

    const status = payload.status ?? "todo";
    const priority = payload.priority ?? "medium";
    const dueAt = payload.dueAt ? new Date(payload.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid planner deadline");
    const appPredicate =
      appId === null ? isNull(plannerTasks.appId) : eq(plannerTasks.appId, appId);
    const [{ nextPosition }] = await db
      .select({ nextPosition: sql<number>`coalesce(max(${plannerTasks.position}), -1) + 1` })
      .from(plannerTasks)
      .where(and(appPredicate, eq(plannerTasks.status, status)));
    const [created] = await db
      .insert(plannerTasks)
      .values({
        appId,
        title,
        description: payload.description?.trim() ?? "",
        status,
        priority,
        dueAt,
        position: Number(nextPosition),
      })
      .returning();
    publishQueryInvalidations([{ family: "planner" }]);

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "planner.task.created",
      sentAt: new Date().toISOString(),
      payload: {
        id: created.id,
        workspaceId: created.appId === null ? null : `app_${created.appId}`,
        title: created.title,
        description: created.description,
        status: created.status,
        priority: created.priority,
        dueAt: created.dueAt?.toISOString() ?? null,
        position: created.position,
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  private async updatePlannerTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      taskId?: number;
      status?: "backlog" | "todo" | "in_progress" | "done";
      position?: number;
      priority?: "low" | "medium" | "high";
      title?: string;
      description?: string;
      dueAt?: string | null;
      workspaceId?: string | null;
    };
    if (!payload.taskId || !Number.isInteger(payload.taskId)) {
      throw new Error("Invalid planner task id");
    }
    const existing = await db.query.plannerTasks.findFirst({
      where: eq(plannerTasks.id, payload.taskId),
    });
    if (!existing) throw new Error("Planner task not found");

    const status = payload.status ?? existing.status;
    if (!["backlog", "todo", "in_progress", "done"].includes(status)) {
      throw new Error("Invalid planner status");
    }

    let appId = existing.appId;
    if (payload.workspaceId !== undefined) {
      if (payload.workspaceId === null) {
        appId = null;
      } else {
        const match = payload.workspaceId.match(/^app_(\d+)$/);
        if (!match) throw new Error("Invalid planner project");
        const numericAppId = Number(match[1]);
        const project = await db.query.apps.findFirst({
          where: eq(apps.id, numericAppId),
          columns: { id: true },
        });
        if (!project) throw new Error("Planner project not found");
        appId = numericAppId;
      }
    }

    let position = payload.position;
    if (position === undefined) {
      const appPredicate =
        appId === null ? isNull(plannerTasks.appId) : eq(plannerTasks.appId, appId);
      const [{ nextPosition }] = await db
        .select({ nextPosition: sql<number>`coalesce(max(${plannerTasks.position}), -1) + 1` })
        .from(plannerTasks)
        .where(and(appPredicate, eq(plannerTasks.status, status)));
      position = Number(nextPosition);
    }

    const dueAt =
      payload.dueAt === undefined ? existing.dueAt : payload.dueAt ? new Date(payload.dueAt) : null;

    const [updated] = await db
      .update(plannerTasks)
      .set({
        appId,
        status,
        position,
        priority: payload.priority ?? existing.priority,
        title: payload.title?.trim() || existing.title,
        description:
          payload.description === undefined ? existing.description : payload.description.trim(),
        dueAt,
        updatedAt: new Date(),
      })
      .where(eq(plannerTasks.id, payload.taskId))
      .returning();
    publishQueryInvalidations([{ family: "planner" }]);

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "planner.task.updated",
      sentAt: new Date().toISOString(),
      payload: {
        id: updated.id,
        workspaceId: updated.appId === null ? null : `app_${updated.appId}`,
        title: updated.title,
        description: updated.description,
        status: updated.status,
        priority: updated.priority,
        dueAt: updated.dueAt?.toISOString() ?? null,
        position: updated.position,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  private async deletePlannerTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const taskId = Number((request.payload as { taskId?: number })?.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) throw new Error("Invalid planner task id");
    const deleted = await db
      .delete(plannerTasks)
      .where(eq(plannerTasks.id, taskId))
      .returning({ id: plannerTasks.id });
    if (deleted.length === 0) throw new Error("Planner task not found");
    publishQueryInvalidations([{ family: "planner" }]);
    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "planner.task.deleted",
      sentAt: new Date().toISOString(),
      payload: { taskId, success: true },
    };
  }

  private async updateChatModel(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      chatId?: string;
      model?: string;
      provider?: string;
      customModelId?: number;
      updateDesktopDefault?: boolean;
    };
    const modelName = payload.model || "deepseek-v4-flash";
    const customMatch = await db.query.language_models.findFirst({
      where: (m, { or, eq }) => or(eq(m.apiName, modelName), eq(m.displayName, modelName)),
    });

    const provider =
      payload.provider ||
      customMatch?.customProviderId ||
      (modelName.includes("claude")
        ? "anthropic"
        : modelName.includes("gpt") || modelName.includes("o1") || modelName.includes("o3")
          ? "openai"
          : modelName.includes("gemini")
            ? customMatch?.customProviderId || "google"
            : modelName.includes("deepseek")
              ? customMatch?.customProviderId || "deepseek"
              : "auto");
    const customModelId = payload.customModelId ?? customMatch?.id;

    const modelSelection = {
      name: modelName,
      provider,
      ...(customModelId ? { customModelId } : {}),
      effortLevel: "medium",
    };

    const chatIdStr = payload.chatId ? String(payload.chatId).replace(/^chat_/, "") : "";
    const chatId = Number(chatIdStr);
    if (Number.isInteger(chatId) && chatId > 0) {
      await db.update(chats).set({ modelSelection }).where(eq(chats.id, chatId));
    }

    try {
      writeSettings({
        selectedModel: {
          name: modelName,
          provider,
          ...(customModelId ? { customModelId } : {}),
        },
      });
      logger.info(`Desktop default model set to: ${modelName} (${provider})`);
    } catch (err) {
      logger.warn("Failed to write desktop default settings:", err);
    }

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "chat.model.updated",
      sentAt: new Date().toISOString(),
      payload: {
        chatId: chatId > 0 ? `chat_${chatId}` : undefined,
        model: modelName,
        provider,
        customModelId,
      },
    };
  }

  private async updateChatMode(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      chatId?: string;
      mode?: "agent" | "build" | "ask" | "plan";
    };
    const chatId = Number(String(payload.chatId ?? "").replace(/^chat_/, ""));
    if (!Number.isInteger(chatId) || chatId <= 0) throw new Error("Invalid chat id");
    const mode = payload.mode === "agent" ? "local-agent" : payload.mode;
    if (mode !== "local-agent" && mode !== "build" && mode !== "ask" && mode !== "plan") {
      throw new Error("Invalid chat mode");
    }
    await db.update(chats).set({ chatMode: mode }).where(eq(chats.id, chatId));
    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "chat.mode.updated",
      sentAt: new Date().toISOString(),
      payload: { chatId: `chat_${chatId}`, mode: payload.mode },
    };
  }

  private async getChatHistory(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      chatId?: string;
      beforeMessageId?: number;
      limit?: number;
    };
    const chatId = Number(String(payload.chatId ?? "").replace(/^chat_/, ""));
    if (!Number.isInteger(chatId) || chatId <= 0) {
      throw new Error("Invalid chat history request");
    }
    const limit = Math.min(Math.max(payload.limit ?? 60, 1), 100);
    const where = payload.beforeMessageId
      ? and(eq(messages.chatId, chatId), lt(messages.id, payload.beforeMessageId))
      : eq(messages.chatId, chatId);
    const newestFirst = await db.query.messages.findMany({
      where,
      columns: {
        id: true,
        role: true,
        content: true,
        model: true,
        maxTokensUsed: true,
        inputTokensUsed: true,
        outputTokensUsed: true,
        createdAt: true,
      },
      orderBy: [desc(messages.id)],
      limit: limit + 1,
    });
    const hasMore = newestFirst.length > limit;
    const page = newestFirst.slice(0, limit).reverse();
    let contentBudget = 140_000;
    const bounded = page.filter((row) => {
      contentBudget -= row.content.length;
      return contentBudget >= 0;
    });
    let chatModel: string | undefined;
    let chatMode: string | undefined;
    try {
      const currentChat = await db.query.chats.findFirst({
        where: eq(chats.id, chatId),
        columns: { modelSelection: true, chatMode: true },
      });
      const selection = currentChat?.modelSelection as any;
      chatModel = selection?.name ?? selection?.model ?? undefined;
      chatMode =
        currentChat?.chatMode === "ask"
          ? "ask"
          : currentChat?.chatMode === "plan"
            ? "plan"
            : currentChat?.chatMode === "build"
              ? "build"
              : "agent";
    } catch {}

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "chat.history",
      sentAt: new Date().toISOString(),
      payload: {
        chatId: `chat_${chatId}`,
        model: chatModel,
        mode: chatMode,
        hasMore,
        oldestMessageId: bounded[0]?.id ?? null,
        messages: bounded.map((row) => ({
          id: `msg_${row.id}`,
          sender: row.role === "user" ? "user" : "desktop",
          text: row.content,
          timestamp: row.createdAt.toISOString(),
          model: row.model ?? undefined,
          totalTokens:
            row.maxTokensUsed ??
            (row.inputTokensUsed != null && row.outputTokensUsed != null
              ? row.inputTokensUsed + row.outputTokensUsed
              : undefined),
          inputTokens: row.inputTokensUsed ?? undefined,
          outputTokens: row.outputTokensUsed ?? undefined,
        })),
      },
    };
  }

  private async createChat(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      workspaceId?: string;
      title?: string;
      mode?: "agent" | "ask" | "plan";
    };
    let appId = Number(String(payload.workspaceId ?? "").replace(/^app_/, ""));
    const project =
      Number.isInteger(appId) && appId > 0
        ? await db.query.apps.findFirst({
            where: eq(apps.id, appId),
            columns: { id: true, type: true },
          })
        : await db.query.apps.findFirst({
            where: eq(apps.name, String(payload.workspaceId ?? "")),
            columns: { id: true, type: true },
          });
    if (!project) throw new Error("Workspace not found");
    appId = project.id;
    const initialChatMode =
      payload.mode === "ask"
        ? ("ask" as const)
        : payload.mode === "plan"
          ? ("plan" as const)
          : project.type === "chat"
            ? ("local-agent" as const)
            : ("build" as const);
    const chatId = await createChatForApp({ appId, title: payload.title, initialChatMode });
    publishQueryInvalidations([{ family: "chats" }, { family: "apps" }]);
    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "chat.created",
      sentAt: new Date().toISOString(),
      payload: { chatId: `chat_${chatId}`, workspaceId: `app_${appId}` },
    };
  }

  /**
   * Executes a chat prompt against the local agent runtime and streams deltas back
   */
  public async executePrompt(
    req: ChatPromptRequest,
    emitChunk: StreamChunkCallback,
  ): Promise<void> {
    const turnId = `turn_${Date.now()}`;
    const { prompt, workspaceId, chatId, model } = req.payload as {
      prompt: string;
      workspaceId: string;
      chatId: string;
      model?: string;
      mode?: "agent" | "ask" | "plan";
    };

    logger.info(`Executing chat prompt for workspace="${workspaceId}", chat="${chatId}"`, {
      promptSnippet: prompt.slice(0, 50),
      model,
      turnId,
    });

    if (this.customPromptHandler) {
      try {
        await this.customPromptHandler(req, emitChunk);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Custom prompt handler failed for turn ${turnId}`, err);
        await emitChunk(this.buildChatEndMessage(req, turnId, "error", errorMessage));
      }
      return;
    }

    try {
      await this.runDesktopPrompt(req, emitChunk, turnId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Chat prompt failed for turn ${turnId}`, err);
      try {
        await emitChunk(this.buildChatEndMessage(req, turnId, "error", errorMessage));
      } catch (sendErr) {
        logger.warn("Failed to emit terminal chat.response.end after engine error:", sendErr);
      }
    }
  }

  private buildChatEndMessage(
    req: ChatPromptRequest,
    turnId: string,
    finishReason: "stop" | "cancelled" | "error",
    error?: string,
  ): ChatResponseEndStream {
    return {
      protocolVersion: 1,
      kind: "stream",
      messageId: randomUUID(),
      correlationId: req.messageId,
      messageType: "chat.response.end",
      sentAt: new Date().toISOString(),
      payload: {
        turnId,
        finishReason,
        ...(error ? { error } : {}),
      },
    };
  }

  private async runDesktopPrompt(
    req: ChatPromptRequest,
    emitChunk: StreamChunkCallback,
    turnId: string,
  ): Promise<void> {
    const { prompt, workspaceId, chatId, model, includePlannerTasks } = req.payload as {
      prompt: string;
      workspaceId: string;
      chatId: string;
      model?: string;
      mode?: "agent" | "ask" | "plan";
      includePlannerTasks?: boolean;
    };

    let numericChatId = Number((chatId || "").replace(/^chat_/, ""));
    const numericAppId = Number((workspaceId || "").replace(/^app_/, ""));
    let currentChat =
      Number.isInteger(numericChatId) && numericChatId > 0
        ? await db.query.chats.findFirst({
            where: eq(chats.id, numericChatId),
          })
        : undefined;

    if (!currentChat) {
      const targetProject =
        Number.isInteger(numericAppId) && numericAppId > 0
          ? await db.query.apps.findFirst({
              where: eq(apps.id, numericAppId),
              columns: { id: true, type: true },
            })
          : workspaceId
            ? await db.query.apps.findFirst({
                where: eq(apps.name, workspaceId),
                columns: { id: true, type: true },
              })
            : undefined;
      const latestChat = targetProject
        ? await db.query.chats.findFirst({
            where: eq(chats.appId, targetProject.id),
            orderBy: [desc(chats.createdAt)],
          })
        : await db.query.chats.findFirst({
            orderBy: [desc(chats.createdAt)],
          });
      if (latestChat) {
        numericChatId = latestChat.id;
        currentChat = latestChat;
      } else {
        const fallbackProject =
          targetProject ??
          (await db.query.apps.findFirst({
            orderBy: [desc(apps.updatedAt)],
            columns: { id: true, type: true },
          }));
        if (!fallbackProject) {
          throw new Error("Select a saved Desktop Studio chat before sending a prompt");
        }
        numericChatId = await createChatForApp({
          appId: fallbackProject.id,
          initialChatMode: fallbackProject.type === "chat" ? "local-agent" : "build",
        });
        currentChat = await db.query.chats.findFirst({
          where: eq(chats.id, numericChatId),
        });
      }
      logger.info(
        `Resolved missing mobile chat "${chatId}" (workspace="${workspaceId}") to desktop chat_${numericChatId}`,
      );
    }

    const desktopSettings = readSettings();
    const providerSettings: Record<string, any> = desktopSettings?.providerSettings ?? {};
    const desktopDefaultModel = desktopSettings?.selectedModel as
      | { name?: string; provider?: string; customModelId?: number }
      | undefined;

    if (model) {
      const customMatch = await db.query.language_models.findFirst({
        where: (m, { or, eq }) => or(eq(m.apiName, model), eq(m.displayName, model)),
      });
      const candidateProvider =
        (req.payload as any).provider ||
        customMatch?.customProviderId ||
        (model.includes("claude")
          ? "anthropic"
          : model.includes("gpt") || model.includes("o1") || model.includes("o3")
            ? "openai"
            : model.includes("gemini")
              ? customMatch?.customProviderId || "google"
              : model.includes("deepseek")
                ? customMatch?.customProviderId || "deepseek"
                : "auto");
      const isCandidateConfigured = Boolean(
        customMatch ||
        providerSettings[candidateProvider]?.apiKey?.value ||
        (candidateProvider === "anthropic" && process.env.ANTHROPIC_API_KEY) ||
        (candidateProvider === "openai" && process.env.OPENAI_API_KEY) ||
        (candidateProvider === "google" && process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
        (candidateProvider === "deepseek" && process.env.DEEPSEEK_API_KEY),
      );

      if (isCandidateConfigured) {
        const customModelId = (req.payload as any).customModelId ?? customMatch?.id;
        const modelSelection = {
          name: model,
          provider: candidateProvider,
          ...(customModelId ? { customModelId } : {}),
          effortLevel: "medium" as const,
        };
        await db.update(chats).set({ modelSelection }).where(eq(chats.id, numericChatId));
        try {
          writeSettings({
            selectedModel: {
              name: model,
              provider: candidateProvider,
              ...(customModelId ? { customModelId } : {}),
            },
          });
        } catch (err) {
          logger.warn("Failed to write desktop default settings:", err);
        }
      } else if (desktopDefaultModel?.name && desktopDefaultModel?.provider) {
        const fallbackSelection = {
          name: desktopDefaultModel.name,
          provider: desktopDefaultModel.provider,
          ...(desktopDefaultModel.customModelId
            ? { customModelId: desktopDefaultModel.customModelId }
            : {}),
          effortLevel: "medium" as const,
        };
        await db
          .update(chats)
          .set({ modelSelection: fallbackSelection })
          .where(eq(chats.id, numericChatId));
        logger.info(
          `Requested model "${model}" (${candidateProvider}) is not configured; using desktop default "${desktopDefaultModel.name}" (${desktopDefaultModel.provider})`,
        );
      }
    } else if (
      (!currentChat?.modelSelection ||
        (currentChat?.modelSelection as any)?.provider === "custom::anitygravity") &&
      desktopDefaultModel?.name &&
      desktopDefaultModel?.provider
    ) {
      const fallbackSelection = {
        name: desktopDefaultModel.name,
        provider: desktopDefaultModel.provider,
        ...(desktopDefaultModel.customModelId
          ? { customModelId: desktopDefaultModel.customModelId }
          : {}),
        effortLevel: "medium" as const,
      };
      await db
        .update(chats)
        .set({ modelSelection: fallbackSelection })
        .where(eq(chats.id, numericChatId));
    }

    const presentationWindow = BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && !window.webContents.isDestroyed(),
    );
    if (!presentationWindow) {
      throw new Error("Desktop Studio window is not available");
    }

    const project =
      Number.isInteger(numericAppId) && numericAppId > 0
        ? await db.query.apps.findFirst({
            where: eq(apps.id, numericAppId),
            columns: { id: true, type: true },
          })
        : await db.query.apps.findFirst({
            where: eq(apps.name, workspaceId),
            columns: { id: true, type: true },
          });
    const operationId = `mobile_${randomUUID()}`;
    const requestedChatMode =
      req.payload.mode === "ask"
        ? ("ask" as const)
        : req.payload.mode === "plan"
          ? ("plan" as const)
          : req.payload.mode === "agent" || project?.type === "chat"
            ? ("local-agent" as const)
            : ("build" as const);
    const intentWithoutHash: Omit<SerializableChatTurnIntent, "payloadHash"> = {
      schemaVersion: 1,
      intentId: operationId,
      chatId: numericChatId,
      appId: project?.id ?? currentChat?.appId,
      invocationRef: {
        kind: "chat-stream",
        entityKey: numericChatId,
        operationId,
      },
      prompt,
      requestedChatMode,
      ...(includePlannerTasks !== undefined ? { includePlannerTasks } : {}),
    };
    const intent: SerializableChatTurnIntent = {
      ...intentWithoutHash,
      payloadHash: computeChatTurnPayloadHash(intentWithoutHash),
    };

    let latestEmittedText = "";
    let latestReceivedText = "";
    let isSending = false;
    let terminalError: string | undefined;
    let finishReason: "stop" | "cancelled" | "error" = "stop";
    let deliveryFailures = 0;
    const maxDeliveryFailures = 3;

    const pumpStream = async () => {
      if (isSending) return;
      if (latestReceivedText === latestEmittedText) return;

      isSending = true;
      while (latestReceivedText !== latestEmittedText) {
        const textToSend = latestReceivedText;
        const delta = textToSend.startsWith(latestEmittedText)
          ? textToSend.slice(latestEmittedText.length)
          : undefined;
        const chunkMsg: ChatResponseChunkStream = {
          protocolVersion: 1,
          kind: "stream",
          messageId: randomUUID(),
          correlationId: req.messageId,
          messageType: "chat.response.chunk",
          sentAt: new Date().toISOString(),
          payload: {
            turnId,
            delta,
            text: textToSend.length <= 64_000 ? textToSend : undefined,
          },
        };

        try {
          await emitChunk(chunkMsg);
          // Advance only after relay delivery succeeds. If the relay briefly
          // rejects a packet, the same buffered text remains eligible for the
          // bounded retry path instead of silently cutting off mobile output.
          latestEmittedText = textToSend;
          deliveryFailures = 0;
        } catch (err) {
          logger.warn("Error emitting chat chunk to relay:", err);
          deliveryFailures += 1;
          if (deliveryFailures >= maxDeliveryFailures) {
            terminalError = "The mobile relay could not deliver the stream after several retries.";
            latestEmittedText = textToSend;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          break;
        }
      }
      isSending = false;
    };

    const relayText = (nextText: string) => {
      if (nextText === latestReceivedText) return;
      latestReceivedText = nextText;
      void pumpStream();
    };

    const observeDesktopStream = (channel: string, payload: unknown) => {
      if (channel === "chat:response:error") {
        terminalError = (payload as { error?: string }).error ?? "Desktop chat stream failed";
        return;
      }
      if (channel === "chat:response:end") {
        if ((payload as { wasCancelled?: boolean }).wasCancelled) {
          finishReason = "cancelled";
        }
        return;
      }
      if (channel !== "chat:response:chunk") return;
      const chunk = payload as ChatResponseChunk;
      if (chunk.messages) {
        const assistant = [...chunk.messages]
          .reverse()
          .find((message) => message.role === "assistant");
        if (assistant) relayText(assistant.content);
        return;
      }
      if (chunk.streamingPatch) {
        relayText(
          latestReceivedText.slice(0, chunk.streamingPatch.offset) + chunk.streamingPatch.content,
        );
      }
    };

    let heartbeatInFlight = false;
    const heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      void emitChunk({
        protocolVersion: 1,
        kind: "stream",
        messageId: randomUUID(),
        correlationId: req.messageId,
        messageType: "chat.response.heartbeat",
        sentAt: new Date().toISOString(),
        payload: { turnId },
      })
        .catch((err) => {
          logger.warn("Failed to emit chat.response.heartbeat:", err);
        })
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, 8_000);

    try {
      await executeChatStreamFromActor(presentationWindow.webContents, intentWithoutHash, {
        intent,
        sessionQueued: false,
        onEvent: observeDesktopStream,
        onError: (error) => {
          terminalError = error.error;
        },
      });
    } finally {
      clearInterval(heartbeatTimer);
    }

    if (terminalError && !latestReceivedText) {
      relayText(`⚠️ ${terminalError}`);
    }

    // Drain any remaining buffered text so mobile receives the complete response
    while (isSending || latestReceivedText !== latestEmittedText) {
      await pumpStream();
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    let tokenStats: { totalTokens?: number; inputTokens?: number; outputTokens?: number } = {};
    try {
      const lastMsg = await db.query.messages.findFirst({
        where: and(eq(messages.chatId, numericChatId), eq(messages.role, "assistant")),
        orderBy: [desc(messages.id)],
        columns: {
          maxTokensUsed: true,
          inputTokensUsed: true,
          outputTokensUsed: true,
          content: true,
        },
      });
      if (lastMsg) {
        tokenStats = {
          totalTokens:
            lastMsg.maxTokensUsed ??
            (lastMsg.inputTokensUsed != null && lastMsg.outputTokensUsed != null
              ? lastMsg.inputTokensUsed + lastMsg.outputTokensUsed
              : Math.ceil(lastMsg.content.length / 4)),
          inputTokens: lastMsg.inputTokensUsed ?? Math.ceil((lastMsg.content.length * 0.3) / 4),
          outputTokens: lastMsg.outputTokensUsed ?? Math.ceil((lastMsg.content.length * 0.7) / 4),
        };
      }
    } catch (err) {
      logger.warn("Failed to query token stats for chat.response.end:", err);
    }

    const endMsg: ChatResponseEndStream = {
      protocolVersion: 1,
      kind: "stream",
      messageId: randomUUID(),
      correlationId: req.messageId,
      messageType: "chat.response.end",
      sentAt: new Date().toISOString(),
      payload: {
        turnId,
        finishReason: terminalError ? "error" : finishReason,
        ...(terminalError ? { error: terminalError } : {}),
        ...tokenStats,
      },
    };
    await emitChunk(endMsg);
  }

  /**
   * Executes a terminal command in the project directory and streams output back
   */
  private async executeTerminalCommand(
    request: ApplicationMessage,
    emitMessage: StreamChunkCallback,
  ): Promise<void> {
    const payload = request.payload as {
      command: string;
      workspaceId?: string;
      chatId?: string;
    };
    const rawInput = payload?.command || "";
    const command = rawInput.trim();
    if (!command) return;

    const sessionKey = payload.workspaceId || "__default__";
    const commandId = `cmd_${request.messageId}`;
    const sendOutput = (
      stream: "stdout" | "stderr" | "system",
      text: string,
      exitCode?: number,
    ) => {
      const outMsg: ApplicationMessage = {
        protocolVersion: 1,
        kind: "stream",
        messageId: randomUUID(),
        correlationId: request.messageId,
        messageType: "terminal.output",
        sentAt: new Date().toISOString(),
        payload: { sessionId: sessionKey, commandId, stream, text, exitCode },
      };
      void emitMessage(outMsg);
    };
    logger.info(
      `Executing remote terminal command: "${command}" (workspace=${payload.workspaceId})`,
    );

    let cwd = process.cwd();
    if (payload.workspaceId) {
      const numericAppId = Number(String(payload.workspaceId).replace(/^app_/, ""));
      const project =
        Number.isInteger(numericAppId) && numericAppId > 0
          ? await db.query.apps.findFirst({
              where: eq(apps.id, numericAppId),
              columns: { path: true, directory: true, type: true },
            })
          : await db.query.apps.findFirst({
              where: eq(apps.name, payload.workspaceId),
              columns: { path: true, directory: true, type: true },
            });
      if (project) {
        cwd = project.type === "chat" ? project.directory || cwd : project.path || cwd;
      }
    }

    try {
      let terminal = this.remoteTerminalSessions.get(sessionKey);
      if (!terminal) {
        terminal = spawnPty(process.env.SHELL || "/bin/bash", ["-i"], {
          cwd,
          // Match the compact mobile terminal viewport. Full-screen tools use
          // these dimensions for cursor addressing and line wrapping.
          cols: 48,
          rows: 32,
          env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
          name: "xterm-256color",
        });
        this.remoteTerminalSessions.set(sessionKey, terminal);

        terminal.onData((text) => {
          sendOutput("stdout", text);
        });
        terminal.onExit(({ exitCode, signal }) => {
          this.remoteTerminalSessions.delete(sessionKey);
          sendOutput(
            "system",
            `Shell exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`,
            exitCode,
          );
        });
      }

      // Preserve control characters such as Ctrl-C. Normal mobile input is a
      // line-oriented SSH-style write; interactive programs still receive it
      // through the same persistent PTY.
      terminal.write(rawInput === "\u0003" ? rawInput : `${rawInput}\r`);
    } catch (err: any) {
      const outMsg: ApplicationMessage = {
        protocolVersion: 1,
        kind: "response",
        messageId: randomUUID(),
        correlationId: request.messageId,
        messageType: "terminal.output",
        sentAt: new Date().toISOString(),
        payload: {
          sessionId: sessionKey,
          commandId,
          stream: "system",
          text: `Failed to run command: ${err.message}`,
          exitCode: 1,
        },
      };
      await emitMessage(outMsg);
    }
  }

  /**
   * Creates a scheduled task on the desktop host and persists to SQLite
   */
  private async createScheduledTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      title: string;
      description?: string;
      prompt?: string;
      workspaceId?: string;
      scheduleMinutes?: number;
      enabled?: boolean;
    };
    let projectId: number | null = null;
    if (payload.workspaceId) {
      const m = String(payload.workspaceId).match(/\d+/);
      if (m) projectId = parseInt(m[0], 10);
    }
    const prompt =
      payload.prompt || payload.description || payload.title || "Execute scheduled tasks";
    const title = payload.title || "Scheduled Agent Task";
    const scheduleMinutes = payload.scheduleMinutes ?? 60;
    const enabled = payload.enabled !== false;

    const [created] = await db
      .insert(tasks)
      .values({
        title,
        prompt,
        scheduleMinutes,
        projectId,
        enabled,
      })
      .returning();

    logger.info(
      `Scheduled task created in SQLite: ID=${created.id} "${created.title}" (every ${created.scheduleMinutes}m)`,
    );
    publishQueryInvalidations([{ family: "tasks" }]);

    const taskInfo = {
      id: `task_${created.id}`,
      taskId: created.id,
      chatId: created.lastChatId
        ? `chat_${created.lastChatId}`
        : created.projectId
          ? `app_${created.projectId}`
          : `task_${created.id}`,
      title: created.title,
      description: created.prompt,
      prompt: created.prompt,
      role: "autonomous-engineer",
      status: (created.enabled ? "scheduled" : "scheduled") as
        | "completed"
        | "running"
        | "scheduled",
      enabled: Boolean(created.enabled),
      scheduleMinutes: created.scheduleMinutes,
      workspaceId: created.projectId ? `app_${created.projectId}` : undefined,
      createdAt:
        created.createdAt instanceof Date
          ? Math.floor(created.createdAt.getTime() / 1000)
          : typeof created.createdAt === "number"
            ? created.createdAt
            : Math.floor(Date.now() / 1000),
      completedAt: null,
      lastRunAt: null,
    };

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "task.schedule.created",
      sentAt: new Date().toISOString(),
      payload: taskInfo,
    };
  }

  /**
   * Updates an existing scheduled task in SQLite
   */
  private async updateScheduledTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      taskId?: string | number;
      id?: string | number;
      title?: string;
      description?: string;
      prompt?: string;
      scheduleMinutes?: number;
      enabled?: boolean;
      workspaceId?: string;
    };
    const rawId = payload.taskId ?? payload.id;
    const numericId = Number(String(rawId ?? "").replace(/^task_/, ""));
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error(`Invalid task ID: ${rawId}`);
    }

    const updates: Partial<typeof tasks.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.prompt !== undefined) updates.prompt = payload.prompt;
    else if (payload.description !== undefined) updates.prompt = payload.description;
    if (payload.scheduleMinutes !== undefined) updates.scheduleMinutes = payload.scheduleMinutes;
    if (payload.enabled !== undefined) updates.enabled = Boolean(payload.enabled);
    if (payload.workspaceId !== undefined) {
      const m = String(payload.workspaceId).match(/\d+/);
      updates.projectId = m ? parseInt(m[0], 10) : null;
    }

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, numericId))
      .returning();

    if (!updated) {
      throw new Error(`Task ${numericId} not found`);
    }

    logger.info(`Scheduled task updated in SQLite: ID=${updated.id} "${updated.title}"`);
    publishQueryInvalidations([{ family: "tasks" }]);

    const taskInfo = {
      id: `task_${updated.id}`,
      taskId: updated.id,
      chatId: updated.lastChatId
        ? `chat_${updated.lastChatId}`
        : updated.projectId
          ? `app_${updated.projectId}`
          : `task_${updated.id}`,
      title: updated.title,
      description: updated.prompt,
      prompt: updated.prompt,
      role: "autonomous-engineer",
      status: (updated.enabled ? (updated.lastRunAt ? "completed" : "scheduled") : "scheduled") as
        | "completed"
        | "running"
        | "scheduled",
      enabled: Boolean(updated.enabled),
      scheduleMinutes: updated.scheduleMinutes,
      workspaceId: updated.projectId ? `app_${updated.projectId}` : undefined,
      createdAt:
        updated.createdAt instanceof Date
          ? Math.floor(updated.createdAt.getTime() / 1000)
          : typeof updated.createdAt === "number"
            ? updated.createdAt
            : Math.floor(Date.now() / 1000),
      completedAt:
        updated.lastRunAt instanceof Date
          ? Math.floor(updated.lastRunAt.getTime() / 1000)
          : typeof updated.lastRunAt === "number"
            ? updated.lastRunAt
            : null,
      lastRunAt:
        updated.lastRunAt instanceof Date
          ? Math.floor(updated.lastRunAt.getTime() / 1000)
          : typeof updated.lastRunAt === "number"
            ? updated.lastRunAt
            : null,
    };

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "task.schedule.updated",
      sentAt: new Date().toISOString(),
      payload: taskInfo,
    };
  }

  /**
   * Deletes a scheduled task from SQLite
   */
  private async deleteScheduledTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      taskId?: string | number;
      id?: string | number;
    };
    const rawId = payload.taskId ?? payload.id;
    const numericId = Number(String(rawId ?? "").replace(/^task_/, ""));
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error(`Invalid task ID: ${rawId}`);
    }

    await db.delete(tasks).where(eq(tasks.id, numericId));
    logger.info(`Scheduled task deleted in SQLite: ID=${numericId}`);
    publishQueryInvalidations([{ family: "tasks" }]);

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "task.schedule.deleted",
      sentAt: new Date().toISOString(),
      payload: {
        taskId: `task_${numericId}`,
        id: `task_${numericId}`,
        success: true,
      },
    };
  }

  /**
   * Triggers immediate execution of a scheduled task on desktop
   */
  private async runScheduledTask(request: ApplicationMessage): Promise<ApplicationMessage> {
    const payload = request.payload as {
      taskId?: string | number;
      id?: string | number;
    };
    const rawId = payload.taskId ?? payload.id;
    const numericId = Number(String(rawId ?? "").replace(/^task_/, ""));
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error(`Invalid task ID: ${rawId}`);
    }

    logger.info(`Triggering runTask for scheduled task ID=${numericId}`);
    const result = await runTask(numericId);

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "task.schedule.run_result",
      sentAt: new Date().toISOString(),
      payload: {
        taskId: `task_${numericId}`,
        chatId: result?.chatId ? `chat_${result.chatId}` : undefined,
        appId: result?.appId ? `app_${result.appId}` : undefined,
        success: true,
      },
    };
  }

  /**
   * Lists all scheduled tasks from SQLite
   */
  private async listScheduledTasks(request: ApplicationMessage): Promise<ApplicationMessage> {
    const dbTasks = await db.query.tasks.findMany({
      orderBy: [desc(tasks.createdAt)],
      limit: 100,
    });
    const scheduledTasks = dbTasks.map((t) => ({
      id: `task_${t.id}`,
      taskId: t.id,
      chatId: t.lastChatId
        ? `chat_${t.lastChatId}`
        : t.projectId
          ? `app_${t.projectId}`
          : `task_${t.id}`,
      title: t.title,
      description: t.prompt,
      prompt: t.prompt,
      role: "autonomous-engineer",
      status: (t.enabled ? (t.lastRunAt ? "completed" : "scheduled") : "scheduled") as
        | "completed"
        | "running"
        | "scheduled",
      enabled: Boolean(t.enabled),
      scheduleMinutes: t.scheduleMinutes,
      workspaceId: t.projectId ? `app_${t.projectId}` : undefined,
      createdAt:
        t.createdAt instanceof Date
          ? Math.floor(t.createdAt.getTime() / 1000)
          : typeof t.createdAt === "number"
            ? t.createdAt
            : Math.floor(Date.now() / 1000),
      completedAt:
        t.lastRunAt instanceof Date
          ? Math.floor(t.lastRunAt.getTime() / 1000)
          : typeof t.lastRunAt === "number"
            ? t.lastRunAt
            : null,
      lastRunAt:
        t.lastRunAt instanceof Date
          ? Math.floor(t.lastRunAt.getTime() / 1000)
          : typeof t.lastRunAt === "number"
            ? t.lastRunAt
            : null,
    }));

    return {
      protocolVersion: 1,
      kind: "response",
      messageId: randomUUID(),
      correlationId: request.messageId,
      messageType: "task.schedule.list",
      sentAt: new Date().toISOString(),
      payload: {
        tasks: scheduledTasks,
      },
    };
  }
}
