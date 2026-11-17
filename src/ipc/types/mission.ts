import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

const MissionSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const MissionStatusSchema = z.enum([
  "PLANNING",
  "IN PROGRESS",
  "PAUSED",
  "BLOCKED",
  "DONE",
  "ABORTED",
]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const MissionMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["todo", "in_progress", "done"]),
  botName: z.string().optional(),
  chatId: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
});
export type MissionMilestone = z.infer<typeof MissionMilestoneSchema>;

export const MissionArtifactSchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  fullPath: z.string(),
  size: z.number(),
  updatedAt: z.string(),
  extension: z.string(),
  isReport: z.boolean().optional(),
});
export type MissionArtifact = z.infer<typeof MissionArtifactSchema>;

export const MissionChatRunSchema = z.object({
  milestoneId: z.string(),
  milestoneTitle: z.string(),
  botName: z.string(),
  chatId: z.number(),
  lastRunAt: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.string(),
});
export type MissionChatRun = z.infer<typeof MissionChatRunSchema>;

export const MissionTeamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
  responsibilities: z.string(),
  mcpTools: z.array(z.string()).optional(),
});
export type MissionTeamMember = z.infer<typeof MissionTeamMemberSchema>;

export const MissionApprovalPendingSchema = z.object({
  id: z.string(),
  requestingBot: z.string(),
  tool: z.string(),
  actionCategory: z.string(),
  summary: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  command: z.string().optional(),
  createdAt: z.string().optional(),
});
export type MissionApprovalPending = z.infer<typeof MissionApprovalPendingSchema>;

export const MissionHitlPolicySchema = z.object({
  enabled: z.boolean(),
  blockExternalCommunication: z.boolean(),
  blockGitPush: z.boolean(),
  blockFinancialSpend: z.boolean(),
  blockDestructiveFs: z.boolean(),
});
export type MissionHitlPolicy = z.infer<typeof MissionHitlPolicySchema>;

export const MissionConsensusSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: MissionStatusSchema,
  projectId: z.number().nullable(),
  manager: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  objective: z.string(),
  context: z.array(z.string()),
  deliverables: z.array(z.string()),
  milestones: z.array(MissionMilestoneSchema),
  teamRoster: z.array(MissionTeamMemberSchema),
  approvalsPending: z.array(MissionApprovalPendingSchema),
  decisions: z.array(z.string()),
  guardrails: z.array(z.string()),
  history: z.array(z.string()),
  hitlPolicy: MissionHitlPolicySchema,
  activeBot: z.string().nullable(),
  nextMilestoneId: z.string().nullable(),
  lastError: z.string().nullable(),
  projectName: z.string().nullable().optional(),
  projectPath: z.string().optional(),
  missionDirPath: z.string().optional(),
  chatRuns: z.array(MissionChatRunSchema).optional(),
  artifacts: z.array(MissionArtifactSchema).optional(),
});
export type MissionConsensus = z.infer<typeof MissionConsensusSchema>;

export const MissionSummarySchema = z.object({
  slug: z.string(),
  projectId: z.number().nullable(),
  title: z.string(),
  status: MissionStatusSchema,
  manager: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  objective: z.string(),
  totalMilestones: z.number().int(),
  completedMilestones: z.number().int(),
  pendingApprovalsCount: z.number().int(),
  projectName: z.string().nullable().optional(),
  projectPath: z.string().optional(),
  missionDirPath: z.string().optional(),
  artifactsCount: z.number().int().optional(),
  latestChatId: z.number().nullable().optional(),
});
export type MissionSummary = z.infer<typeof MissionSummarySchema>;

export const missionContracts = {
  listMissions: defineContract({
    channel: "mission:list-missions",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
    }),
    output: z.array(MissionSummarySchema),
  }),

  getMission: defineContract({
    channel: "mission:get-mission",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      slug: MissionSlugSchema,
    }),
    output: MissionConsensusSchema,
  }),

  createMission: defineContract({
    channel: "mission:create-mission",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      title: z.string().trim().min(1).max(200),
      slug: MissionSlugSchema.optional(),
      objective: z.string().trim().min(1).max(5000),
      context: z.array(z.string()).optional(),
      deliverables: z.array(z.string()).optional(),
      manager: z.string().optional(),
      hitlPolicy: MissionHitlPolicySchema.optional(),
    }),
    output: MissionConsensusSchema,
    invalidates: (input) => [
      { family: "missions", projectId: input.projectId },
      { family: "planner", appId: input.projectId ?? undefined },
    ],
  }),

  updateStatus: defineContract({
    channel: "mission:update-status",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      slug: MissionSlugSchema,
      status: MissionStatusSchema,
    }),
    output: MissionConsensusSchema,
    invalidates: (input) => [{ family: "missions", projectId: input.projectId }],
  }),

  startMission: defineContract({
    channel: "mission:start-mission",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      slug: MissionSlugSchema,
    }),
    output: MissionConsensusSchema,
    invalidates: (input) => [
      { family: "missions", projectId: input.projectId },
      { family: "planner", appId: input.projectId ?? undefined },
      { family: "tasks" },
    ],
  }),

  approveAction: defineContract({
    channel: "mission:approve-action",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      slug: MissionSlugSchema,
      approvalId: z.string().min(1),
      decision: z.enum(["approved", "rejected"]),
      feedback: z.string().optional(),
    }),
    output: MissionConsensusSchema,
    invalidates: (input) => [{ family: "missions", projectId: input.projectId }],
  }),

  readArtifact: defineContract({
    channel: "mission:read-artifact",
    input: z.object({
      projectId: z.number().int().positive().optional().nullable(),
      slug: MissionSlugSchema,
      relativePath: z.string().min(1),
    }),
    output: z.object({
      content: z.string(),
      name: z.string(),
      extension: z.string(),
      size: z.number(),
      fullPath: z.string(),
    }),
  }),
};

export const missionClient = createClient(missionContracts);
