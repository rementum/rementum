# Codex

Install the Rementum skills, copy the workspace MCP URL from Rementum's **Teams** page, then run:

```bash
npx -y skills add rementum/rementum --global \
  --agent codex --skill '*' --yes
codex mcp add rementum --url https://YOUR_HOST/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

Rementum limits the connection to that workspace. It marks read tools with `readOnlyHint`; keep approval
enabled for write tools.

The OpenAI API can also call the server with the remote MCP tool using `server_url` and an OAuth
access token. Product and account availability can differ; consult current official OpenAI Docs.
