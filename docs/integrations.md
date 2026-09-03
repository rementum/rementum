# Connect an agent

Open **Teams** in Rementum and copy the MCP URL for the workspace you want to connect. It looks like
this:

```text
https://rementum.dev/mcp/workspace/WORKSPACE_UUID
```

The URL names the workspace; it is not a credential. When an agent connects, Rementum opens OAuth in
your browser, checks your team membership, and limits the connection to that workspace's brains and
tasks. This approval belongs to the MCP client. Signing in to the Rementum website uses a separate
web session and never shows an OAuth screen.

## Two parts: the plugin and the MCP URL

- **MCP** exposes the tools.
- **The Rementum plugin** adds skills that teach a coding agent when to load context, how to stage
  and promote writes, and how to import or maintain a brain safely. It ships `brain-context`,
  `brain-write`, `brain-import`, and `brain-maintenance`.

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

Finish OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.

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

## Agents without plugin support

Any coding agent can install the same four skills directly:

```bash
npx -y skills add rementum/rementum --global --all --full-depth
```

After that one-time install, refresh them without reinstalling:

```bash
npx -y skills update brain-context brain-write brain-import brain-maintenance --global --yes
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

If your client can filter its tool catalog, import only the tools the workflow needs. OpenAI
Responses clients can keep the `mcp_list_tools` item, set `allowed_tools`, and defer the server behind
tool search. Claude API clients can keep the common memory tools loaded and defer the task,
maintenance, import, and export tools. This trims prompt tokens on top of the server-side scope
filter.

### Token efficiency and prompt budgeting

Rementum is designed to minimize agent prompt overhead:

- **Routing over dumping:** A 25-item routing index consumes roughly 200 tokens. Agents read the index and request only the exact body they need, rather than loading an entire documentation directory into context.
- **Scope filtering:** MCP tool definitions are filtered to the connection's OAuth scopes. Agents without task or maintenance scopes never receive those tool definitions in their prompt.
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

## The first requests an agent makes

At startup the server sends MCP instructions that tell the agent when to load and write memory.
Clients that surface server instructions, Claude Code among them, apply this guidance with no extra
prompt setup.

A typical read path is:

1. `search_brains` finds the brain that matches the current project by name, slug, or description.
   `list_brains` pages through accessible brains when search is not enough.
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

List tools return compact summaries and opaque cursors. `list_tasks` omits full briefs, so follow a
chosen item with `get_task`. `recent_activity` defaults to ten compact events. `export_brain` returns
a link to the REST ZIP export instead of dumping every body into the agent, and opening that link
needs a separate signed-in web session.

Write memory with `stage_write`. Review its conflict result before you promote the pending write.
Staging never waits for an external LLM. In an opted-in workspace, `read_article` shows the deferred
compaction status after promotion, while the submitted body stays usable.

`propose_invite` records a proposal only. No invitation link exists until a brain owner approves the
proposal on the brain page in the web UI, where the link is issued and sent; an agent can never hand
out access by itself.

A tool that cannot complete returns an `isError` result whose text block is one JSON object:
`code`, `message`, and, when the failure carries one, `detail`. `stage_write` reports unacknowledged
potential conflicts as `code: "conflict"` with `detail.potentialConflicts`; `promote_staged_write`
reports a base-version mismatch the same way with `detail.currentVersion`, and a slug already taken
by another article with `detail.articleId`. Validation failures use `code: "validation"` and list the
rejected fields in `detail.issues`. Internal faults arrive as `code: "internal"` with no further
detail; the server log has the cause.
