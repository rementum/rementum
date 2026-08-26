# Claude and Claude Code

Copy the workspace MCP URL from Rementum's **Teams** page.

Claude Code:

```bash
claude mcp add --scope user --transport http \
  rementum https://YOUR_HOST/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.
