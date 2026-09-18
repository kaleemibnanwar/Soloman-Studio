/** Every `/name` token in the prompt (deduped), regardless of whether it matches a saved skill. */
export function findSlashReferenceCandidates(userPrompt: string): string[] {
  const matches = [...userPrompt.matchAll(/(?:^|\s)\/([a-zA-Z0-9-]+)(?=\s|$)/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * Appends a note for each `/name` token that matches a saved skill, pointing
 * the agent at `read_skill` — purely additive, never rewrites the user's text
 * (unlike the eager `/slug` → prompt-content expansion used for Prompts).
 */
export function annotateSkillReferences(
  userPrompt: string,
  skillsByLowercaseName: Record<string, { name: string; description: string }>,
): string {
  const candidates = findSlashReferenceCandidates(userPrompt);
  const matched = candidates
    .map((c) => skillsByLowercaseName[c.toLowerCase()])
    .filter((s): s is { name: string; description: string } => !!s);
  if (matched.length === 0) return userPrompt;
  const notes = matched
    .map(
      (s) =>
        `Skill reference: "${s.name}" — ${s.description}. Call read_skill("${s.name}") to load it if relevant.`,
    )
    .join("\n");
  return `${userPrompt}\n\n${notes}`;
}
