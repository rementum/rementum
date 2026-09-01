# Claude and Claude Code

Install the Rementum plugin, then copy the workspace MCP URL from Rementum's **Teams** page.

Claude Code:

```text
/plugin marketplace add rementum/rementum
/plugin install rementum@rementum
```

Enable auto-update once from **/plugin → Marketplaces → rementum → Enable auto-update**. Then add
the hosted workspace connection:

```bash
claude mcp add --scope user --transport http \
  rementum https://rementum.dev/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.
