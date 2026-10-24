-- Static bearer credentials for MCP clients that cannot keep an OAuth refresh chain alive. Like
-- web_sessions this is read before any actor exists, so it carries no RLS; the API resolves a
-- key here and then narrows the owner to the key's workspace exactly as it does an OAuth token.
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_user_idx ON api_keys(user_id);

GRANT SELECT, INSERT, DELETE ON api_keys TO owl_app;
