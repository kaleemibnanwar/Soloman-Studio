import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { apps, workerProposals } from "../../db/schema";
import { createTypedHandler } from "./base";
import { workerProposalContracts } from "../types/worker_proposal";
import { dispatchSquadRun } from "../services/worker_run_service";
import {
  getOctopusStudioAppPath,
  getChatProjectRootPath,
} from "../../paths/paths";
import { writeConsensus } from "../utils/worker_consensus";
import {
  OctopusStudioError,
  OctopusStudioErrorKind,
} from "../../errors/octopus_studio_error";

function resolveProjectPath(app: {
  type: string;
  path: string | null;
  directory: string | null;
  id: number;
}): string {
  if (app.type === "chat") {
    return getChatProjectRootPath(app.directory, app.id);
  }
  return getOctopusStudioAppPath(app.path ?? "");
}

export function registerWorkerProposalHandlers() {
  createTypedHandler(
    workerProposalContracts.listProposals,
    async (_event, { projectId }) => {
      const rows = await db
        .select({ proposal: workerProposals, projectName: apps.name })
        .from(workerProposals)
        .leftJoin(apps, eq(workerProposals.projectId, apps.id))
        .where(
          projectId != null
            ? eq(workerProposals.projectId, projectId)
            : undefined,
        )
        .orderBy(desc(workerProposals.createdAt));
      return rows.map(({ proposal: p, projectName }) => ({
        id: p.id,
        projectId: p.projectId,
        projectName: projectName ?? null,
        runId: p.runId,
        summary: p.summary,
        name: p.name,
        steps: p.steps,
        rationale: p.rationale,
        type: p.type,
        target: p.target,
        tool: p.tool,
        scopeFiles: p.scopeFiles,
        personas: p.personas,
        estimatedToolCalls: p.estimatedToolCalls,
        status: p.status,
        feedback: p.feedback,
        guardrailFlags: p.guardrailFlags,
        consensusDiff: p.consensusDiff,
        createdAt: p.createdAt,
        resolvedAt: p.resolvedAt,
        executionOutcome: p.executionOutcome,
      }));
    },
  );

  createTypedHandler(
    workerProposalContracts.approveProposal,
    async (_event, { proposalId, editedSummary }) => {
      const proposal = await db.query.workerProposals.findFirst({
        where: eq(workerProposals.id, proposalId),
      });
      if (!proposal) {
        throw new OctopusStudioError(
          "Proposal not found",
          OctopusStudioErrorKind.NotFound,
        );
      }
      if (proposal.status !== "pending") {
        throw new OctopusStudioError(
          "Proposal is not pending",
          OctopusStudioErrorKind.Precondition,
        );
      }
      if (proposal.projectId == null) {
        throw new OctopusStudioError(
          "Proposal has no project",
          OctopusStudioErrorKind.Precondition,
        );
      }

      const { runId, chatId } = await dispatchSquadRun({
        projectId: proposal.projectId,
        goal: editedSummary ?? proposal.summary,
        mode: "execute",
      });

      await db
        .update(workerProposals)
        .set({ status: "approved", executionRunId: runId, resolvedAt: new Date() })
        .where(eq(workerProposals.id, proposalId));

      return { runId, chatId };
    },
  );

  createTypedHandler(
    workerProposalContracts.rejectProposal,
    async (_event, { proposalId, feedback }) => {
      const proposal = await db.query.workerProposals.findFirst({
        where: eq(workerProposals.id, proposalId),
      });
      if (!proposal) {
        throw new OctopusStudioError(
          "Proposal not found",
          OctopusStudioErrorKind.NotFound,
        );
      }
      if (proposal.status !== "pending") {
        throw new OctopusStudioError(
          "Proposal is not pending",
          OctopusStudioErrorKind.Precondition,
        );
      }
      if (proposal.projectId == null) {
        throw new OctopusStudioError(
          "Proposal has no project",
          OctopusStudioErrorKind.Precondition,
        );
      }

      // Write feedback into the consensus file so the next Propose cycle adjusts.
      const project = await db.query.apps.findFirst({
        where: eq(apps.id, proposal.projectId),
        columns: { id: true, type: true, path: true, directory: true },
      });
      if (project) {
        writeConsensus(resolveProjectPath(project), {
          nextAction: `Rejected: ${feedback}`,
          historyLine: `${new Date().toISOString()} — rejected: ${feedback}`,
        });
      }

      // Reject deletes the request from the queue (spec: reject removes it).
      await db.delete(workerProposals).where(eq(workerProposals.id, proposalId));
    },
  );
}
