# Rementum agent plugin

This plugin bundles the single `rementum` skill — one entry point that teaches a coding agent when
to load context from a brain and how to stage and promote durable writes through seven MCP tools —
for Claude Code, Codex, and Agent Plugins-compatible clients such as Cursor. Task management, bulk
import/export, invitations, and maintenance remain available through the web UI or REST API.

The plugin does not embed a workspace identifier or credential. Install it, then copy the workspace
MCP URL from Rementum's **Teams** page. Hosted workspaces use:

```text
https://rementum.dev/mcp/workspace/WORKSPACE_UUID
```

See the [integration guide](https://rementum.dev/docs/integrations/) for client-specific
installation, OAuth, and update instructions.
