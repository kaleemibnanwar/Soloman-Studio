import { describe, expect, it } from "vitest";
import { basenameOf, joinPath, parentDirOf, resolveDestPath } from "../fileTreePaths";

describe("parentDirOf", () => {
  it("returns the parent of a nested path", () => {
    expect(parentDirOf("src/a/b.ts")).toBe("src/a");
  });

  it("returns empty for a root-level path", () => {
    expect(parentDirOf("README.md")).toBe("");
  });
});

describe("joinPath", () => {
  it("joins a directory and name", () => {
    expect(joinPath("src", "a.ts")).toBe("src/a.ts");
  });

  it("returns the name alone for the root", () => {
    expect(joinPath("", "a.ts")).toBe("a.ts");
  });
});

describe("basenameOf", () => {
  it("returns the last segment", () => {
    expect(basenameOf("src/a.ts")).toBe("a.ts");
    expect(basenameOf("a.ts")).toBe("a.ts");
  });
});

describe("resolveDestPath", () => {
  const existing = new Set(["a.txt", "dir/a.txt"]);

  it("returns the destination unchanged when free", () => {
    expect(resolveDestPath(existing, "b.txt")).toBe("b.txt");
  });

  it("appends (2) before the extension on collision", () => {
    expect(resolveDestPath(existing, "a.txt")).toBe("a (2).txt");
  });

  it("keeps incrementing past further collisions", () => {
    const used = new Set(["a.txt", "a (2).txt", "a (3).txt"]);
    expect(resolveDestPath(used, "a.txt")).toBe("a (4).txt");
  });

  it("preserves hidden-file names with a leading dot", () => {
    const used = new Set([".gitignore"]);
    expect(resolveDestPath(used, ".gitignore")).toBe(".gitignore (2)");
  });

  it("handles extensionless names", () => {
    const used = new Set(["LICENSE"]);
    expect(resolveDestPath(used, "LICENSE")).toBe("LICENSE (2)");
  });

  it("keeps the destination under its original directory", () => {
    expect(resolveDestPath(existing, "dir/a.txt")).toBe("dir/a (2).txt");
  });
});
