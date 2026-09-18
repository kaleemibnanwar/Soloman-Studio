import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { skills } from "../../db/schema";
import {
  OctopusStudioError,
  OctopusStudioErrorKind,
} from "@/errors/octopus_studio_error";
import { createTypedHandler } from "./base";
import { skillContracts } from "../types/skill";

export function registerSkillHandlers() {
  createTypedHandler(skillContracts.listSkills, async () => {
    const items = await db.query.skills.findMany({
      orderBy: [desc(skills.updatedAt)],
    });
    return { skills: items };
  });

  createTypedHandler(skillContracts.getSkill, async (_, skillId) => {
    const skill = await db.query.skills.findFirst({
      where: eq(skills.id, skillId),
    });
    if (!skill) {
      throw new OctopusStudioError(
        "Skill not found",
        OctopusStudioErrorKind.NotFound,
      );
    }
    return skill;
  });

  createTypedHandler(skillContracts.createSkill, async (_, params) => {
    const [created] = await db
      .insert(skills)
      .values({
        name: params.name,
        description: params.description,
        instructions: params.instructions,
      })
      .returning();
    return created;
  });

  createTypedHandler(skillContracts.updateSkill, async (_, params) => {
    const { skillId, ...fields } = params;
    const updates: Partial<typeof skills.$inferInsert> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) {
      updates.description = fields.description;
    }
    if (fields.instructions !== undefined) {
      updates.instructions = fields.instructions;
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(skills)
      .set(updates)
      .where(eq(skills.id, skillId))
      .returning();
    if (!updated) {
      throw new OctopusStudioError(
        "Skill not found",
        OctopusStudioErrorKind.NotFound,
      );
    }
    return updated;
  });

  createTypedHandler(skillContracts.deleteSkill, async (_, skillId) => {
    await db.delete(skills).where(eq(skills.id, skillId));
  });
}
