// The built-in tools available to Octopus Studio's own agent-backed chat
// modes (`ask`, `plan`, `local-agent` — see `isLocalAgentBackedMode` in
// `src/lib/schemas.ts`), as described to the model in
// `src/prompts/local_agent_prompt.ts`. This is the single source of truth
// for tool name/description/default-approval, consumed by:
//   - `agent_tool_handlers.ts` (Settings visibility + per-tool consent)
//   - `agent_tool_execution.ts` (the actual tool implementations)
export interface AgentToolDefinition {
  name: string;
  description: string;
  /** Read-only / non-destructive tools run without asking by default. */
  isAllowedByDefault: boolean;
}

export const AGENT_TOOL_REGISTRY: AgentToolDefinition[] = [
  // --- File & code reading -------------------------------------------------
  {
    name: "read_file",
    description: "Read a file's contents from the current app's project.",
    isAllowedByDefault: true,
  },
  {
    name: "list_files",
    description: "List files and directories in the current app's project.",
    isAllowedByDefault: true,
  },
  {
    name: "grep",
    description: "Search file contents across the project for a text pattern.",
    isAllowedByDefault: true,
  },
  {
    name: "code_search",
    description: "Search the codebase for a symbol, function, or concept.",
    isAllowedByDefault: true,
  },
  {
    name: "explore_code",
    description:
      "Investigate the codebase for a stated intent (explain, locate, edit, or debug) and report relevant files.",
    isAllowedByDefault: true,
  },
  {
    name: "read_guide",
    description: "Read a project guide or documentation file (e.g. AGENTS.md).",
    isAllowedByDefault: true,
  },
  {
    name: "read_logs",
    description: "Read the app's recent runtime logs.",
    isAllowedByDefault: true,
  },

  // --- File & code editing -------------------------------------------------
  {
    name: "write_file",
    description: "Overwrite a file's entire contents, or create a new file.",
    isAllowedByDefault: false,
  },
  {
    name: "search_replace",
    description: "Make a targeted edit by replacing exact text in a file.",
    isAllowedByDefault: false,
  },
  {
    name: "delete_file",
    description: "Delete a file from the project.",
    isAllowedByDefault: false,
  },
  {
    name: "rename_file",
    description: "Rename or move a file within the project.",
    isAllowedByDefault: false,
  },
  {
    name: "copy_file",
    description: "Copy a file to a new path within the project.",
    isAllowedByDefault: false,
  },
  {
    name: "add_dependency",
    description: "Add an npm package dependency to the project.",
    isAllowedByDefault: false,
  },

  // --- Build / run ----------------------------------------------------------
  {
    name: "run_type_checks",
    description: "Run TypeScript type checking on the project and report errors.",
    isAllowedByDefault: true,
  },
  {
    name: "restart_app",
    description: "Restart the running app preview.",
    isAllowedByDefault: false,
  },
  {
    name: "rebuild_app",
    description: "Rebuild the app from a clean install (removes node_modules and the sandbox).",
    isAllowedByDefault: false,
  },
  {
    name: "execute_sandbox_script",
    description: "Run a short script in an isolated sandbox and return its output.",
    isAllowedByDefault: false,
  },
  {
    name: "execute_command",
    description:
      "Run an approved local command in the project, including SSH and deployment commands.",
    isAllowedByDefault: false,
  },
  {
    name: "add_integration",
    description: "Add a third-party integration (e.g. Supabase, GitHub) to the project.",
    isAllowedByDefault: false,
  },
  {
    name: "enable_nitro",
    description: "Enable the Nitro build/performance optimization for the project.",
    isAllowedByDefault: false,
  },
  {
    name: "generate_image",
    description: "Generate an image asset for the app.",
    isAllowedByDefault: false,
  },
  {
    name: "generate_video",
    description: "Generate a video asset for the app.",
    isAllowedByDefault: false,
  },

  // --- Git --------------------------------------------------------------
  {
    name: "git_status",
    description: "Show the git working tree status (changed/added/deleted files).",
    isAllowedByDefault: true,
  },
  {
    name: "git_diff",
    description: "Show the git diff of uncommitted changes.",
    isAllowedByDefault: true,
  },
  {
    name: "git_log",
    description: "Show recent git commit history.",
    isAllowedByDefault: true,
  },
  {
    name: "git_show_commit",
    description: "Show the details and file changes of a specific git commit.",
    isAllowedByDefault: true,
  },
  {
    name: "git_show_file",
    description: "Show a file's contents as of a specific git revision.",
    isAllowedByDefault: true,
  },
  {
    name: "git_restore_file",
    description: "Restore a file to its contents at a specific git revision.",
    isAllowedByDefault: false,
  },

  // --- Chat / planning -------------------------------------------------
  {
    name: "read_chat",
    description: "Read a specific past chat message and its surrounding context.",
    isAllowedByDefault: true,
  },
  {
    name: "search_chats",
    description: "Search this app's chat history by keyword.",
    isAllowedByDefault: true,
  },
  {
    name: "explore_chat_history",
    description:
      "Search prior chats for this app for relevant decisions or requirements and report a summary.",
    isAllowedByDefault: true,
  },
  {
    name: "planning_questionnaire",
    description: "Ask the user a set of structured questions while planning.",
    isAllowedByDefault: true,
  },
  {
    name: "spawn_subagent",
    description: "Delegate a bounded subtask to a sub-agent worker with its own file permissions.",
    isAllowedByDefault: false,
  },
  {
    name: "list_mcp_servers",
    description: "List available third-party MCP servers for sub-agents.",
    isAllowedByDefault: true,
  },
  {
    name: "plan_task_graph",
    description: "Submit a DAG of subtasks for the orchestration engine to run in parallel.",
    isAllowedByDefault: false,
  },
  {
    name: "create_document",
    description: "Create a Word document (.docx) from a JSON spec.",
    isAllowedByDefault: false,
  },
  {
    name: "create_spreadsheet",
    description: "Create an Excel spreadsheet (.xlsx) from a JSON spec.",
    isAllowedByDefault: false,
  },
  {
    name: "create_presentation",
    description: "Create a PowerPoint presentation (.pptx) from a JSON spec.",
    isAllowedByDefault: false,
  },
  {
    name: "create_office_documents_batch",
    description: "Mail-merge many docx/pptx/xlsx files from one template and a list of records.",
    isAllowedByDefault: false,
  },
  {
    name: "read_office_file",
    description: "Read and parse an existing office file (.docx/.pptx/.xlsx).",
    isAllowedByDefault: true,
  },
  {
    name: "read_office_template",
    description: "List document/presentation templates and their [placeholders].",
    isAllowedByDefault: true,
  },
  {
    name: "edit_document",
    description: "Edit an existing Word document (.docx).",
    isAllowedByDefault: false,
  },
  {
    name: "edit_spreadsheet",
    description: "Edit an existing Excel spreadsheet (.xlsx).",
    isAllowedByDefault: false,
  },
  {
    name: "edit_presentation",
    description: "Edit an existing PowerPoint presentation (.pptx).",
    isAllowedByDefault: false,
  },
  {
    name: "set_chat_summary",
    description: "Set this chat's title/summary.",
    isAllowedByDefault: true,
  },
  {
    name: "update_todos",
    description: "Update the agent's task checklist for this chat.",
    isAllowedByDefault: true,
  },
  {
    name: "create_scheduled_task",
    description: "Create a recurring scheduled task that runs the agent on a prompt.",
    isAllowedByDefault: false,
  },
  {
    name: "list_coworker_bots",
    description:
      "List all autonomous coworker bots, their archetypes (Sentinel/Scout/Steward/Operator), schedule, project scope, and status.",
    isAllowedByDefault: true,
  },
  {
    name: "create_coworker_bot",
    description:
      "Deploy an autonomous coworker bot (Sentinel=QA/tests, Scout=web/docs research, Steward=code health/linting, Operator=daily workflows) assigned to a specific project or the default workspace.",
    isAllowedByDefault: false,
  },
  {
    name: "run_coworker_bot",
    description: "Immediately trigger an autonomous mission run for a coworker bot.",
    isAllowedByDefault: false,
  },
  {
    name: "get_coworker_report",
    description:
      "Retrieve the execution report, findings, and logs from a coworker bot's latest run.",
    isAllowedByDefault: true,
  },
  {
    name: "list_planner_tasks",
    description: "List the current project's Planner (kanban) cards.",
    isAllowedByDefault: true,
  },
  {
    name: "create_planner_task",
    description: "Create a new card on the project's Planner (kanban board).",
    isAllowedByDefault: false,
  },
  {
    name: "update_planner_task",
    description:
      "Update an existing Planner card's status, priority, title, description, or due date.",
    isAllowedByDefault: false,
  },

  // --- Skills ----------------------------------------------------------------
  {
    name: "list_skills",
    description:
      "List every saved skill by name with its short description of when to use it. Call this to check whether a saved skill matches the current task before starting from scratch.",
    isAllowedByDefault: true,
  },
  {
    name: "read_skill",
    description:
      "Load one saved skill's full instructions by name. Call this right before you need to follow it — only load a skill for the step that actually needs it, not preemptively for the whole conversation.",
    isAllowedByDefault: true,
  },
  {
    name: "create_skill",
    description:
      "Save a new reusable skill (a name, a short description of when to use it, and the full instructions) so future tasks can reuse it. Use this when the user asks you to remember a workflow as a skill, or after working out a non-obvious multi-step approach worth reusing.",
    isAllowedByDefault: false,
  },
  {
    name: "update_skill",
    description: "Update an existing saved skill's name, description, or instructions.",
    isAllowedByDefault: false,
  },
  {
    name: "delete_skill",
    description: "Permanently delete a saved skill.",
    isAllowedByDefault: false,
  },

  // --- Web -----------------------------------------------------------------
  {
    name: "web_search",
    description: "Search the web for information.",
    isAllowedByDefault: true,
  },
  {
    name: "web_fetch",
    description: "Fetch the contents of a URL.",
    isAllowedByDefault: true,
  },
  {
    name: "web_crawl",
    description: "Crawl a website starting from a URL and collect page contents.",
    isAllowedByDefault: true,
  },
  {
    name: "browser_automation",
    description:
      "Discover and run mapped-element operations in Studio's embedded browser. The single dispatcher keeps browser schemas out of unrelated requests.",
    isAllowedByDefault: true,
  },
];

export const AGENT_TOOL_NAMES = new Set(AGENT_TOOL_REGISTRY.map((t) => t.name));
