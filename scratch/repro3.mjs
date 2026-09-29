import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";
import * as eph from "electron-playwright-helpers";

const APP_DIR = "/home/kalim/dyad";
const SHOT_DIR = "/tmp/shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const EXE = "/home/kalim/dyad/out/Octopus Studio-linux-x64/octopus-studio";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-repro3-"));

const fixtureSourceEarly = path.join(APP_DIR, "e2e-tests/fixtures/import-app/minimal");
const child = spawn(
  EXE,
  ["--no-sandbox", `--user-data-dir=${userDataDir}`, "--remote-debugging-port=9333"],
  {
    cwd: fixtureSourceEarly,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0", OPENAI_API_KEY: "sk-test" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let combined = "";
child.stdout.on("data", (d) => {
  combined += d;
  fs.appendFileSync(path.join(SHOT_DIR, "main-stdout.log"), d);
});
child.stderr.on("data", (d) => {
  combined += d;
  fs.appendFileSync(path.join(SHOT_DIR, "main-stderr.log"), d);
});

async function waitForDevtools(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = combined.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("DevTools URL not seen within timeout. Output so far:\n" + combined);
}

const wsUrl = await waitForDevtools(20000);
console.log("DevTools URL:", wsUrl);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
console.log("connected via CDP");
const contexts = browser.contexts();
console.log("contexts:", contexts.length);
let page = null;
for (const ctx of contexts) {
  for (const p of ctx.pages()) {
    console.log("  page url:", p.url());
    if (!p.url().startsWith("devtools://")) page = p;
  }
}
if (!page) {
  await new Promise((r) => setTimeout(r, 3000));
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      console.log("  (retry) page url:", p.url());
      if (!p.url().startsWith("devtools://")) page = p;
    }
  }
}

if (!page) {
  console.log("NO PAGE FOUND");
  process.exit(1);
}

const logStream = fs.createWriteStream(path.join(SHOT_DIR, "console.log"));
page.on("console", (msg) => logStream.write(`[renderer:${msg.type()}] ${msg.text()}\n`));
page.on("pageerror", (err) => logStream.write(`[pageerror] ${err.message}\n${err.stack ?? ""}\n`));

await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SHOT_DIR, "01-landing.png") });
console.log("landing screenshot taken");

const fixtureSource = path.join(APP_DIR, "e2e-tests/fixtures/import-app/minimal");
const tempDir = path.join(os.tmpdir(), `octopus-import-repro3-${Date.now()}`);
fs.cpSync(fixtureSource, tempDir, { recursive: true });
console.log("fixture at", tempDir);

async function clickText(text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
    const el =
      els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t));
    if (!el) return "NOT_FOUND";
    el.click();
    return "OK:" + el.tagName;
  }, text);
}

console.log("click Import Project ->", await clickText("Import Project"));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOT_DIR, "02-import-dialog.png") });
console.log("body text after Import Project click:");
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));

console.log("click Programming project ->", await clickText("Programming project"));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOT_DIR, "03-programming-project.png") });
console.log("body text after Programming project click:");
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));

console.log("click Select Folder ->", await clickText("Select Folder"));
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const t = await page.evaluate(() => document.body.innerText);
  console.log(`+${(i + 1) * 5}s still-selecting?`, t.includes("Selecting folder"));
  if (!t.includes("Selecting folder")) {
    console.log("RESOLVED body:", t.slice(0, 1500));
    break;
  }
}
await page.screenshot({ path: path.join(SHOT_DIR, "04-selected.png") });

// Click the Import button specifically INSIDE the dialog (not the sidebar "Import" button).
const importResult = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]') ?? document.body;
  const btns = [...dialog.querySelectorAll("button")];
  const btn = btns.find((b) => b.textContent?.trim() === "Import");
  if (!btn) return "NOT_FOUND";
  if (btn.disabled) return "DISABLED";
  btn.click();
  return "CLICKED";
});
console.log("click dialog Import button ->", importResult);

for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const url = page.url();
  const selectedAppIdText = await page.evaluate(() => {
    try {
      const raw =
        localStorage.getItem("jotai-selectedAppId") ?? localStorage.getItem("selectedAppId");
      return raw;
    } catch {
      return "N/A";
    }
  });
  console.log(`+${i + 1}s url=${url} localStorageSelectedAppId=${selectedAppIdText}`);
  if (i % 3 === 0) {
    await page.screenshot({ path: path.join(SHOT_DIR, `05-after-import-${i}.png`) });
  }
}

// Give the runtime time to auto-install + start the dev server for the newly
// imported app, then dump the relevant main-process log lines.
console.log("waiting up to 60s for app runtime to start...");
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(SHOT_DIR, `06-runtime-wait-${i}.png`) });
}

const mainLog = path.join(userDataDir, "logs", "main.log");
if (fs.existsSync(mainLog)) {
  const lines = fs.readFileSync(mainLog, "utf8").split("\n");
  const relevant = lines.filter((l) =>
    /Starting app|app_runtime_service|No projects found|error running app|proxy|dev server|Local:|ready/i.test(
      l,
    ),
  );
  console.log("--- relevant main.log lines ---");
  console.log(relevant.join("\n"));
} else {
  console.log("no main.log found at", mainLog);
}

console.log("userDataDir", userDataDir);
await browser.close();
console.log("DONE");
child.kill("SIGKILL");
process.exit(0);
