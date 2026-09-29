import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  updatedAt: z.date(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const CreateSkillParamsSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
});

export const UpdateSkillParamsSchema = z.object({
  name: z.string().min(1),
  newName: z.string().min(1).optional(),
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
  getSkillsDir: defineContract({
    channel: "get-skills-dir",
    input: z.void(),
    output: z.string(),
  }),
  getSkill: defineContract({
    channel: "get-skill",
    input: z.string(),
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
    input: z.string(),
    output: z.void(),
    invalidates: () => [{ family: "skills" }],
  }),
};

export const skillClient = createClient(skillContracts);
