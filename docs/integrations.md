# Connect an agent

Open **Teams** in Rementum and copy the MCP URL shown for the workspace you want to connect. It
looks like this:

```text
https://memory.example.com/mcp/workspace/WORKSPACE_UUID
```

The URL identifies the workspace; it is not a credential. Rementum opens OAuth in your browser,
checks your team membership, and limits that connection to the selected workspace's brains and tasks.

## Claude Code

```bash
claude mcp add --scope user --transport http \
  rementum https://memory.example.com/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.

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

## Codex

```bash
codex mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

## OpenCode

```bash
opencode mcp add rementum --url https://memory.example.com/mcp/workspace/WORKSPACE_UUID
opencode mcp auth rementum
```

## Other clients

Create a remote Streamable HTTP MCP server in the client and use the Rementum MCP URL. Keep write
tool approval enabled. Rementum marks read tools with `readOnlyHint`, while writes use the staged
write and promotion protocol.

## First request

Start with these calls:

1. `list_brains` finds the brains available to the connected workspace.
2. `get_brain` returns one brain's instructions and routing index.
3. `read_article` loads the current version of an article selected from that index.

Use `stage_write` for memory changes. Review its conflict result before you promote the pending
write.
