import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXE = "/home/kalim/dyad/out/Octopus Studio-linux-x64/octopus-studio";
const SHOT_DIR =
  "/tmp/claude-1000/-home-kalim-dyad/d75bdbf7-398c-4c40-a35f-b47f793fbc67/scratchpad/shots";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-repro-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickHref(page, hrefPart) {
  return page.evaluate((h) => {
    const els = [...document.querySelectorAll("a[href]")];
    const el = els.find((e) => e.getAttribute("href")?.includes(h));
    if (!el) return "NOT_FOUND";
    el.click();
    return "OK";
  }, hrefPart);
}

async function main() {
  const app = await electron.launch({
    executablePath: EXE,
    args: ["--no-sandbox", "--enable-logging", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, E2E_TEST_BUILD: "true", OPENAI_API_KEY: "sk-test" },
    timeout: 40_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(3500);
  await page.setViewportSize({ width: 1360, height: 860 });

  console.log("--- nav straight to workers from home ---");
  console.log(await clickHref(page, "/workers"));
  await sleep(3000);
  await page.screenshot({ path: path.join(SHOT_DIR, "repro-1-workers-first-visit.png") });
  const errText1 = await page.evaluate(() =>
    [...document.querySelectorAll("body")][0].innerText.includes("trusted Octopus Studio renderer"),
  );
  console.log("has trust error (1st visit, 3s wait):", errText1);

  console.log("--- go home, then back to workers again ---");
  await clickHref(page, "/");
  await sleep(1500);
  await clickHref(page, "/workers");
  await sleep(3000);
  await page.screenshot({ path: path.join(SHOT_DIR, "repro-2-workers-second-visit.png") });
  const errText2 = await page.evaluate(() =>
    document.body.innerText.includes("trusted Octopus Studio renderer"),
  );
  console.log("has trust error (2nd visit):", errText2);

  await app.close().catch(() => {});
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
