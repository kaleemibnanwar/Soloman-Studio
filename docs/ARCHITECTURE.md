# Soloman Studio — Architecture & Engineering Notes

This document describes how Soloman Studio works under the hood: the agent and
orchestration engine, how chats / projects / conversations are modeled, the
deterministic state-machine core, and the specific optimizations and techniques
in use. It is written for engineers working in this codebase, so every section
points at the code that implements it.

> Status note: this documents the system as it currently is. A few
> deliberately-deferred items are called out at the end ("Planned but not wired").

---

## 1. What Soloman Studio is

Soloman Studio is a **local, AI-powered app builder**. A user chats with an
assistant in a desktop (Electron) app; the assistant reads, edits, and runs a
real web app whose live preview sits in an iframe beside the chat. Under the
hood it is a **deterministic orchestration engine** that treats the "plan" as a
first-class data structure and runs LLM calls as _inference services invoked by
that engine_ — not as an ad-hoc chat loop with tool calls.

The core principle:

> **The orchestrator is a stateful workflow engine. LLM calls are inference
> services invoked by it.** The plan is a DAG in a database, not prose in a
> message history. This is what makes resume, retry, parallelization, and audit
> reliable.

---

## 2. Top-level architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Renderer (React + Jotai)                                     │
│  chat UI · preview iframe · plan panel · task/cost summaries  │
├───────────────────────────────────────────────────────────────┤
│  IPC contract layer (typed invoke/event channels)             │
├───────────────────────────────────────────────────────────────┤
│  Main process (Electron)                                      │
│   ├─ chat-stream handler (the per-turn engine)                │
│   ├─ agent/  orchestrator + tools + state (this is the engine)│
│   ├─ deterministic state machines (chat_stream, app_run, …)   │
│   └─ model clients (provider-agnostic)                        │
├───────────────────────────────────────────────────────────────┤
│  Persistence: SQLite (Drizzle)                                │
│  apps · chats · messages · agent_tasks · agent_artifacts · …  │
├───────────────────────────────────────────────────────────────┤
│  Sandboxed workers (code explorer, supabase analysis, …)      │
└───────────────────────────────────────────────────────────────┘
```

Directory map (the important parts):

| Path                                                         | Role                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/ipc/agent/`                                             | The orchestration engine: orchestrator, tools, budgets, roles, cache, pricing       |
| `src/ipc/handlers/chat_stream_handlers.ts`                   | The per-turn chat engine (prompt → stream → tools → sub-agents)                     |
| `src/ipc/{office,mcp,git,neon,google,media,process,vercel}/` | Domain tool modules                                                                 |
| `src/chat_stream/`                                           | Chat-stream state machine (host state, transitions, transport)                      |
| `src/app_run/`                                               | App-running lifecycle state machine                                                 |
| `src/state_machines/`                                        | The reusable deterministic state-machine framework (`cosim`, `keyed_host`, `trace`) |
| `src/distributed_machines/`                                  | State machines spanning the main/renderer process boundary                          |
| `src/db/schema.ts`                                           | The SQLite schema (Drizzle)                                                         |
| `src/prompts/`                                               | System prompts (local-agent, plan-mode, compaction, …)                              |

---

## 3. Data model

The persistence layer is **SQLite** via **Drizzle** (`src/db/schema.ts`).

### 3.1 Apps (the thing being built)

- `apps` — a project/application the user is building. Has a path, framework,
  blueprint, etc. The live preview runs the code in this app.

### 3.2 Chats & messages (the conversation)

- `chats` — a conversation scoped to one `appId`. Carries:
  - `title`, `chatMode`, `modelSelection`
  - **compaction state** — `compactedAt`, `compactionBackupPath`, `pendingCompaction`
  - `referencedAppIds` — `@app:Name` mentions, stored as ids so they survive compaction
  - `isFavorite`
- `messages` — `user`/`assistant` rows with:
  - `approvalState`, `sourceCommitHash` / `commitHash` (code version at send time)
  - **token accounting** — `maxTokensUsed`, `outputTokensUsed`, `inputTokensUsed`, `modelCallCount`

The `messages` table is the _source of truth_ for the conversation. Compaction
rewrites history, which is why cross-turn references (referenced apps) are
stored on the chat row, not derived from message text.

### 3.3 Agent orchestration state (the task graph store)

Dedicated tables separate from chat history — this is what makes "continue"
correct rather than re-summarized:

- `agent_tasks` — one row per sub-task. `role`, `dependencies` (DAG edges),
  `allowed_files`/`allowed_symbols` (permission boundary), three budgets
  (`context_budget`, `output_budget`, `execution_budget`), `status`.
- `agent_artifacts` — the structured result envelope per task
  (`{ status, outputs, notes, model, tokens, costUsd }`), never prose.
- `agent_events` — started / completed / partial / failed events (audit trail).
- `agent_locks`, `agent_messages` — reserved for a later increment (currently unused).

---

## 4. Chat modes

Four active modes (`src/lib/schemas.ts`):

| Mode          | Behavior                                              |
| ------------- | ----------------------------------------------------- |
| `build`       | Inject full codebases into the prompt; MCP tools only |
| `ask`         | Read-only tools; no code mutation                     |
| `local-agent` | Tool-calling agent (the main path)                    |
| `plan`        | Plan-first: emit a plan, then execute                 |

`isLocalAgentBackedMode()` returns true for `ask`/`plan`/`local-agent` — these
route through the tool-calling engine. `build` is the legacy "inject everything"
path.

A cheap **mode classifier** (`src/ipc/handlers/chat_mode_classifier_handlers.ts`)
classifies an incoming prompt into ASK / BUILD / AGENT so the user doesn't have
to pick a mode manually.

---

## 5. The agent & orchestration engine

This is the heart of the system, living in `src/ipc/agent/`.

### 5.1 The main agent is a planner + synthesizer, not a step-by-step delegator

The main agent (`buildBuiltinTools` in `src/ipc/agent/tools.ts`) gets a
**minimal tool schema**:

- core tools (read/write/grep/git/run/skills)
- `spawn_subagent` and `plan_task_graph` (delegation)
- `list_mcp_servers` (discovery)

It deliberately does **not** get heavy or specialized tools. Instead it
delegates via sub-agents.

### 5.2 Sub-agents have typed roles with tool allowlists

Roles (`src/ipc/agent/task_types.ts`): `explorer`, `executor`, `tester`,
`debugger`, `reviewer`, `architect`, `verifier`.

Each role gets a **minimal tool allowlist** (in `tools.ts`) — a smaller schema
is fewer tokens per call _and_ structural scope containment:

| Role                                  | Tool surface                                   |
| ------------------------------------- | ---------------------------------------------- |
| `explorer` / `reviewer` / `architect` | read-only (list/read/grep/search/explore/logs) |
| `tester` / `verifier`                 | read + `execute_sandbox_script`                |
| `executor` / `debugger`               | full tool set                                  |

Each role also has a **token/call budget** (`ROLE_BUDGETS` in
`src/ipc/agent/task_types.ts`): `contextBudget`, `outputBudget`, and
`executionBudget` (max model calls). `executionBudget` is enforced as the
sub-agent's step limit (`stepCountIs(budget.executionBudget)`), and
`contextBudget` is enforced by truncating the dynamic sub-task context before
the call (`limitContextTokens`); `outputBudget` is stored on the task row as
metadata for observability.

### 5.3 Task graph (DAG) — the plan is data

`plan_task_graph` submits a DAG:

```json
{
  "subtasks": [
    { "id": "s1", "goal": "…", "role": "explorer", "depends_on": [] },
    { "id": "s2", "goal": "…", "role": "executor", "depends_on": ["s1"] }
  ]
}
```

The scheduler (`planTaskGraph` in `src/ipc/agent/orchestrator.ts`) is
**deterministic code, not an LLM**: it starts every ready node, gates on
`depends_on`, and breaks on a cycle. Node state lives in the `agent_tasks`
table, so "continue" resumes from graph state, not from re-summarized prose.

### 5.4 Concurrency — bounded, not a mutex

Sub-agents run through a `Semaphore` (`src/ipc/agent/semaphore.ts`) with a
configurable limit (`OCTOPUS_STUDIO_AGENT_CONCURRENCY`, default 3). Independent
DAG nodes run in parallel up to that bound; the permit is always released in a
`finally`. (This replaced an earlier mutex that was acquired but never
released — a deadlock.)

### 5.5 Model-tier routing — the biggest cost lever

`src/ipc/agent/role_model.ts` maps roles to a model tier:

- **fast** (`explorer`/`reviewer`/`verifier`/`tester`) → the user's lightweight `routerModel`
- **strong** (everything else) → the primary `selectedModel`

Read-only work runs on a cheap model; write/reasoning work keeps the frontier
model. Fully provider-agnostic: the chosen tier is just a `LargeLanguageModel`
handed to `getModelClient`.

### 5.6 Result cache — skip the LLM entirely

`src/ipc/agent/result_cache.ts` is an in-memory LRU keyed on
`hash(role, goal, context)`. Fast (read-only) roles check it _before_ any model
round-trip, so a repeated "read and summarize X" subtask costs zero tokens.

### 5.7 Permission boundary

Each sub-task declares `allowed_files`/`allowed_symbols`. `buildBuiltinTools`
wraps file-mutating tools so a call outside the boundary is refused with a
structured block message (`fileAccessBlock`). The main agent passes `null`
(unrestricted); sub-agents are scoped to what their task declares.

### 5.8 MCP is lazy and delegated

MCP tool schemas are **never loaded into the main agent** — that would bloat
every turn with every enabled server's schemas. Instead:

- the main agent discovers servers via `list_mcp_servers`
- it delegates via `spawn_subagent(mcp_servers: [...])`
- the sub-agent loads **only the named servers'** tools
  (`src/ipc/agent/orchestrator.ts`)

### 5.9 The result envelope — graceful degradation is structural

Every sub-agent returns:

```json
{ "taskId": "…", "status": "complete|partial|blocked", "outputs": { "result": "…" }, "notes": "…",
  "model": "…", "tier": "fast|strong", "inputTokens": 0, "outputTokens": 0, "costUsd": 0,
  "actionsTaken": [ { "tool": "…", "input": … }, … ] /* only on partial/blocked */ }
```

The scheduler and the parent agent act on `status`, not on parsing prose. A
partial or blocked result is stored truthfully and returned, carrying
`taskId` + `actionsTaken` so a retry can call `spawn_subagent(resume_from:
taskId)` and **continue from where it stopped** instead of restarting from zero.
On success the envelope omits `actionsTaken` (the result text already
summarizes) to avoid bloating the parent's context.

---

## 6. Deterministic state-machine core

Beyond the agent engine, a large part of the app is built as **deterministic
state machines**, not imperative event handlers.

### 6.1 The framework (`src/state_machines/`)

- `cosim.ts` — **co-simulation** for finite state-machine models: drives every
  interleaving between channel messages, external actions, and commands, and
  reports the shortest failing trace. Pure and side-effect-free.
- `keyed_host.ts` — owns controllers keyed by entity (e.g. per chat, per app),
  with lifecycle + subscription management.
- `trace.ts` — transition observers that record a bounded, replay-able trace of
  every `(state, event) → (state', commands)` for devtools and tests.
- `clock.ts` — an injectable clock/scheduler so machines are deterministic and
  testable.

The philosophy: **domain logic is a pure transition function**; I/O and effects
are commands _returned_ by that function, applied by the host. That's why
`cosim` can exhaustively explore interleavings.

### 6.2 `chat_stream/`

The chat-stream lifecycle is a state machine (`host_state.ts`,
`host_transition.ts`, `transition.ts`) with a transport layer and a
`queue_lock.ts` that serializes compare-and-swap queue mutations per chat. The
main actor (`main_actor.ts`) is tested with a fake clock and sequential id
source.

### 6.3 `app_run/` and `distributed_machines/`

- `app_run/` — the app-running lifecycle as a machine (definition, transitions,
  selectors, remote transport).
- `distributed_machines/` — the same pattern across the main/renderer process
  boundary (actor host, remote client, prepared requests, operation registry).

---

## 7. The request flow (prompt → response)

1. User submits a prompt in the renderer.
2. The **chat-stream handler** (`chat_stream_handlers.ts`) resolves the model
   and mode (via the mode classifier and `isLocalAgentBackedMode`).
3. It builds the tool set for the main agent (`buildBuiltinTools`) — minimal,
   with heavy tools delegated.
4. `streamText` runs the **agent loop**: the model emits tool calls, the engine
   executes them, results stream back to the renderer as chat messages.
5. When the model needs heavy/MCP/parallel work, it calls `spawn_subagent` or
   `plan_task_graph` → the **orchestrator** spawns scoped sub-agents (bounded by
   the semaphore, budgeted by role, possibly cached) and returns envelopes.
6. The preview app hot-reloads as files change.

The **compaction** system (`compaction_handler.ts`, `chats` compaction columns)
summarizes long histories and rewrites the message store so context stays
within budget without losing the conversation.

---

## 8. Optimizations & techniques in use

| Technique                      | Where                                         | Effect                                                                                                    |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Main-agent tool minimization   | `agent/tools.ts` (delegated tools)            | fewer tool-schema tokens per turn                                                                         |
| Per-role tool allowlists       | `agent/tools.ts`                              | scoped schemas + structural scope containment                                                             |
| Model-tier routing             | `agent/role_model.ts`                         | cheap model for read-only roles                                                                           |
| Result cache                   | `agent/result_cache.ts`                       | zero tokens for repeated read-only analysis                                                               |
| Lazy MCP loading               | `agent/orchestrator.ts`                       | no per-turn cost for unused MCP servers                                                                   |
| Token/call budgets             | `agent/task_types.ts` (`ROLE_BUDGETS`)        | per-role step limit + context truncation enforced; output stored as metadata                              |
| Bounded parallel scheduling    | `agent/semaphore.ts`                          | parallel DAG with a rate/cost cap                                                                         |
| Cost ledger ($)                | `agent/pricing.ts`                            | per-task token → USD attribution                                                                          |
| Truthful status persistence    | `agent_tasks`/`agent_artifacts`               | resume/retry/audit from graph state                                                                       |
| Tool-result truncation         | `agent/tools.ts` + `orchestrator.ts`          | caps each tool result at 25% of the role's `contextBudget` (head + tail), bounding context bloat          |
| Loop detection                 | `agent/tools.ts` + `orchestrator.ts`          | short-circuits the 3rd identical tool call (built-in + MCP) instead of spinning                           |
| Resume / state handoff         | `agent/orchestrator.ts` (`resume_from`)       | a `partial` run persists its action history; a retry injects it so it continues, not restarts             |
| Context compaction             | `chats` + `compaction_handler`                | rewrite history to stay in budget                                                                         |
| Prompt caching                 | `get_model_client.ts` + `provider_options.ts` | Anthropic `cache_control` breakpoints on the system prompt; other providers auto-cache on stable prefixes |
| Deterministic machines + cosim | `state_machines/`                             | exhaustively test interleavings                                                                           |
| Provider-agnostic clients      | `get_model_client.ts`                         | one code path for every provider                                                                          |

---

## 9. Model providers

`src/ipc/utils/get_model_client.ts` is a single provider-agnostic factory
backed by the Vercel AI SDK, dispatching on provider id:

`openai`, `anthropic`, `google`, `vertex`, `xai`, `openrouter`, `azure`,
`ollama`, `lmstudio`, `bedrock`, `minimax`, and any **custom OpenAI-compatible**
provider (which covers DeepSeek and other self-hosted/compatible endpoints).

The per-role "fast" tier and the primary model are both `LargeLanguageModel`
values resolved through this same factory, so the tier routing works identically
for every provider with no provider-specific branching.

---

## 10. Observability & cost

- **Task-graph store** (`agent_tasks` + `agent_artifacts` + `agent_events`) —
  durable, queryable state of every sub-task.
- **Cost ledger** — token usage is captured from `result.totalUsage` (summed
  across steps) and converted to USD via a per-model pricing table
  (`agent/pricing.ts`); unknown models render "—" rather than a made-up number.
- **Renderer surfacing** — `AgentTaskSummary` shows per-task status / model tier
  / tokens / cost and a running total next to the composer; `RunningAgents`
  shows in-flight tasks.
- **State-machine tracing** — `trace.ts` observers + the devtools dump
  (`window.__octopusStudioMachines`) record transitions for debugging.

---

## 11. Planned but not wired (honest gaps)

These are documented in the original architecture plan but intentionally not yet
implemented:

- **True sandboxed runner isolation** — sub-agents run in-process (bounded +
  parallel), not in separate workers.
- **Prompt caching — partial** — wired for direct Anthropic via
  `supportsCacheControl` + `cacheControl: { type: "ephemeral" }`. The remaining
  gap is coverage: MiniMax's Anthropic-compatible endpoint and Bedrock's
  Anthropic models support the same mechanism but aren't flagged (routed through
  different providers), and there's no telemetry confirming cache-hit rates.
- **OpenTelemetry-style spans** and **SLO alerts** — the tracer is state-machine
  scoped, not agent-span scoped.
- **Per-subtask result viewer** — full output is stored in `agent_artifacts`,
  but the UI surfaces only the summary row.
- **`agent_locks` / `agent_messages` tables** — schema exists, not used yet.
- **Resume is opt-in** — the state-handoff path works only if the parent LLM
  passes `resume_from: <taskId>` on retry; it is not auto-detected (matching a
  rephrased goal to a prior task is fragile). The mechanism is there; the parent
  must choose to use it.
- **Empirical verification pending** — the truncation/resume/loop changes are
  type-checked but not yet re-measured against a live OctoLimb run (token count
  and single-lifecycle completion need a real browser session to confirm).

---

## 12. Philosophy, in short

1. **Determinism over ad-hoc** — orchestration is a state machine + DAG, not a
   chat loop. LLM calls are services invoked by deterministic code.
2. **Plan as data** — the plan lives in a database, so resume/retry/audit are
   trivial and correct.
3. **Progressive disclosure** — show the model only the tools it needs; delegate
   the rest. Smaller schemas are cheaper and safer.
4. **Provider-agnostic** — one engine, one factory, every model behind it.
5. **Truth over prose** — structured envelopes (`complete|partial|blocked`),
   not narrative, drive control flow.
6. **Measure spend** — token/call budgets and a dollar ledger make cost a
   first-class, tunable quantity rather than an afterthought.
