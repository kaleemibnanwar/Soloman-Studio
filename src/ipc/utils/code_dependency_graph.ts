import type { ChunkRecord } from "./code_index";

/**
 * File-level dependency graph + deterministic task routing, built from the
 * existing symbol index (Octopus-Studio Implementation Guide v1.1, §7).
 *
 * The index records per-symbol call-callee identifiers (`ChunkRecord.dependencies`,
 * a JSON string array). This module resolves those identifiers back to the files
 * that define them within the same index, producing file→file edges, then derives
 * connected components for `independent_file_groups` and a single deterministic
 * routing decision — no LLM call, no confidence/complexity heuristics.
 */

export interface FileDependencyGraph {
  files: Set<string>;
  /** file → set of files it depends on (fan-out). */
  outgoing: Map<string, Set<string>>;
  /** file → set of files that depend on it (fan-in). */
  incoming: Map<string, Set<string>>;
}

function parseDependencies(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

function ensure(map: Map<string, Set<string>>, key: string): Set<string> {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  return set;
}

export function buildFileDependencyGraph(chunks: ChunkRecord[]): FileDependencyGraph {
  const files = new Set<string>();
  // symbol name → files that define it (best-effort; the index doesn't track
  // imports, so this is call-callee resolution, not module resolution).
  const symbolDefs = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    files.add(chunk.file_path);
    ensure(symbolDefs, chunk.symbol_name).add(chunk.file_path);
  }

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    for (const dep of parseDependencies(chunk.dependencies)) {
      const defFiles = symbolDefs.get(dep);
      if (!defFiles) continue;
      for (const target of defFiles) {
        if (target === chunk.file_path) continue; // self-edge, ignore
        ensure(outgoing, chunk.file_path).add(target);
        ensure(incoming, target).add(chunk.file_path);
      }
    }
  }
  return { files, outgoing, incoming };
}

/**
 * Connected components over the file dependency graph (undirected reachability),
 * optionally restricted to a subset of files (a task's implicated files). Two
 * files share a group when one depends on the other, directly or transitively,
 * and both are in the restricted set (induced subgraph). Returns groups
 * largest-first; files with no edges are their own singleton group.
 */
export function independentFileGroups(
  graph: FileDependencyGraph,
  restrictTo?: string[],
): string[][] {
  const relevant = restrictTo ? new Set(restrictTo) : graph.files;
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const file of relevant) {
    if (visited.has(file)) continue;
    const group: string[] = [];
    const stack = [file];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      for (const neighbor of graph.outgoing.get(current) ?? []) {
        if (relevant.has(neighbor) && !visited.has(neighbor)) stack.push(neighbor);
      }
      for (const neighbor of graph.incoming.get(current) ?? []) {
        if (relevant.has(neighbor) && !visited.has(neighbor)) stack.push(neighbor);
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

export interface TaskRoutingInput {
  /** Files implicated by the task (from deterministic retrieval). */
  files: string[];
  /** Distinct symbols implicated by the task. */
  symbols: string[];
  /** Estimated diff size in lines of code (deterministic, e.g. from retrieval size). */
  estimatedDiffLoc: number;
}

/**
 * The single calibrated constant in the system (§7). Start at a rough estimate
 * and retune from the §26 budget reports; do not add separate thresholds for
 * confidence, complexity, or token count.
 */
export const SPLIT_1 = 8;

export interface RoutingDecision {
  multiAgent: boolean;
  score: number;
  /** Independent file groups over the task's files — the input to `create_task_dag`. */
  groups: string[][];
}

/**
 * Deterministic routing (§7): split into a multi-agent DAG only when there are
 * ≥2 independent file groups over the task's implicated files AND the score
 * clears `split1`. Otherwise a single agent handles the task. Computed from the
 * dependency graph, never by an LLM. `estimatedDiffLoc` must be derived
 * deterministically (e.g. from retrieval size), not estimated by a model call.
 */
export function routeTask(
  input: TaskRoutingInput,
  graph: FileDependencyGraph,
  split1: number = SPLIT_1,
): RoutingDecision {
  const groups = independentFileGroups(graph, input.files);
  const score =
    input.files.length +
    0.5 * input.symbols.length +
    Math.log(1 + input.estimatedDiffLoc);
  return {
    multiAgent: groups.length >= 2 && score > split1,
    score,
    groups,
  };
}
