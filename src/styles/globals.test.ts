import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8").replaceAll(
  "\r\n",
  "\n",
);

describe("Studio design tokens", () => {
  it("keeps one valid sidebar token system", () => {
    expect(css).toContain("--sidebar: oklch(");
    expect(css).toContain("--sidebar-foreground: oklch(");
    expect(css).not.toContain("--sidebar-background:");
  });

  it("provides the shared workspace and elevated surface treatments", () => {
    expect(css).toContain(".studio-canvas {");
    expect(css).toContain(".studio-surface {");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
