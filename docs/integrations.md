# Connect an agent

Every remote client uses the same Streamable HTTP MCP endpoint:

```text
https://memory.example.com/mcp
```

Owl Memory advertises OAuth metadata from the same origin. Your client opens a browser for sign-in
and requests the selected brain and task scopes.

## Claude Code

```bash
claude mcp add --transport http owl-memory https://memory.example.com/mcp
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.

## Cursor

Add this server to the MCP configuration:

```json
{
  "mcpServers": {
    "owl-memory": {
      "url": "https://memory.example.com/mcp"
    }
  }
}
```

## Codex and other clients

Create a remote Streamable HTTP MCP server in the client and use the Owl Memory MCP URL. Keep write
tool approval enabled. Owl Memory marks read tools with `readOnlyHint`, while writes use the staged
write and promotion protocol.

## First request

Start with these calls:

1. `list_brains` finds the brains available to the signed-in account.
2. `get_brain` returns one brain's instructions and routing index.
3. `read_article` loads the current version of an article selected from that index.

Use `stage_write` for memory changes. Review its conflict result before you promote the pending
write.
