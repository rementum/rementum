# Codex

Install the Rementum plugin, then connect the workspace shown on Rementum's **Teams** page:

```bash
codex plugin marketplace add rementum/rementum
codex plugin add rementum@rementum
codex mcp add rementum --url https://rementum.dev/mcp/workspace/WORKSPACE_UUID
codex mcp login rementum
```

Refresh the Git-backed plugin with `codex plugin marketplace upgrade rementum`. Start a new thread
after installing or updating it so Codex loads the current skills.

Rementum limits the connection to that workspace. It marks read tools with `readOnlyHint`; keep approval
enabled for write tools.

The OpenAI API can also call the server with the remote MCP tool using `server_url` and an OAuth
access token. Product and account availability can differ; consult current official OpenAI Docs.
