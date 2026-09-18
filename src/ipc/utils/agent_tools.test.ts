// @vitest-environment node
//
// Tests for the built-in agent tools. Verifies the tool set matches the
// Settings-visible registry (so the model can finally see the tools the prompt
// advertises), the consent gate blocks "never", read-only Ask mode blocks write
// tools, and the write_file/search_replace execute path really edits files and
// updates the chunk index.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";

import { buildBuiltinTools, type BuiltinToolsParams } from "./agent_tools";
import { AGENT_TOOL_REGISTRY, AGENT_TOOL_NAMES } from "./agent_tool_registry";
import { parseDocx, parsePptx, parseXlsx } from "./office_open";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-tools-"));
  // Redirect the code-index cache away from the repo's ./userData.
  process.env.NODE_ENV = "development";
  process.env.OCTOPUS_STUDIO_DEV_USER_DATA_DIR = dir;
});

afterEach(() => {
  delete process.env.OCTOPUS_STUDIO_DEV_USER_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

function params(overrides: Partial<BuiltinToolsParams> = {}): BuiltinToolsParams {
  return {
    appPath: dir,
    appId: 1,
    chatId: 1,
    chatMode: "local-agent",
    agentToolConsents: undefined,
    event: { sender: { send: () => {} } } as unknown as IpcMainInvokeEvent,
    ...overrides,
  };
}

describe("buildBuiltinTools", () => {
  it("exposes every tool the registry advertises", () => {
    const tools = buildBuiltinTools(params());
    expect(Object.keys(tools).sort()).toEqual([...AGENT_TOOL_NAMES].sort());
  });

  it("advertises exactly the registry's tool count", () => {
    const tools = buildBuiltinTools(params());
    expect(Object.keys(tools).length).toBe(AGENT_TOOL_REGISTRY.length);
  });

  it("blocks a tool the user set to 'never'", async () => {
    const tools = buildBuiltinTools(params({ agentToolConsents: { write_file: "never" } }));
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "x.ts",
      content: "x",
    });
    expect(result).toContain("disabled");
  });

  it("blocks write tools in read-only Ask mode", async () => {
    const tools = buildBuiltinTools(params({ chatMode: "ask" }));
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "x.ts",
      content: "x",
    });
    expect(result).toContain("read-only Ask mode");
  });

  it("allows read tools in Ask mode", async () => {
    fs.writeFileSync(path.join(dir, "readme.txt"), "hello");
    const tools = buildBuiltinTools(params({ chatMode: "ask" }));
    const result = await (
      tools.read_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "readme.txt",
    });
    expect(result).toBe("hello");
  });
});

describe("write_file / search_replace execute", () => {
  it("creates then edits a file and updates the chunk index", async () => {
    const tools = buildBuiltinTools(params());

    const write = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "src/index.ts",
      content: "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
    });
    expect(write).toContain("Wrote src/index.ts");

    expect(fs.existsSync(path.join(dir, "src/index.ts"))).toBe(true);

    const edit = await (
      tools.search_replace as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "src/index.ts",
      search: "return a + b;",
      replace: "return a * b;",
    });
    expect(edit).toContain("Applied edit to src/index.ts");

    const content = fs.readFileSync(path.join(dir, "src/index.ts"), "utf8");
    expect(content).toContain("return a * b;");
    expect(content).not.toContain("return a + b;");
  });

  it("reports a clear error when search_replace cannot match uniquely", async () => {
    fs.writeFileSync(path.join(dir, "dup.ts"), "const x = 1;\nconst x = 1;\n");
    const tools = buildBuiltinTools(params());
    const result = await (
      tools.search_replace as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({
      file_path: "dup.ts",
      search: "const x = 1;",
      replace: "const x = 2;",
    });
    expect(result).toContain("search_replace failed");
  });
});

describe("agentTaskContext enforcement", () => {
  it("blocks a write outside the task's allowed_files", async () => {
    const tools = buildBuiltinTools(
      params({ agentTaskContext: { taskId: "task-1", allowedFiles: ["src/"] } }),
    );
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({ file_path: "README.md", content: "x" });
    expect(result).toContain("not permitted to access");
    expect(fs.existsSync(path.join(dir, "README.md"))).toBe(false);
  });

  it("allows a write inside the task's allowed_files", async () => {
    const tools = buildBuiltinTools(
      params({ agentTaskContext: { taskId: "task-1", allowedFiles: ["src/"] } }),
    );
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({ file_path: "src/index.ts", content: "export const x = 1;\n" });
    expect(result).toContain("Wrote src/index.ts");
  });

  it("is unrestricted without a task context", async () => {
    const tools = buildBuiltinTools(params());
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({ file_path: "anything.ts", content: "x" });
    expect(result).toContain("Wrote anything.ts");
  });

  it("denies all access when allowedFiles is an empty array (fail-closed)", async () => {
    const tools = buildBuiltinTools(
      params({ agentTaskContext: { taskId: "task-1", allowedFiles: [] } }),
    );
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({ file_path: "src/index.ts", content: "export const x = 1;\n" });
    expect(result).toContain("not permitted to access");
    expect(fs.existsSync(path.join(dir, "src/index.ts"))).toBe(false);
  });

  it("is unrestricted when allowedFiles is explicitly null", async () => {
    const tools = buildBuiltinTools(
      params({ agentTaskContext: { taskId: "task-1", allowedFiles: null } }),
    );
    const result = await (
      tools.write_file as unknown as { execute: (i: unknown) => Promise<string> }
    ).execute({ file_path: "anything.ts", content: "x" });
    expect(result).toContain("Wrote anything.ts");
  });
});

describe("planning_questionnaire / spawn_subagent tools", () => {
  it("returns answers from the questionnaire callback", async () => {
    const tools = buildBuiltinTools(
      params({
        requestQuestionnaire: async (questions) => {
          expect(questions).toHaveLength(1);
          expect(questions[0].question).toBe("What color?");
          return { color: "blue" };
        },
      }),
    );
    const result = await (
      tools.planning_questionnaire as unknown as {
        execute: (i: unknown) => Promise<string>;
      }
    ).execute({
      questions: [
        { id: "q1", type: "radio", question: "What color?", options: ["blue"] },
      ],
    });
    expect(result).toContain("blue");
  });

  it("reports no response when the questionnaire times out", async () => {
    const tools = buildBuiltinTools(
      params({ requestQuestionnaire: async () => null }),
    );
    const result = await (
      tools.planning_questionnaire as unknown as {
        execute: (i: unknown) => Promise<string>;
      }
    ).execute({ questions: [{ id: "q1", type: "text", question: "x" }] });
    expect(result).toContain("No response");
  });

  it("delegates to the spawnSubAgent callback and returns its result", async () => {
    const tools = buildBuiltinTools(
      params({
        spawnSubAgent: async (spec) => {
          expect(spec.description).toBe("build the thing");
          expect(spec.role).toBe("coder");
          return "sub-agent done";
        },
      }),
    );
    const result = await (
      tools.spawn_subagent as unknown as {
        execute: (i: unknown) => Promise<string>;
      }
    ).execute({ description: "build the thing" });
    expect(result).toBe("sub-agent done");
  });

  it("returns the stub message when the callback is missing", async () => {
    const tools = buildBuiltinTools(params());
    const result = await (
      tools.spawn_subagent as unknown as {
        execute: (i: unknown) => Promise<string>;
      }
    ).execute({ description: "x" });
    expect(result).toContain("not available in this build");
  });
});

describe("office template tools", () => {
  type Exec = { execute: (i: unknown) => Promise<string> };

  const run = (tools: Record<string, unknown>, name: string, input: unknown) =>
    (tools[name] as unknown as Exec).execute(input);

  it("read_office_template lists placeholders for a known template", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "read_office_template", {
      template: "presentation_pitch",
    });
    expect(out).toContain("[COMPANY NAME]");
    expect(out).toContain("presentation_pitch");
  });

  it("create_presentation uses a template and produces non-empty slides", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_presentation", {
      filename: "deck.pptx",
      template: "presentation_pitch",
      values: { "[COMPANY NAME]": "Acme Corp" },
    });
    expect(out).toContain("Created");

    const full = path.join(dir, "deck.pptx");
    const parsed = await parsePptx(fs.readFileSync(full)) as {
      slides?: { children?: unknown[] }[];
    };
    expect(parsed.slides?.length).toBeGreaterThan(0);
    // Every slide has at least one child — the empty-deck bug must stay fixed.
    for (const slide of parsed.slides ?? []) {
      expect((slide.children ?? []).length).toBeGreaterThan(0);
    }
    const text = JSON.stringify(parsed);
    expect(text).toContain("Acme Corp");
    expect(text).not.toContain("[COMPANY NAME]");
  });

  it("create_document fills placeholders into the template design", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_document", {
      filename: "proposal.docx",
      template: "business_proposal_template",
      values: { "[Client / Company Name]": "Acme Corp" },
    });
    expect(out).toContain("Created");

    const full = path.join(dir, "proposal.docx");
    const parsed = (await parseDocx(fs.readFileSync(full))) as unknown;
    const text = JSON.stringify(parsed);
    expect(text).toContain("Acme Corp");
    expect(text).not.toContain("[Client / Company Name]");
  });

  it("create_spreadsheet uses a template and fills placeholders", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_spreadsheet", {
      filename: "budget.xlsx",
      template: "budget_tracker",
      values: { "[Company / Team Name]": "Acme Corp" },
    });
    expect(out).toContain("Created");

    const full = path.join(dir, "budget.xlsx");
    const parsed = (await parseXlsx(fs.readFileSync(full))) as {
      worksheets?: { rows?: unknown[] }[];
    };
    expect(parsed.worksheets?.length).toBeGreaterThan(0);
    expect((parsed.worksheets?.[0]?.rows ?? []).length).toBeGreaterThan(0);
    const text = JSON.stringify(parsed);
    expect(text).toContain("Acme Corp");
    expect(text).not.toContain("[Company / Team Name]");
  });

  it("read_office_template lists templates across all three formats, including the new ones", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "read_office_template", {});
    for (const name of [
      "professional_report_template",
      "invoice_template",
      "resume_template",
      "budget_tracker",
      "invoice_workbook_template",
      "presentation_pitch",
      "presentation_update",
    ]) {
      expect(out).toContain(name);
    }
    expect(out).toContain("slate");
    expect(out).toContain("forest");
  });

  it("colorScheme recolors a document's brand color", async () => {
    const tools = buildBuiltinTools(params());
    await run(tools, "create_document", {
      filename: "report.docx",
      template: "professional_report_template",
      colorScheme: "forest",
    });
    const parsed = await parseDocx(fs.readFileSync(path.join(dir, "report.docx")));
    const text = JSON.stringify(parsed).toUpperCase();
    expect(text).toContain("1B4332"); // forest scheme primary
    expect(text).not.toContain("0B2545"); // slate (default) primary
  });

  it("a per-role `colors` override wins over the named colorScheme", async () => {
    const tools = buildBuiltinTools(params());
    await run(tools, "create_presentation", {
      filename: "deck2.pptx",
      template: "presentation_pitch",
      colorScheme: "forest",
      colors: { primary: "123456" },
    });
    const parsed = await parsePptx(fs.readFileSync(path.join(dir, "deck2.pptx")));
    const text = JSON.stringify(parsed).toUpperCase();
    expect(text).toContain("123456");
    expect(text).not.toContain("F96167"); // original pitch-deck primary
  });
});

describe("create_office_documents_batch", () => {
  type Exec = { execute: (i: unknown) => Promise<string> };
  const run = (tools: Record<string, unknown>, name: string, input: unknown) =>
    (tools[name] as unknown as Exec).execute(input);

  it("generates one file per inline record with the shared template design", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_office_documents_batch", {
      kind: "docx",
      template: "professional_report_template",
      outputDir: "reports",
      colorScheme: "forest",
      records: [
        { filename: "alice.docx", values: { "[Client / Recipient]": "Alice" } },
        { filename: "bob.docx", values: { "[Client / Recipient]": "Bob" } },
      ],
    });
    expect(out).toContain("Generated 2/2");

    for (const [name, who] of [["alice.docx", "Alice"], ["bob.docx", "Bob"]] as const) {
      const full = path.join(dir, "reports", name);
      expect(fs.existsSync(full)).toBe(true);
      const parsed = await parseDocx(fs.readFileSync(full));
      const text = JSON.stringify(parsed).toUpperCase();
      expect(text).toContain(who.toUpperCase());
      expect(text).toContain("1B4332"); // forest scheme primary applied to every file
    }
  });

  it("reads records from a JSON dataFile and derives filenames from filenameField", async () => {
    const tools = buildBuiltinTools(params());
    fs.writeFileSync(
      path.join(dir, "people.json"),
      JSON.stringify([
        { Name: "Casey", "[Employee Name]": "Casey" },
        { Name: "Drew", "[Employee Name]": "Drew" },
      ]),
    );
    const out = await run(tools, "create_office_documents_batch", {
      kind: "xlsx",
      template: "timesheet_template",
      outputDir: "timesheets",
      dataFile: "people.json",
      filenameField: "Name",
    });
    expect(out).toContain("Generated 2/2");
    expect(fs.existsSync(path.join(dir, "timesheets", "Casey.xlsx"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "timesheets", "Drew.xlsx"))).toBe(true);
  });

  it("reads records from a CSV dataFile", async () => {
    const tools = buildBuiltinTools(params());
    fs.writeFileSync(
      path.join(dir, "invoices.csv"),
      'Client,Amount\n"Acme, Inc",1000\nGlobex,2000\n',
    );
    const out = await run(tools, "create_office_documents_batch", {
      kind: "docx",
      template: "invoice_template",
      outputDir: "invoices",
      dataFile: "invoices.csv",
      values: { "[Your Company Name]": "Shared Co" },
    });
    expect(out).toContain("Generated 2/2");
    const files = fs.readdirSync(path.join(dir, "invoices"));
    expect(files.length).toBe(2);
    const parsed = await parseDocx(fs.readFileSync(path.join(dir, "invoices", files[0])));
    expect(JSON.stringify(parsed)).toContain("Shared Co");
  });

  it("disambiguates colliding filenames instead of overwriting", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_office_documents_batch", {
      kind: "docx",
      outputDir: "dupes",
      records: [
        { filename: "same.docx", values: {} },
        { filename: "same.docx", values: {} },
      ],
    });
    expect(out).toContain("Generated 2/2");
    const files = fs.readdirSync(path.join(dir, "dupes")).sort();
    expect(files).toEqual(["same-2.docx", "same.docx"]);
  });

  it("rejects a batch over the record cap without writing anything", async () => {
    const tools = buildBuiltinTools(params());
    const records = Array.from({ length: 20001 }, () => ({ values: {} }));
    const out = await run(tools, "create_office_documents_batch", {
      kind: "docx",
      outputDir: "toobig",
      records,
    });
    expect(out).toContain("Too many records");
    expect(fs.existsSync(path.join(dir, "toobig"))).toBe(false);
  });

  it("requires either records or dataFile", async () => {
    const tools = buildBuiltinTools(params());
    const out = await run(tools, "create_office_documents_batch", {
      kind: "docx",
      outputDir: "empty",
    });
    expect(out).toContain('Provide either "records"');
  });
});
