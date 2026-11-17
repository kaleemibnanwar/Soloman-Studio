import type { McpCatalogEntry } from "@/ipc/types/mcp_catalog";

/**
 * A bundled fallback catalog of real, currently-operating MCP servers —
 * all remote vendor integrations that connect over HTTPS (OAuth or a
 * network URL). Ships with the app so the Plugins catalog isn't empty
 * offline or before the hosted catalog exists; merged with whatever the
 * remote catalog returns (see mcp_catalog_source.ts).
 *
 * Stdio (`npx`) servers are intentionally NOT bundled here. They remain a
 * fully-supported server type — users can add a custom `npx` server
 * manually, and the hosted catalog can still serve stdio entries — but the
 * bundled list only carries remote integrations.
 *
 * Every entry here was verified against the vendor's own docs — no invented
 * packages or guessed URLs.
 */
export const LOCAL_MCP_CATALOG: McpCatalogEntry[] = [
  // --- Communication ---
  {
    slug: "intercom",
    name: "Intercom",
    description: "Search and read conversations, contacts, companies, and help center articles.",
    category: "Communication",
    transport: "http",
    url: "https://mcp.intercom.com/mcp",
    oauth: { required: true },
  },

  // --- Design ---
  {
    slug: "canva",
    name: "Canva",
    description: "Create designs, autofill brand templates, search your library, and export.",
    category: "Design",
    featured: true,
    transport: "http",
    url: "https://mcp.canva.com/mcp",
    oauth: { required: true },
  },
  {
    slug: "figma",
    name: "Figma",
    description: "Pull design context, tokens, and Code Connect data from Figma.",
    category: "Design",
    featured: true,
    transport: "http",
    url: "https://mcp.figma.com/mcp",
    oauth: { required: true },
  },

  // --- Productivity ---
  {
    slug: "notion",
    name: "Notion",
    description: "Search, read, and edit pages and databases in your workspace.",
    category: "Productivity",
    featured: true,
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    oauth: { required: true },
  },
  {
    slug: "todoist",
    name: "Todoist",
    description: "Create, complete, and organize tasks and projects.",
    category: "Productivity",
    transport: "http",
    url: "https://ai.todoist.net/mcp",
    oauth: { required: true },
  },

  // --- Project management ---
  {
    slug: "linear",
    name: "Linear",
    description: "Find, create, and update issues, projects, and comments.",
    category: "Project Management",
    featured: true,
    transport: "http",
    url: "https://mcp.linear.app/mcp",
    oauth: { required: true },
  },
  {
    slug: "atlassian",
    name: "Atlassian (Jira & Confluence)",
    description: "Search and update Jira issues and Confluence pages, plus Compass and Bitbucket.",
    category: "Project Management",
    transport: "http",
    url: "https://mcp.atlassian.com/v1/mcp/authv2",
    oauth: { required: true },
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Create, update, and search tasks across your workspace.",
    category: "Project Management",
    transport: "http",
    url: "https://mcp.asana.com/v2/mcp",
    oauth: { required: true },
  },
  {
    slug: "monday",
    name: "monday.com",
    description: "Read and update boards, items, and updates in your workspace.",
    category: "Project Management",
    transport: "http",
    url: "https://mcp.monday.com/mcp",
    oauth: { required: true },
  },

  // --- Payments & commerce ---
  {
    slug: "stripe",
    name: "Stripe",
    description: "Manage customers, products, invoices, subscriptions, and refunds.",
    category: "Payments & Commerce",
    featured: true,
    transport: "http",
    url: "https://mcp.stripe.com",
    oauth: { required: true },
  },

  // --- Infrastructure & cloud ---
  {
    slug: "cloudflare",
    name: "Cloudflare",
    description: "Manage Workers, DNS, and other Cloudflare account resources.",
    category: "Infrastructure",
    transport: "http",
    url: "https://mcp.cloudflare.com",
    oauth: { required: true },
  },
  {
    slug: "vercel",
    name: "Vercel",
    description: "Search docs, manage projects and deployments, and query analytics.",
    category: "Infrastructure",
    transport: "http",
    url: "https://mcp.vercel.com",
    oauth: { required: true },
  },

  // --- Databases ---
  {
    slug: "neon",
    name: "Neon",
    description: "Create branches, run queries, and manage Postgres projects.",
    category: "Databases",
    transport: "http",
    url: "https://mcp.neon.tech/mcp",
    oauth: { required: true },
  },

  // --- Developer tools ---
  {
    slug: "github",
    name: "GitHub",
    description: "Repository, issue, PR, and workflow context from GitHub.",
    category: "Developer Tools",
    featured: true,
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    oauth: { required: true },
  },
  {
    slug: "sentry",
    name: "Sentry",
    description: "Look up issues, errors, and Seer root-cause analysis.",
    category: "Developer Tools",
    transport: "http",
    url: "https://mcp.sentry.dev/mcp",
    oauth: { required: true },
  },

  // --- Google Workspace ---
  // Google's own remote MCP servers (developers.google.com/workspace/guides/configure-mcp-servers).
  // These don't support dynamic client registration — the calling app
  // registers its own OAuth client — so connecting one of these normally
  // means pasting a client id/secret on its setup page. The "Connect Google
  // Account" flow in Settings does that once for all of them, using the
  // app's own registered client, and provisions these rows automatically
  // (see google_workspace_mcp.ts) so users don't have to configure each one
  // by hand or click through eight separate consent screens.
  {
    slug: "gmail",
    name: "Gmail",
    description: "Search messages and create draft replies.",
    category: "Google Workspace",
    featured: true,
    transport: "http",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    },
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    description: "Search and read files in your Drive.",
    category: "Google Workspace",
    transport: "http",
    url: "https://drivemcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
    },
  },
  {
    slug: "google-docs",
    name: "Google Docs",
    description: "Read and edit Google Docs documents.",
    category: "Google Workspace",
    transport: "http",
    url: "https://docsmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/documents",
    },
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    description: "Read and edit Google Sheets spreadsheets.",
    category: "Google Workspace",
    transport: "http",
    url: "https://sheetsmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/spreadsheets",
    },
  },
  {
    slug: "google-slides",
    name: "Google Slides",
    description: "Read and edit Google Slides presentations.",
    category: "Google Workspace",
    transport: "http",
    url: "https://slidesmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/presentations",
    },
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    description: "Read calendars, events, and free/busy availability.",
    category: "Google Workspace",
    featured: true,
    transport: "http",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.readonly",
    },
  },
  {
    slug: "google-chat",
    name: "Google Chat",
    description: "Read spaces and messages, and send chat messages.",
    category: "Google Workspace",
    transport: "http",
    url: "https://chatmcp.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.memberships.readonly https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.messages.create https://www.googleapis.com/auth/chat.users.readstate",
    },
  },
  {
    slug: "google-people",
    name: "Google Contacts",
    description: "Look up contacts and directory people.",
    category: "Google Workspace",
    transport: "http",
    url: "https://people.googleapis.com/mcp/v1",
    oauth: {
      required: true,
      scope:
        "https://www.googleapis.com/auth/directory.readonly https://www.googleapis.com/auth/contacts.readonly",
    },
  },
];

/** Slugs of the catalog entries backed by the single "Connect Google Account" flow. */
export const GOOGLE_WORKSPACE_MCP_SLUGS = [
  "gmail",
  "google-drive",
  "google-docs",
  "google-sheets",
  "google-slides",
  "google-calendar",
  "google-chat",
  "google-people",
] as const;
