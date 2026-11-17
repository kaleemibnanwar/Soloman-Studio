/**
 * Regenerate the checked-in office template TS modules from the source
 * `.pptx` files under `src/document_templates/presentations/`.
 *
 * The `.docx` templates were previously generated into
 * `src/ipc/utils/office_templates.ts` (DOC_TEMPLATES) by a since-deleted
 * script; this script restores the same reproducibility for the PPTX half.
 *
 * Each template is parsed with office-open and reduced to the parts
 * `generatePresentationSync` actually needs to reproduce the deck's design —
 * `{ size, masters, slides }` — dropping round-trip-only fields (`rawParts`,
 * `passthroughRelationships`, `contentTypes`, timestamps).
 *
 * Usage: `node scripts/generate-office-templates.mjs`
 */
import { parsePresentation } from "office-open/pptx";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const presentationsDir = join(root, "src", "document_templates", "presentations");
const outPath = join(root, "src", "ipc", "utils", "office_pptx_templates.ts");

const TITLES = {
  presentation_idea: "Idea Presentation",
  presentation_pitch: "Pitch Presentation",
  presentation_academic: "Academic Presentation",
};

const KEY_BY_FILE = {
  "Presentation_Idea.pptx": "presentation_idea",
  "Presentation_Pitch.pptx": "presentation_pitch",
  "Presentation_Academic.pptx": "presentation_academic",
};

const files = readdirSync(presentationsDir)
  .filter((f) => f.endsWith(".pptx"))
  .sort();

const entries = {};
for (const file of files) {
  const key = KEY_BY_FILE[file];
  if (!key) {
    console.warn(`Skipping ${file} — no template key mapping`);
    continue;
  }
  const buffer = new Uint8Array(readFileSync(join(presentationsDir, file)));
  const parsed = parsePresentation(buffer);
  entries[key] = {
    title: TITLES[key] ?? basename(file, ".pptx"),
    size: parsed.size,
    masters: parsed.masters,
    slides: parsed.slides,
  };
}

const header = `// Generated from src/document_templates/presentations — parsed office-open
// presentation options, reduced to { size, masters, slides } (the parts
// generatePresentationSync needs to reproduce each deck's design). Regenerate
// with: node scripts/generate-office-templates.mjs
export const PPT_TEMPLATES: Record<
  string,
  { title: string; size: unknown; masters: unknown; slides: unknown[] }
> = `;

const body = JSON.stringify(entries, null, 0);
writeFileSync(outPath, header + body + ";\n", "utf8");
console.log(
  `Wrote ${outPath} (${Object.keys(entries).length} templates: ${Object.keys(entries).join(", ")})`,
);
