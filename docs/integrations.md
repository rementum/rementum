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

## Claude Code

```bash
claude mcp add --scope user --transport http \
  rementum https://memory.example.com/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.

## Codex

```bash
codex mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

## Cursor

Add this server to the MCP configuration:

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
opencode mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
opencode mcp auth rementum
```

## Claude and Claude Desktop

On supported Claude plans, open **Settings → Connectors**, choose **Add custom connector**, and use
the workspace MCP URL. Remote connectors work in Claude and Claude Desktop; do not put this remote
URL in `claude_desktop_config.json`. See [Anthropic's remote connector guide](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers).

## ChatGPT

Where custom MCP apps are available for your plan and workspace, enable developer mode, create a
custom app under **Settings → Apps**, and use the workspace MCP URL. Select OAuth when prompted,
scan the tools, and approve the connection. See [OpenAI's MCP app guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt).

## Other MCP clients

Any client that supports remote Streamable HTTP MCP and OAuth can use the same workspace URL. Keep
write-tool approval enabled. Rementum marks read tools with `readOnlyHint`, while writes use the
staged write and promotion protocol.

## First request

Start with these calls:

1. `list_brains` finds the brains available to the connected workspace.
2. `get_brain` returns one brain's instructions and routing index.
3. `read_article` loads the current version of an article selected from that index.

Use `stage_write` for memory changes. Review its conflict result before you promote the pending
write.
