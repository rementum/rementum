CREATE TABLE web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX web_sessions_user_expires_idx ON web_sessions(user_id, expires_at);
CREATE INDEX web_sessions_expires_idx ON web_sessions(expires_at);

WITH web_grants AS (
  SELECT id
  FROM oauth_records
  WHERE model = 'Grant' AND payload->>'clientId' = 'rementum-web'
)
DELETE FROM oauth_records
WHERE payload->>'clientId' = 'rementum-web'
   OR payload->>'grantId' IN (SELECT id FROM web_grants);

GRANT SELECT, INSERT, DELETE ON web_sessions TO owl_app;
