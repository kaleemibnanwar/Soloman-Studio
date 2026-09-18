import fs from "fs";
import path from "path";
import { generateText, tool } from "ai";
import { exec } from "child_process";
import { z } from "zod";
import { createOctopusStudioEngine } from "../../src/ipc/utils/llm_engine_provider";
import dotenv from "dotenv";

// Load environment variables for the engine
dotenv.config({ path: path.join(__dirname, "../../.env") });

const OCTOPUS_STUDIO_ENGINE_URL =
  process.env.OCTOPUS_STUDIO_ENGINE_URL || "https://engine.octopusstudio.sh/v1";

const provider = createOctopusStudioEngine({
  apiKey: process.env.OCTOPUS_STUDIO_PRO_API_KEY || "dummy",
  baseURL: OCTOPUS_STUDIO_ENGINE_URL,
  octopusStudioOptions: {
    enableLazyEdits: false,
    enableSmartFilesContext: false,
    enableWebSearch: true,
  },
  settings: {} as any,
});

// Using the built-in Octopus Studio (formerly Dyad) anthropic model provider
const model = provider.anthropic("claude-3-5-sonnet-20241022", {
  providerId: "octopus-studio-engine",
});

const tools = {
  executeBash: tool({
    description: "Execute a bash command in the projects directory",
    parameters: z.object({ command: z.string() }),
    execute: async ({ command }: { command: string }) => {
      const cwd = path.join(__dirname, "projects");
      if (!fs.existsSync(cwd)) fs.mkdirSync(cwd, { recursive: true });
      return new Promise<{ stdout: string; stderr: string; error?: string }>(
        (resolve) => {
          exec(command, { cwd }, (error, stdout, stderr) => {
            resolve({ stdout, stderr, error: error?.message });
          });
        },
      );
    },
  }),
  readFile: tool({
    description: "Read a file from the workspace",
    parameters: z.object({ filepath: z.string() }),
    execute: async ({ filepath }: { filepath: string }) => {
      try {
        const fullPath = path.join(__dirname, filepath);
        return { content: fs.readFileSync(fullPath, "utf-8") };
      } catch (e: any) {
        return { error: e.message };
      }
    },
  }),
  writeFile: tool({
    description: "Write content to a file",
    parameters: z.object({ filepath: z.string(), content: z.string() }),
    execute: async ({
      filepath,
      content,
    }: {
      filepath: string;
      content: string;
    }) => {
      try {
        const fullPath = path.join(__dirname, filepath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
        return { success: true };
      } catch (e: any) {
        return { error: e.message };
      }
    },
  }),
};

async function runCycle(cycle: number) {
  console.log(`\n=== Cycle ${cycle} ===`);

  const consensusPath = path.join(__dirname, "memories", "consensus.md");
  const promptPath = path.join(__dirname, "PROMPT.md");
  const claudePath = path.join(__dirname, "CLAUDE.md");

  const consensus = fs.existsSync(consensusPath)
    ? fs.readFileSync(consensusPath, "utf-8")
    : "";
  const prompt = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf-8")
    : "";
  const charter = fs.existsSync(claudePath)
    ? fs.readFileSync(claudePath, "utf-8")
    : "";

  const systemMessage = `
You are running within the Auto Org Automation Engine using the native Octopus Studio agents infrastructure.
${charter}

${prompt}

# Current Memory / Consensus:
${consensus}
  `;

  console.log("Generating response via Octopus Studio built-in agent...");

  try {
    const { text } = await generateText({
      model,
      system: systemMessage,
      prompt:
        "Execute the next cycle. Read the Next Action, use tools if necessary, and update memories/consensus.md.",
      tools,
    });

    console.log("Cycle Completed. Agent Summary:\n", text);
  } catch (err: any) {
    console.error("Cycle failed:", err.message);
    throw err;
  }
}

async function startAutoOrgDaemon() {
  console.log("Starting Auto Org Daemon...");
  let cycle = 1;
  while (true) {
    try {
      await runCycle(cycle);
      console.log(`Cycle ${cycle} finished successfully. Sleeping for 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
    } catch {
      console.log("Backing off for 30s...");
      await new Promise((r) => setTimeout(r, 30000));
    }
    cycle++;
  }
}

// Auto-start if run directly
if (require.main === module) {
  startAutoOrgDaemon();
}
