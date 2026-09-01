ALTER TABLE workspaces
  ADD COLUMN mcp_usage_started_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE mcp_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brain_id uuid,
  client_id text NOT NULL,
  client_name text NOT NULL,
  tool_name text NOT NULL,
  article_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_tool_calls_article_limit CHECK (cardinality(article_ids) <= 8)
);

CREATE INDEX mcp_tool_calls_workspace_created_idx
  ON mcp_tool_calls(workspace_id, created_at DESC);
CREATE INDEX mcp_tool_calls_brain_created_idx
  ON mcp_tool_calls(brain_id, created_at DESC)
  WHERE brain_id IS NOT NULL;

ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_calls FORCE ROW LEVEL SECURITY;

CREATE POLICY mcp_tool_calls_member_select ON mcp_tool_calls
  FOR SELECT USING (
    workspace_id::text = ANY(
      string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ',')
    )
  );
CREATE POLICY mcp_tool_calls_member_insert ON mcp_tool_calls
  FOR INSERT WITH CHECK (
    workspace_id::text = ANY(
      string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ',')
    )
  );

GRANT SELECT, INSERT ON mcp_tool_calls TO owl_app;
