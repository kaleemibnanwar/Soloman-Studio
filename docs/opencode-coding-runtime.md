# OpenCode coding runtime

Soloman uses the embedded OpenCode SDK as the default runtime for ordinary coding subagents. The
integration is intentionally a leaf adapter: Soloman still owns task planning, the deterministic DAG,
task/artifact/event persistence, model selection, concurrency, budgets, resumability, and the user-facing
permission flow.

## Runtime boundary

- Soloman selects and configures the AI SDK model. OpenCode receives that exact model object through an
  in-process bridge, so it does not own provider credentials or model preferences.
- OpenCode sessions are ephemeral. Their final text, token usage, and bounded action history are normalized
  into Soloman's existing artifact envelope, then the OpenCode session is removed.
- OpenCode uses a separate `opencode-runtime.db`; it never reads or writes `soloman.db` directly.
- Edit and shell requests are sent through Soloman's existing consent UI. External-directory access and
  nested OpenCode subagents are denied because Soloman owns orchestration.
- File-scoped DAG nodes only receive read/edit permission for their `allowed_files`; shell, glob, and grep are
  disabled for those nodes because they could escape that boundary.

## Compatibility fallback

MCP tasks, tasks with a Soloman-specific tool allowlist, and older AI SDK v2 models continue through the
legacy runtime. If OpenCode fails before executing a tool, Soloman safely retries through the legacy runtime.
Once any OpenCode tool has executed, it never retries automatically, preventing duplicate edits or commands.

Set `OCTOPUS_STUDIO_AGENT_RUNTIME=legacy` before launching Studio for an emergency runtime rollback.
