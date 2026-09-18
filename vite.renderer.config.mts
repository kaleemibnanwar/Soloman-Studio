import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ReactCompilerConfig = {};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      // The dev app's userData lives at ./userData (see getUserDataPath()),
      // so Chromium's `Code Cache`/`Cache` and the sqlite DBs written there are
      // inside the Vite project root. Without this, every cache write triggers
      // a full page reload — a self-sustaining reload storm that shows as a
      // blank screen. Exclude it (and build output) from the watcher.
      ignored: ["**/userData/**", "**/.vite/**", "**/dist/**"],
    },
  },
});
