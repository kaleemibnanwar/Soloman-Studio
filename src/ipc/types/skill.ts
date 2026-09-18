import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const SkillSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const CreateSkillParamsSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
});

export const UpdateSkillParamsSchema = z.object({
  skillId: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
});

export const ListSkillsResultSchema = z.object({
  skills: z.array(SkillSchema),
});

export const skillContracts = {
  listSkills: defineContract({
    channel: "list-skills",
    input: z.void(),
    output: ListSkillsResultSchema,
  }),
  getSkill: defineContract({
    channel: "get-skill",
    input: z.number(),
    output: SkillSchema,
  }),
  createSkill: defineContract({
    channel: "create-skill",
    input: CreateSkillParamsSchema,
    output: SkillSchema,
    invalidates: () => [{ family: "skills" }],
  }),
  updateSkill: defineContract({
    channel: "update-skill",
    input: UpdateSkillParamsSchema,
    output: SkillSchema,
    invalidates: () => [{ family: "skills" }],
  }),
  deleteSkill: defineContract({
    channel: "delete-skill",
    input: z.number(),
    output: z.void(),
    invalidates: () => [{ family: "skills" }],
  }),
};

export const skillClient = createClient(skillContracts);
