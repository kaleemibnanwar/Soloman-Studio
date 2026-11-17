import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apps, plannerTasks, tasks } from "@/db/schema";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { missionContracts, type MissionChatRun } from "@/ipc/types/mission";
import { handleIncomingApprovalResponse } from "@/ipc/agent/hitl_interceptor";
import { recommendPersonasForObjective } from "@/ipc/agent/persona_library";
import { publishQueryInvalidations } from "@/ipc/utils/query_invalidation_delivery";
import {
  createMission,
  listMissionArtifacts,
  listMissions,
  missionArtifactsDirPath,
  missionDirPath,
  readMissionConsensus,
  resolvePendingApproval,
  writeMissionConsensus,
} from "@/ipc/utils/mission_consensus";
import { resolveMissionProjectPath } from "@/ipc/utils/mission_project_path";
import { launchMissionRuntime, stopMissionRuntime } from "@/ipc/services/mission_runtime";
import { createTypedHandler } from "./base";

export function registerMissionHandlers() {
  createTypedHandler(missionContracts.listMissions, async (_, { projectId }) => {
    const projects = await db.query.apps.findMany();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const locations: Array<{ projectId: number | null; path: string }> = [];
    if (projectId != null) {
      locations.push({
        projectId,
        path: await resolveMissionProjectPath(projectId),
      });
    } else {
      locations.push({ projectId: null, path: await resolveMissionProjectPath(null) });
      for (const project of projects) {
        locations.push({
          projectId: project.id,
          path: await resolveMissionProjectPath(project.id),
        });
      }
    }

    const seen = new Set<string>();
    const allSummaries = await Promise.all(
      locations.map(async ({ projectId: locationProjectId, path: locPath }) => {
        const rawMissions = listMissions(locPath);
        const project = locationProjectId != null ? projectMap.get(locationProjectId) : null;
        const projectName = project ? project.name : locationProjectId == null ? "Default Workspace" : `Project #${locationProjectId}`;

        return Promise.all(
          rawMissions.map(async (mission) => {
            const artifacts = listMissionArtifacts(locPath, mission.slug);
            const latestTask = await db.query.tasks.findFirst({
              where: and(
                eq(tasks.missionSlug, mission.slug),
                locationProjectId == null ? isNull(tasks.projectId) : eq(tasks.projectId, locationProjectId),
                isNotNull(tasks.lastChatId),
              ),
              orderBy: [desc(tasks.lastRunAt), desc(tasks.id)],
            });

            return {
              ...mission,
              projectId: locationProjectId,
              projectName,
              projectPath: locPath,
              missionDirPath: missionDirPath(locPath, mission.slug),
              artifactsCount: artifacts.length,
              latestChatId: latestTask?.lastChatId ?? null,
            };
          }),
        );
      }),
    );

    return allSummaries.flat().filter((mission) => {
      const key = `${mission.projectId ?? "default"}:${mission.slug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  createTypedHandler(missionContracts.getMission, async (_, { projectId, slug }) => {
    const projectPath = await resolveMissionProjectPath(projectId);
    let consensus;
    try {
      consensus = readMissionConsensus(projectPath, slug);
    } catch {
      throw new OctopusStudioError(`Mission '${slug}' not found`, OctopusStudioErrorKind.NotFound);
    }

    const project = projectId != null ? await db.query.apps.findFirst({ where: eq(apps.id, projectId) }) : null;
    const projectName = project ? project.name : projectId == null ? "Default Workspace" : `Project #${projectId}`;

    const missionTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.missionSlug, slug),
        projectId == null ? isNull(tasks.projectId) : eq(tasks.projectId, projectId),
      ),
      orderBy: [asc(tasks.id)],
    });

    const taskByMilestone = new Map(missionTasks.map((t) => [t.missionMilestoneId, t]));
    const enrichedMilestones = consensus.milestones.map((m) => {
      const t = taskByMilestone.get(m.id);
      return {
        ...m,
        chatId: t?.lastChatId ?? null,
        summary: t?.lastResultSummary ?? null,
        lastRunAt: t?.lastRunAt ? t.lastRunAt.toISOString() : null,
      };
    });

    const chatRuns: MissionChatRun[] = missionTasks
      .filter((t) => t.lastChatId != null)
      .map((t) => {
        const milestone = consensus.milestones.find((m) => m.id === t.missionMilestoneId);
        return {
          milestoneId: t.missionMilestoneId ?? "",
          milestoneTitle: milestone?.title ?? t.title,
          botName: t.botName ?? t.title,
          chatId: t.lastChatId!,
          lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
          summary: t.lastResultSummary ?? null,
          status: t.lastStatus,
        };
      });

    const artifacts = listMissionArtifacts(projectPath, slug);

    return {
      ...consensus,
      projectName,
      projectPath,
      missionDirPath: missionDirPath(projectPath, slug),
      milestones: enrichedMilestones,
      chatRuns,
      artifacts,
    };
  });

  createTypedHandler(missionContracts.createMission, async (event, input) => {
    const projectPath = await resolveMissionProjectPath(input.projectId);
    const manager = input.manager ?? "Lead-Strategist";
    const personas = recommendPersonasForObjective(input.objective);
    const availableMcpServers = (await db.query.mcpServers.findMany()).filter(
      (server) => server.enabled,
    );
    const personaProvisioning = personas.map((persona) => {
      const servers = availableMcpServers.filter((server) => {
        const searchableName = server.name.toLowerCase();
        return persona.targetMcpCategories.some((category) =>
          searchableName.includes(category.toLowerCase()),
        );
      });
      return { persona, servers };
    });
    const milestones = [
      {
        id: "milestone-1",
        title: "Strategic Planning & Team Decomposition",
        status: "in_progress" as const,
        botName: manager,
      },
      ...personaProvisioning.map(({ persona }, index) => ({
        id: `milestone-${index + 2}`,
        title:
          persona.key === "qa_sentinel"
            ? "Verify deliverables, guardrails, and completion evidence"
            : `${persona.title}: execute assigned mission work`,
        status: "todo" as const,
        botName: persona.name,
      })),
    ];
    const teamRoster = [
      {
        name: manager,
        role: "Manager",
        responsibilities: "Directs strategy, verifies outputs, and manages the consensus ledger",
      },
      ...personaProvisioning.map(({ persona, servers }) => ({
        name: persona.name,
        role: persona.title,
        responsibilities: persona.description,
        mcpTools: servers.map((server) => server.name),
      })),
    ];
    const created = createMission(projectPath, {
      title: input.title,
      slug: input.slug,
      objective: input.objective,
      context: input.context,
      deliverables: input.deliverables,
      projectId: input.projectId ?? null,
      manager,
      milestones,
      teamRoster,
      hitlPolicy: input.hitlPolicy,
    });
    if (created.milestones.length) {
      await db.insert(plannerTasks).values(
        created.milestones.map((milestone, position) => ({
          appId: input.projectId ?? null,
          title: milestone.title,
          description: created.objective,
          status: milestone.status,
          priority: milestone.botName === "QA Sentinel" ? ("medium" as const) : ("high" as const),
          position,
          botName: milestone.botName ?? created.manager,
          missionSlug: created.slug,
          missionMilestoneId: milestone.id,
        })),
      );
    }
    await db.insert(tasks).values({
      title: `${created.title} · ${manager}`,
      prompt: [
        `You are ${manager}, the accountable mission manager.`,
        `MISSION: ${created.title} (${created.slug})`,
        `OBJECTIVE: ${created.objective}`,
        `CONTEXT: ${created.context.join("; ") || "Project workspace"}`,
        `DELIVERABLES: ${created.deliverables.join("; ") || "Verified mission outcome"}`,
        "Inspect the project and supporting context. Refine the strategy, methodology, dependencies, risks, acceptance criteria, and worker instructions in consensus.md. Keep the existing milestone IDs because the runtime uses them as durable links. Do not perform specialist execution yourself.",
      ].join("\n\n"),
      scheduleMinutes: null,
      enabled: false,
      projectId: input.projectId ?? null,
      mcpServerIds: [],
      botType: "custom",
      role: "architect",
      missionSlug: created.slug,
      missionMilestoneId: "milestone-1",
      botName: manager,
    });
    if (personaProvisioning.length) {
      await db.insert(tasks).values(
        personaProvisioning.map(({ persona, servers }, index) => ({
          title: `${created.title} · ${persona.name}`,
          prompt: [
            persona.systemPrompt,
            `MISSION: ${created.title} (${created.slug})`,
            `OBJECTIVE: ${created.objective}`,
            `Read .soloman/missions/${created.slug}/consensus.md before each turn and record artifacts under its artifacts directory.`,
          ].join("\n\n"),
          scheduleMinutes: null,
          enabled: false,
          projectId: input.projectId ?? null,
          mcpServerIds: servers.map((server) => server.id),
          botType: persona.archetype,
          role: persona.role,
          missionSlug: created.slug,
          missionMilestoneId: `milestone-${index + 2}`,
          botName: persona.name,
        })),
      );
    }
    publishQueryInvalidations(
      [
        { family: "missions", projectId: input.projectId },
        { family: "planner", appId: input.projectId ?? undefined },
      ],
      event.sender,
    );
    launchMissionRuntime(input.projectId, created.slug);
    return readMissionConsensus(projectPath, created.slug);
  });

  createTypedHandler(missionContracts.updateStatus, async (event, input) => {
    const projectPath = await resolveMissionProjectPath(input.projectId);
    try {
      if (input.status === "PAUSED" || input.status === "ABORTED") {
        stopMissionRuntime(input.projectId, input.slug, input.status);
      }
      const current = readMissionConsensus(projectPath, input.slug);
      const updated = writeMissionConsensus(projectPath, input.slug, {
        status: input.status,
        activeBot:
          input.status === "PAUSED" || input.status === "ABORTED" ? null : current.activeBot,
        history: [
          `[${new Date().toISOString()}] [User] Mission set to ${input.status}.`,
          ...current.history,
        ],
      });
      if (input.status === "IN PROGRESS") launchMissionRuntime(input.projectId, input.slug);
      publishQueryInvalidations([{ family: "missions", projectId: input.projectId }], event.sender);
      return updated;
    } catch {
      throw new OctopusStudioError(
        `Mission '${input.slug}' not found`,
        OctopusStudioErrorKind.NotFound,
      );
    }
  });

  createTypedHandler(missionContracts.startMission, async (event, input) => {
    const projectPath = await resolveMissionProjectPath(input.projectId);
    const current = readMissionConsensus(projectPath, input.slug);
    if (current.status === "DONE" || current.status === "ABORTED") {
      throw new OctopusStudioError(
        `Mission '${input.slug}' cannot start from ${current.status}`,
        OctopusStudioErrorKind.Conflict,
      );
    }
    const updated = writeMissionConsensus(projectPath, input.slug, {
      status: "IN PROGRESS",
      lastError: null,
      history: [
        `[${new Date().toISOString()}] [User] Mission execution started.`,
        ...current.history,
      ],
    });
    launchMissionRuntime(input.projectId, input.slug);
    publishQueryInvalidations(
      [
        { family: "missions", projectId: input.projectId },
        { family: "planner", appId: input.projectId ?? undefined },
        { family: "tasks" },
      ],
      event.sender,
    );
    return updated;
  });

  createTypedHandler(missionContracts.approveAction, async (event, input) => {
    const projectPath = await resolveMissionProjectPath(input.projectId);
    try {
      const resumed = handleIncomingApprovalResponse(
        input.approvalId,
        input.decision,
        input.feedback,
      );
      const updated = resumed
        ? readMissionConsensus(projectPath, input.slug)
        : resolvePendingApproval(projectPath, input.slug, input.approvalId, input.decision);
      publishQueryInvalidations([{ family: "missions", projectId: input.projectId }], event.sender);
      return updated;
    } catch {
      throw new OctopusStudioError(
        `Failed to resolve approval for mission '${input.slug}'`,
        OctopusStudioErrorKind.NotFound,
      );
    }
  });

  createTypedHandler(missionContracts.readArtifact, async (_, input) => {
    const projectPath = await resolveMissionProjectPath(input.projectId);
    const artifactsDir = missionArtifactsDirPath(projectPath, input.slug);
    const safePath = path.resolve(artifactsDir, input.relativePath);
    if (!safePath.startsWith(artifactsDir) || !fs.existsSync(safePath)) {
      throw new OctopusStudioError("Artifact not found", OctopusStudioErrorKind.NotFound);
    }
    const stat = fs.statSync(safePath);
    const content = fs.readFileSync(safePath, "utf-8");
    return {
      content,
      name: path.basename(safePath),
      extension: path.extname(safePath).toLowerCase(),
      size: stat.size,
      fullPath: safePath,
    };
  });
}
