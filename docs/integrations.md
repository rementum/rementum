# Connect an agent

Open **Teams** in Rementum and copy the MCP URL shown for the workspace you want to connect. It
looks like this:

```text
https://memory.example.com/mcp/workspace/WORKSPACE_UUID
```

The URL identifies the workspace; it is not a credential. Rementum opens OAuth in your browser,
checks your team membership, and limits that connection to the selected workspace's brains and tasks.
This approval belongs to the MCP client. Signing in to the Rementum web interface uses a separate
web session and never displays an OAuth consent screen.

## Install the Rementum skills

MCP exposes the tools. The Rementum skills teach coding agents when to load context, how to stage and
promote durable writes, and how to import or maintain a brain safely. Install both parts before using
Rementum.

If you use several supported coding agents, install the skills for all detected agents at once:

```bash
npx -y skills add yibudak/rementum --global --all
```

The package contains `brain-context`, `brain-write`, `brain-import`, and `brain-maintenance`. For a
single agent, use its complete setup block below instead. Restart the agent after installation so it
discovers the new skills.

## Claude Code

```bash
npx -y skills add yibudak/rementum --global \
  --agent claude-code --skill '*' --yes
claude mcp add --scope user --transport http \
  rementum https://memory.example.com/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.

## Codex

```bash
npx -y skills add yibudak/rementum --global \
  --agent codex --skill '*' --yes
codex mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

## Cursor

Add this server to the MCP configuration:

```bash
npx -y skills add yibudak/rementum --global \
  --agent cursor --skill '*' --yes
```

```json
{
  "mcpServers": {
    "rementum": {
      "url": "https://memory.example.com/mcp/workspace/WORKSPACE_UUID"
    }
  }
}
```

## OpenCode

```bash
npx -y skills add yibudak/rementum --global \
  --agent opencode --skill '*' --yes
opencode mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
opencode mcp auth rementum
```

## Claude and Claude Desktop

On supported Claude plans, open **Settings → Connectors**, choose **Add custom connector**, and use
the workspace MCP URL. Remote connectors work in Claude and Claude Desktop; do not put this remote
URL in `claude_desktop_config.json`. See [Anthropic's remote connector guide](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers).

The skills installer targets Claude Code, not the hosted Claude or Claude Desktop connector. Those
clients can use the MCP tools but do not receive the local coding-agent skills from this package.

## ChatGPT

Where custom MCP apps are available for your plan and workspace, enable developer mode, create a
custom app under **Settings → Apps**, and use the workspace MCP URL. Select OAuth when prompted,
scan the tools, and approve the connection. See [OpenAI's MCP app guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt).

The local skills installer targets Codex, not ChatGPT. ChatGPT can use the MCP tools but does not
receive the Codex skills installed on your machine.

## Other MCP clients

Any client that supports remote Streamable HTTP MCP and OAuth can use the same workspace URL. Keep
write-tool approval enabled. Rementum marks read tools with `readOnlyHint`, while writes use the
staged write and promotion protocol.

## First request

At initialization the server sends MCP instructions that tell the agent when to load and write
memory. Clients that surface server instructions, Claude Code among them, apply this guidance
without extra prompt configuration.

Start with these calls:

1. `search_brains` finds the brain matching the current project by name, slug, or description;
   `list_brains` enumerates every accessible brain when a search is not enough.
2. `get_brain` returns one brain's instructions and routing index.
3. `read_article` loads the current version of an article selected from that index.

Use `stage_write` for memory changes. Review its conflict result before you promote the pending
write. Staging never waits for an external LLM. In opted-in workspaces, `read_article` exposes the
deferred compaction status after promotion while the submitted body remains usable.
