import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import {
  createSkill,
  deleteSkill,
  findSkill,
  listSkills,
  skillsDir,
  updateSkill,
} from "../utils/skill_store";
import { createTypedHandler } from "./base";
import { skillContracts } from "../types/skill";

export function registerSkillHandlers() {
  createTypedHandler(skillContracts.listSkills, async () => {
    return { skills: listSkills() };
  });

  createTypedHandler(skillContracts.getSkillsDir, async () => skillsDir());

  createTypedHandler(skillContracts.getSkill, async (_, name) => {
    const skill = findSkill(name);
    if (!skill) {
      throw new OctopusStudioError("Skill not found", OctopusStudioErrorKind.NotFound);
    }
    return skill;
  });

  createTypedHandler(skillContracts.createSkill, async (_, params) => {
    return createSkill(params);
  });

  createTypedHandler(skillContracts.updateSkill, async (_, params) => {
    const { name, newName, description, instructions } = params;
    const skill = findSkill(name);
    if (!skill) {
      throw new OctopusStudioError("Skill not found", OctopusStudioErrorKind.NotFound);
    }
    return updateSkill(name, {
      ...(newName !== undefined ? { name: newName } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
    });
  });

  createTypedHandler(skillContracts.deleteSkill, async (_, name) => {
    deleteSkill(name);
  });
}
