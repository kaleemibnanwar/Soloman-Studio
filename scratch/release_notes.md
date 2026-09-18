## Octopus Studio v1.10.0

A local, open-source AI app builder: describe an app, get a real running codebase — with a full agentic build/edit/test workflow and a growing automation layer on top.

### Highlights

- **Workers** — assemble multi-persona agent squads (PM, Solutions Architect, Tester, Security Engineer, Designer, Marketer, and more) and dispatch a goal. Each persona does a real turn in a shared chat — real edits, real commits — and the run can be cancelled mid-flight.
- **Tasks** — save a prompt once, run it on demand or on a schedule, against any project. Now paginated with collapsible rows for large task lists.
- **Plugins** — connect real tools over MCP from a bundled catalog of verified servers: Gmail, Slack, Canva, Notion, Linear, Figma, GitHub, Stripe, Cloudflare, Supabase, and 20+ more — OAuth or a single API key, no hand-written config.
- **Settings → Default Model** — set the fallback model used for new chats and anything that doesn't pick its own, right from Settings.

### Downloads

| Platform | Artifact | Notes |
|---|---|---|
| Linux (x64) | `octopus-studio_1.10.0_amd64.deb` | `sudo apt install ./octopus-studio_1.10.0_amd64.deb` |
| Windows (x64) | `octopus-studio-1.10.0-win32-x64.zip` | Portable build — unzip and run `octopus-studio.exe`. No installer in this release (built without Wine/Mono available); unzip and run directly. |
| macOS | — | Not built in this release — macOS packaging requires building on macOS itself. A signed/notarized build will follow via CI. |

### Full changelog

Squashed initial public release — see the repository history going forward for individual changes.
