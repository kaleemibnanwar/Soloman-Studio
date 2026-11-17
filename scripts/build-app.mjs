#!/usr/bin/env node
// Production build for the app's 6 Vite targets (main, preload, renderer, and
// 3 worker scripts), replacing what Electron Forge's `VitePlugin` used to do
// as an implicit step of `electron-forge package`/`make`.
//
// Order matters: the 3 worker configs and the preload config all write into
// `dist/main` alongside `main.js` with `emptyOutDir: false` (main.ts resolves
// preload.js and each worker script relative to its own __dirname), so the
// main build — which empties `dist/main` — must run before them.
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const configsInOrder = [
  "vite.main.config.mts",
  "vite.code-explorer-worker.config.mts",
  "vite.sandbox-worker.config.mts",
  "vite.supabase-dependency-analysis-worker.config.mts",
  "vite.preload.config.mts",
  "vite.renderer.config.mts",
];

async function buildApp() {
  for (const configFile of configsInOrder) {
    const configPath = path.join(repoRoot, configFile);
    console.log(`[build-app] building ${configFile}`);
    await build({ configFile: configPath, root: repoRoot });
  }
}

buildApp().catch((error) => {
  console.error("[build-app] failed:", error);
  process.exitCode = 1;
});
