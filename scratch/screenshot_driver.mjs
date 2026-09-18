import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXE = "/home/kalim/dyad/out/Octopus Studio-linux-x64/octopus-studio";
const SHOT_DIR =
  "/tmp/claude-1000/-home-kalim-dyad/d75bdbf7-398c-4c40-a35f-b47f793fbc67/scratchpad/shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-shots-"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickHref(page, hrefPart) {
  const r = await page.evaluate((h) => {
    const els = [...document.querySelectorAll("a[href]")];
    const el = els.find((e) => e.getAttribute("href")?.includes(h));
    if (!el) return "NOT_FOUND";
    el.click();
    return "OK";
  }, hrefPart);
  return r;
}

async function main() {
  const app = await electron.launch({
    executablePath: EXE,
    args: ["--no-sandbox", "--enable-logging", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, E2E_TEST_BUILD: "true", OPENAI_API_KEY: "sk-test" },
    timeout: 40_000,
  });
  await sleep(6000);
  let page =
    app.windows().find((w) => !w.url().startsWith("devtools://")) ??
    (await app.firstWindow());
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(3000);
  await page.setViewportSize({ width: 1360, height: 860 });
  await sleep(500);

  // Dismiss the telemetry consent banner without opting in or out.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Later",
    );
    btn?.click();
  });
  await sleep(500);

  const shot = async (name) => {
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
    console.log("shot:", name);
  };

  await shot("01-home");

  const pages = [
    ["templates", "02-templates"],
    ["plugins", "03-plugins"],
    ["tasks", "04-tasks"],
    ["workers", "05-workers"],
    ["settings", "06-settings"],
  ];

  for (const [href, name] of pages) {
    const r = await clickHref(page, `/${href}`);
    console.log(`nav /${href} ->`, r);
    await sleep(1800);
    await shot(name);
  }

  await app.close().catch(() => {});
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
