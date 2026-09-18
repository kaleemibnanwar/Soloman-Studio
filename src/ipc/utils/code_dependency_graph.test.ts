import { describe, expect, it } from "vitest";
import type { ChunkRecord } from "./code_index";
import {
  buildFileDependencyGraph,
  independentFileGroups,
  routeTask,
  SPLIT_1,
} from "./code_dependency_graph";

function chunk(
  file: string,
  symbol: string,
  dependencies: string[],
): ChunkRecord {
  return {
    id: `${file}::${symbol}`,
    file_path: file,
    symbol_name: symbol,
    kind: "function",
    start_line: 1,
    end_line: 2,
    hash: "h",
    signature: null,
    dependencies: JSON.stringify(dependencies),
  };
}

describe("buildFileDependencyGraph", () => {
  it("builds file→file edges from symbol call-callee data", () => {
    const graph = buildFileDependencyGraph([
      chunk("a.ts", "f", ["g"]),
      chunk("b.ts", "g", []),
    ]);
    expect(graph.outgoing.get("a.ts")).toEqual(new Set(["b.ts"]));
    expect(graph.incoming.get("b.ts")).toEqual(new Set(["a.ts"]));
  });

  it("ignores self-edges and unresolvable dependencies", () => {
    const graph = buildFileDependencyGraph([
      chunk("a.ts", "f", ["f", "unknown_symbol"]),
    ]);
    expect(graph.outgoing.get("a.ts")).toBeUndefined();
  });
});

describe("independentFileGroups", () => {
  it("groups transitively-connected files and isolates the rest", () => {
    const graph = buildFileDependencyGraph([
      chunk("a.ts", "f", ["g"]),
      chunk("b.ts", "g", []),
      chunk("c.ts", "h", []),
    ]);
    const groups = independentFileGroups(graph).map((g) => [...g].sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(["a.ts", "b.ts"]);
    expect(groups).toContainEqual(["c.ts"]);
  });

  it("returns singleton groups for files with no edges", () => {
    const graph = buildFileDependencyGraph([
      chunk("a.ts", "f", []),
      chunk("b.ts", "g", []),
    ]);
    const groups = independentFileGroups(graph).map((g) => [...g].sort());
    expect(groups).toHaveLength(2);
  });
});

describe("routeTask", () => {
  it("splits only with >=2 independent groups and score above SPLIT_1", () => {
    // Empty graph → the two files are independent singleton groups.
    const graph = buildFileDependencyGraph([]);
    const tenSymbols = ["f", "g", "h", "i", "j", "k", "l", "m", "n", "o"];

    // Two groups but trivial scope → single agent.
    expect(
      routeTask(
        { files: ["a.ts", "b.ts"], symbols: ["f"], estimatedDiffLoc: 1 },
        graph,
        SPLIT_1,
      ).multiAgent,
    ).toBe(false);

    // Large scope and two independent groups → multi-agent.
    expect(
      routeTask(
        { files: ["a.ts", "b.ts"], symbols: tenSymbols, estimatedDiffLoc: 500 },
        graph,
        SPLIT_1,
      ).multiAgent,
    ).toBe(true);

    // Large scope but a single connected group → still a single agent.
    const connected = buildFileDependencyGraph([
      chunk("a.ts", "f", ["g"]),
      chunk("b.ts", "g", []),
    ]);
    const decision = routeTask(
      { files: ["a.ts", "b.ts"], symbols: tenSymbols, estimatedDiffLoc: 500 },
      connected,
      SPLIT_1,
    );
    expect(decision.groups).toHaveLength(1);
    expect(decision.multiAgent).toBe(false);
  });

  it("computes groups restricted to the task's files, not the whole repo", () => {
    const graph = buildFileDependencyGraph([
      chunk("a.ts", "f", ["g"]),
      chunk("b.ts", "g", []),
      chunk("unrelated.ts", "h", []),
    ]);
    // Only a.ts + b.ts are implicated; unrelated.ts must not appear.
    const groups = independentFileGroups(graph, ["a.ts", "b.ts"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.arrayContaining(["a.ts", "b.ts"]));
    expect(groups[0]).not.toContain("unrelated.ts");
  });
});
