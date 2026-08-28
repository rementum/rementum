# Claude and Claude Code

Install the Rementum skills, then copy the workspace MCP URL from Rementum's **Teams** page.

Claude Code:

```bash
npx -y skills add rementum/rementum --global \
  --agent claude-code --skill '*' --yes
claude mcp add --scope user --transport http \
  rementum https://YOUR_HOST/mcp/workspace/WORKSPACE_UUID
claude mcp login rementum
```

Complete OAuth in the browser, then ask Claude to call `list_brains` and `get_brain`.
