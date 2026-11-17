import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const EXE = "/home/kalim/dyad/out/Octopus Studio-linux-x64/octopus-studio";
const SHOT_DIR =
  "/tmp/claude-1000/-home-kalim-dyad/d75bdbf7-398c-4c40-a35f-b47f793fbc67/scratchpad/shots";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-personas-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const app = await electron.launch({
    executablePath: EXE,
    args: ["--no-sandbox", "--enable-logging", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, E2E_TEST_BUILD: "true", OPENAI_API_KEY: "sk-test" },
    timeout: 40000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(3500);
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.evaluate(() => {
    const els = [...document.querySelectorAll("a[href]")];
    els.find((e) => e.getAttribute("href")?.includes("/workers"))?.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Team Personas",
    );
    btn?.click();
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOT_DIR, "05b-workers-personas.png") });
  console.log("shot done");
  await app.close().catch(() => {});
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
