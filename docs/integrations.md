# Connect an agent

Open **Teams** in Rementum and copy the MCP URL for the workspace you want to connect. It looks like
this:

```text
https://rementum.dev/mcp/workspace/WORKSPACE_UUID
```

The URL names the workspace; it is not a credential. When an agent connects, Rementum opens OAuth in
your browser and uses the account already signed in to the Rementum web app. If there is no web
session, it sends you through the regular sign-in page and resumes automatically. Rementum verifies
that account's team membership and limits the connection to that workspace's brains and tasks. A
new client, workspace, or scope set needs one explicit approval; reconnecting an already approved
grant is silent.

Claude Code and the Claude apps identify themselves with a client metadata document that Anthropic
hosts on `claude.ai` (an OAuth Client ID Metadata Document). Rementum advertises support for it, reads
the document when Claude connects, and registers nothing; the connection appears under that
document's URL on the **Connections** page. Clients without a hosted document, such as Cursor and
Codex, still register themselves dynamically. See [the security guide](security.md#accounts) for
what Rementum checks.

## Two parts: the plugin and the MCP URL

- **MCP** exposes the tools.
- **The Rementum plugin** adds skills that teach a coding agent when to load context, how to stage
  and promote writes, and how to import or maintain a brain safely. It ships as a single
  `rementum` skill.

Install the plugin once, then add the workspace MCP URL. The steps below cover each client.

## Claude Code

```text
/plugin marketplace add rementum/rementum
/plugin install rementum@rementum
```

Turn on auto-update once, from **/plugin → Marketplaces → rementum → Enable auto-update**. Claude
Code then refreshes the marketplace at startup and prompts for `/reload-plugins` when an update is
ready. Add the workspace connection separately:

```bash
claude mcp add --scope user --transport http \
  rementum https://rementum.dev/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Finish OAuth in the browser, then ask Claude to find the project with `search_brains` and read it with `get_brain`.

## Codex

```bash
codex plugin marketplace add rementum/rementum
codex plugin add rementum@rementum
codex mcp add rementum --url https://rementum.dev/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

Run `codex plugin marketplace upgrade rementum` to refresh the marketplace, and start a new thread
after you install or update the plugin.

## Cursor

Rementum is an Agent Plugin. For a team install, open **Dashboard → Plugins**, add a marketplace with
**Import from Repo**, and use `https://github.com/rementum/rementum`. Install the Cursor GitHub App,
turn on **Auto Refresh**, then set the plugin to Default On or Required. Cursor loads the four skills
from `plugins/rementum/plugin.json` through the repository marketplace.

Add the workspace server to the MCP configuration:

```json
{
  "mcpServers": {
    "rementum": {
      "url": "https://rementum.dev/mcp/workspace/WORKSPACE_UUID"
    }
  }
}
```

## OpenCode

```bash
npx -y skills add rementum/rementum --global \
  --agent opencode --skill '*' --yes --full-depth
opencode mcp add rementum --url https://rementum.dev/mcp/workspace/WORKSPACE_UUID
opencode mcp auth rementum
```

## Pi

Pi has no built-in MCP client, so the [pi-rementum](https://github.com/rementum/pi-rementum) package
connects to the workspace itself:

```bash
pi install git:github.com/rementum/pi-rementum
```

Then, inside Pi:

```text
/rementum login https://rementum.dev/mcp/workspace/WORKSPACE_UUID
```

Pi opens OAuth in the browser, registers the workspace's MCP tools as native Pi tools, and adds the
`rementum` skill and the server instructions to its prompt. `/rementum status` shows the connection;
`/rementum logout` deletes this machine's tokens. Tokens are kept in `~/.pi/agent/rementum/`,
readable only by your user. Revoke the grant on the **Connections** page to end it on the server.

## Agents without plugin support

Any coding agent can install the same four skills directly:

```bash
npx -y skills add rementum/rementum --global --all --full-depth
```

After that one-time install, refresh them without reinstalling:

```bash
npx -y skills update rementum --global --yes
```

## Claude and Claude Desktop

On supported plans, open **Settings → Connectors**, choose **Add custom connector**, and paste the
workspace MCP URL. Remote connectors work in Claude and Claude Desktop; do not put this URL in
`claude_desktop_config.json`. See
[Anthropic's remote connector guide](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers).

The plugin targets Claude Code, not the hosted Claude or Claude Desktop. Those clients can use the
MCP tools, but they do not get the local coding-agent skills.

## ChatGPT

Where custom MCP apps are available, enable developer mode, create a custom app under **Settings →
Apps**, and paste the workspace MCP URL. Choose OAuth, scan the tools, and approve the connection.
See
[OpenAI's MCP app guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt).

The repository marketplace targets Codex, not ChatGPT. ChatGPT can use the MCP tools but does not get
the Codex plugin.

## Other MCP clients

Any client that supports remote Streamable HTTP MCP with OAuth can use the same workspace URL. Keep
write-tool approval on. Rementum marks read tools with `readOnlyHint`; writes go through the staged
write and promotion protocol.

Rementum serves the stateless MCP `2026-07-28` protocol and keeps a stateless compatibility path for
2025-era clients. Ordinary calls use JSON instead of opening an SSE stream. The tool catalog is
deterministic, filtered to the connection's OAuth scopes, and advertised to modern clients with a
private five-minute cache.

The MCP catalog contains seven memory tools:

| Tool | Purpose |
| --- | --- |
| `search_brains` | Find the project's brain. |
| `create_brain` | Create a brain when no existing one matches. |
| `get_brain` | Read brain instructions and a page of the routing index. |
| `load_context` | Search and retrieve relevant article bodies within explicit budgets. |
| `read_article` | Read one exact article and its current version. |
| `stage_write` | Propose a new article, canonical update, or log append. |
| `promote_staged_write` | Publish a staged write after checking conflicts. |

Read-only connections discover four tools; `brain:write` adds the other three. Task scopes do not
add MCP tools. Task management, maintenance, import/export, invitations, activity, and staged-write
inspection or withdrawal use the existing web UI or REST API. They have no optional MCP tool group.
Article-link editing and explicit freshness verification currently have no web or REST replacement
after removal of their MCP tools.

**Upgrading from the 33-tool catalog:** Refresh or reconnect the client's MCP connection and update
its Rementum skill. Existing calls to the removed tools return tool-not-found. Replace
`search_articles` with `load_context`, and project lookup through `list_brains` with `search_brains`.
Existing data, REST operations, and historical usage analytics are preserved.

### Token efficiency and prompt budgeting

Rementum is designed to minimize agent prompt overhead:

- **Routing over dumping:** A 25-item routing index consumes roughly 200 tokens. Agents read the index and request only the exact body they need, rather than loading an entire documentation directory into context.
- **Scope filtering:** MCP tool definitions are filtered to the connection's OAuth scopes. Read-only agents receive only the four read tools.
- **Private caching:** Modern MCP clients receive a 5-minute `Cache-Control` header on the tool catalog, eliminating redundant tool-discovery roundtrips.

## Usage analytics

The web **Analytics** page records one usage event after each successful MCP tool call. It counts
tool calls, not audit rows, so a `load_context` candidate read does not inflate client or brain
activity. Top-article counts include only bodies delivered by `read_article` or actually returned by
`load_context`, once per call per article.

The page shows 7-, 30-, 90-, and 365-day rankings and a rolling 365-day contribution heatmap. Day
boundaries are UTC. Tracking starts when the analytics migration is installed; older audit events are
not backfilled, and the heatmap marks earlier days as untracked. Usage records last for the life of
the workspace and are visible to its team members. The [security checklist](security.md) lists the
exact metadata kept.

Selecting a square in the heatmap narrows every ranking below it to that one UTC day, including days
outside the range the picker is set to. The heatmap itself keeps showing the full year, so the next
day is always one click away. Clicking the selected square again clears the filter, as do the Refresh
button and any range button. Untracked days hold no telemetry rather than no usage, so they cannot be
selected.

## The first requests an agent makes

At startup the server sends MCP instructions that tell the agent when to load and write memory.
Clients that surface server instructions, Claude Code among them, apply this guidance with no extra
prompt setup.

A typical read path is:

1. `search_brains` finds the brain that matches the current project by name, slug, or description.
   Resolve the brain once per thread and reuse its id in later turns. If no brain matches, call
   `create_brain`; omit `workspaceId` when only one workspace is accessible.
2. `get_brain` returns 25 routing entries by default. Pass its opaque `nextCursor` back unchanged
   while `hasMore` is true, when the rest of the index matters.
3. `load_context` runs the metadata, full-text, and embedding search and returns whole relevant
   article bodies within `maxArticles` and `maxChars`. It reports what it skipped and never silently
   truncates an article. `maxChars` counts the entire tool result, which carries the payload twice:
   once as `structuredContent`, once as JSON text for older clients. `omittedCount` counts every
   skipped article; `omitted` lists only those the remaining budget had room to name, so trust the
   count and treat the list as a convenience. Opening a candidate costs a decrypt and an audit event,
   so the tool reads at most `maxArticles * 2` candidates and marks the untried tail `read_budget`.
4. `read_article` fetches one exact article. Its default view drops provenance and maintenance
   fields; pass `detail: "full"` only when you need them.

Write memory with `stage_write`. Review its conflict result before you promote the pending write.
Staging stores the title, the optional one-sentence `summary` (160 characters at most), the body,
and the `changeSummary` (200 characters at most) exactly as submitted; nothing is generated. Other
agents choose articles from the title and summary alone, so make both specific.

Inspect or withdraw a pending write in the web UI. If promotion reports a version mismatch, read
the current article, reconcile the changes, and stage a fresh proposal. Keep the same idempotency
key when retrying an unchanged request after an uncertain response.

A tool that cannot complete returns an `isError` result whose text block is one JSON object:
`code`, `message`, and, when the failure carries one, `detail`. `stage_write` reports unacknowledged
potential conflicts as `code: "conflict"` with `detail.potentialConflicts`; `promote_staged_write`
reports a base-version mismatch the same way with `detail.currentVersion`, and a slug already taken
by another article with `detail.articleId`. Validation failures use `code: "validation"` and list the
rejected fields in `detail.issues`. Internal faults arrive as `code: "internal"` with no further
detail; the server log has the cause.
