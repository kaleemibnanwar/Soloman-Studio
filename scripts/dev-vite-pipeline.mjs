// Development-mode replacement for Electron Forge's `VitePlugin`: runs a Vite
// dev server for the renderer (for HMR) and watch-builds main/preload/worker
// scripts to disk, restarting Electron whenever one of those rebuilds.
import path from "node:path";
import { build, createServer } from "vite";

// Must build before the worker and preload configs below, which all target
// the same `dist/main` output directory with `emptyOutDir: false` (see
// vite.main.config.mts, the worker configs, and vite.preload.config.mts).
const WATCHED_CONFIGS_IN_ORDER = [
  "vite.main.config.mts",
  "vite.code-explorer-worker.config.mts",
  "vite.sandbox-worker.config.mts",
  "vite.supabase-dependency-analysis-worker.config.mts",
  "vite.preload.config.mts",
];

async function watchConfig(repoRoot, configFile, onRebuild) {
  const configPath = path.join(repoRoot, configFile);
  let firstBuildDone = false;

  const watcher = await build({
    configFile: configPath,
    root: repoRoot,
    build: { watch: {} },
  });

  await new Promise((resolve, reject) => {
    watcher.on("event", (event) => {
      if (event.code === "END") {
        if (!firstBuildDone) {
          firstBuildDone = true;
          resolve();
        } else {
          onRebuild(configFile);
        }
      } else if (event.code === "ERROR") {
        if (!firstBuildDone) {
          reject(event.error);
        } else {
          console.error(`[dev] ${configFile} rebuild failed:`, event.error);
        }
      }
    });
  });

  return watcher;
}

export async function startDevBuildPipeline({ repoRoot, onRebuild }) {
  const rendererServer = await createServer({
    configFile: path.join(repoRoot, "vite.renderer.config.mts"),
    root: repoRoot,
  });
  await rendererServer.listen();
  const rendererUrl = rendererServer.resolvedUrls?.local?.[0];
  if (!rendererUrl) {
    throw new Error("Vite dev server for the renderer did not report a local URL");
  }

  const watchers = [];
  for (const configFile of WATCHED_CONFIGS_IN_ORDER) {
    // Sequential on purpose: main must finish (and empty dist/main) before the
    // worker configs write into the same directory.
    // eslint-disable-next-line no-await-in-loop
    const watcher = await watchConfig(repoRoot, configFile, onRebuild);
    watchers.push(watcher);
  }

  return {
    rendererUrl,
    async close() {
      await rendererServer.close();
      await Promise.all(watchers.map((watcher) => watcher.close()));
    },
  };
}
