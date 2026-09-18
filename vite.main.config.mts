import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import path from "path";

const nodeBuiltins = builtinModules.flatMap((name) => [name, `node:${name}`]);

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pg-schema-classifier": path.resolve(
        __dirname,
        "./packages/pg-schema-classifier/src/index.ts",
      ),
      "ts-pg-schema-diff": path.resolve(__dirname, "./packages/ts-pg-schema-diff/src/index.ts"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        ...nodeBuiltins,
        "better-sqlite3",
        // linkedom has an optional `canvas` peer dependency and wraps its
        // require in a try/catch fallback. Keep it external so Vite leaves the
        // native require intact instead of replacing it with a runtime error.
        "canvas",
        "octopus-studio-keychain-reader",
        "node-pty",
        "mustardscript",
        "pg",
        // ws's buffer-util.js reassigns `module.exports.unmask`/`.mask` after
        // a try/catch `require('bufferutil')` for its optional native
        // accelerator. Bundling breaks that reassignment (consumers end up
        // with the pre-reassignment export), producing a runtime
        // "e.unmask is not a function" crash the first time a frame is
        // sent/received. Keep it external so Node's real CommonJS loader
        // handles the reassignment correctly, same as `canvas` above.
        "ws",
        // office-open (docx/pptx/xlsx) is a large ESM package with the full
        // OOXML schema; bundling it into the main process hangs the build.
        // Ship it in node_modules and load it at runtime instead.
        /^office-open(\/|$)/,
        /^@office-open\//,
      ],
    },
  },
  plugins: [
    {
      name: "restart",
      closeBundle() {
        process.stdin.emit("data", "rs");
      },
    },
  ],
});
