CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE brain_role AS ENUM ('owner', 'editor', 'commenter', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE article_kind AS ENUM ('canonical', 'log');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE freshness AS ENUM ('current', 'review_due', 'stale', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE write_operation AS ENUM ('create', 'update', 'append');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE write_status AS ENUM ('pending', 'promoted', 'conflicted', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('open', 'claimed', 'blocked', 'review', 'approved', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  system_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS brains (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  wrapped_key jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS brain_members (
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role brain_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brain_id, user_id)
);

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY,
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  kind article_kind NOT NULL DEFAULT 'canonical',
  freshness freshness NOT NULL DEFAULT 'unknown',
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  verified_at timestamptz,
  review_after timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  search_document tsvector NOT NULL DEFAULT ''::tsvector,
  UNIQUE (brain_id, slug)
);
CREATE INDEX IF NOT EXISTS articles_search_idx ON articles USING gin(search_document);
CREATE INDEX IF NOT EXISTS articles_brain_updated_idx ON articles(brain_id, updated_at DESC);

CREATE OR REPLACE FUNCTION owl_articles_search_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_document :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(NEW.keywords, ' ')), 'C');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS articles_search_document_update ON articles;
CREATE TRIGGER articles_search_document_update
BEFORE INSERT OR UPDATE OF title, summary, keywords ON articles
FOR EACH ROW EXECUTE FUNCTION owl_articles_search_document();

CREATE TABLE IF NOT EXISTS article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  body_ciphertext bytea NOT NULL,
  body_nonce bytea NOT NULL,
  body_tag bytea NOT NULL,
  cipher_version integer NOT NULL DEFAULT 1,
  body_aad text NOT NULL,
  body_hash text NOT NULL,
  change_summary text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_id uuid NOT NULL REFERENCES users(id),
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

CREATE TABLE IF NOT EXISTS staged_writes (
  id uuid PRIMARY KEY,
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  article_id uuid NOT NULL,
  operation write_operation NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  kind article_kind NOT NULL,
  base_version integer,
  body_ciphertext bytea NOT NULL,
  body_nonce bytea NOT NULL,
  body_tag bytea NOT NULL,
  cipher_version integer NOT NULL DEFAULT 1,
  body_aad text NOT NULL,
  body_hash text NOT NULL,
  change_summary text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status write_status NOT NULL DEFAULT 'pending',
  potential_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_conflicts boolean NOT NULL DEFAULT false,
  staged_by uuid NOT NULL REFERENCES users(id),
  staged_client_id text,
  promoted_by uuid REFERENCES users(id),
  promoted_version integer,
  decision_summary text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (operation = 'create' AND base_version IS NULL) OR
    (operation <> 'create' AND base_version IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS staged_writes_brain_status_idx ON staged_writes(brain_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS staged_writes_actor_idempotency_uq
  ON staged_writes(staged_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  kind text NOT NULL,
  locator text,
  checksum text,
  label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS article_sources (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, version, source_id)
);

CREATE TABLE IF NOT EXISTS article_links (
  from_article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  to_article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'related',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_article_id, to_article_id, relation),
  CHECK (from_article_id <> to_article_id)
);

CREATE TABLE IF NOT EXISTS article_embeddings (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  embedding vector(384) NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, version, ordinal)
);
CREATE INDEX IF NOT EXISTS article_embeddings_hnsw_idx
  ON article_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  title text NOT NULL,
  brief text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  status task_status NOT NULL DEFAULT 'open',
  claimed_by uuid REFERENCES users(id),
  claimed_client_id text,
  lease_expires_at timestamptz,
  idempotency_key text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_claim_idx
  ON tasks(brain_id, status, priority DESC, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_actor_idempotency_uq
  ON tasks(created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_articles (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id, article_id)
);

CREATE TABLE IF NOT EXISTS task_links (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, url)
);

CREATE TABLE IF NOT EXISTS maintenance_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  kind text NOT NULL,
  article_ids uuid[] NOT NULL,
  score double precision,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brain_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'preview',
  manifest jsonb NOT NULL,
  blob_path text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  blob_path text,
  content_hash text,
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  brain_id uuid REFERENCES brains(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  client_id text,
  action text NOT NULL,
  resource text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_brain_created_idx ON audit_events(brain_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oauth_records (
  model text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  consumed_at timestamptz,
  expires_at timestamptz,
  PRIMARY KEY(model, id)
);
CREATE INDEX IF NOT EXISTS oauth_records_expires_idx ON oauth_records(expires_at);

CREATE OR REPLACE FUNCTION owl_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION owl_can_read_brain(target_brain uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_brain::text = ANY(
    string_to_array(coalesce(current_setting('app.brain_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_can_edit_brain(target_brain uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_brain::text = ANY(
    string_to_array(coalesce(current_setting('app.edit_brain_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_is_brain_owner(target_brain uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_brain::text = ANY(
    string_to_array(coalesce(current_setting('app.owner_brain_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_actor_context(target_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'workspaceRoles', coalesce((
      SELECT jsonb_object_agg(workspace_id::text, role::text)
      FROM workspace_members WHERE user_id = target_user
    ), '{}'::jsonb),
    'brainRoles', coalesce((
      SELECT jsonb_object_agg(brain_id::text, role::text)
      FROM brain_members WHERE user_id = target_user
    ), '{}'::jsonb)
  )
$$;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE brains ENABLE ROW LEVEL SECURITY;
ALTER TABLE brains FORCE ROW LEVEL SECURITY;
ALTER TABLE brain_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_members FORCE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles FORCE ROW LEVEL SECURITY;
ALTER TABLE article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE staged_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE staged_writes FORCE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
ALTER TABLE article_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE article_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_links FORCE ROW LEVEL SECURITY;
ALTER TABLE article_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE task_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_links FORCE ROW LEVEL SECURITY;
ALTER TABLE maintenance_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports FORCE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_member ON workspaces;
CREATE POLICY workspaces_member ON workspaces USING (
  id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
DROP POLICY IF EXISTS workspace_members_visible ON workspace_members;
CREATE POLICY workspace_members_visible ON workspace_members USING (
  workspace_id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
DROP POLICY IF EXISTS brains_member ON brains;
CREATE POLICY brains_member ON brains USING (owl_can_read_brain(id)) WITH CHECK (
  workspace_id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
DROP POLICY IF EXISTS brain_members_visible ON brain_members;
CREATE POLICY brain_members_visible ON brain_members USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_is_brain_owner(brain_id));
DROP POLICY IF EXISTS articles_member ON articles;
CREATE POLICY articles_member ON articles USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS article_versions_member ON article_versions;
CREATE POLICY article_versions_member ON article_versions USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS staged_writes_member ON staged_writes;
CREATE POLICY staged_writes_member ON staged_writes USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS sources_member ON sources;
CREATE POLICY sources_member ON sources USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS article_sources_member ON article_sources;
CREATE POLICY article_sources_member ON article_sources USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_read_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
DROP POLICY IF EXISTS article_links_member ON article_links;
CREATE POLICY article_links_member ON article_links USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_read_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_edit_brain(a.brain_id))
);
DROP POLICY IF EXISTS article_embeddings_member ON article_embeddings;
CREATE POLICY article_embeddings_member ON article_embeddings USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_read_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
DROP POLICY IF EXISTS tasks_member ON tasks;
CREATE POLICY tasks_member ON tasks USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS task_comments_member ON task_comments;
CREATE POLICY task_comments_member ON task_comments USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
);
DROP POLICY IF EXISTS task_articles_member ON task_articles;
CREATE POLICY task_articles_member ON task_articles USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
DROP POLICY IF EXISTS task_links_member ON task_links;
CREATE POLICY task_links_member ON task_links USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
DROP POLICY IF EXISTS maintenance_member ON maintenance_candidates;
CREATE POLICY maintenance_member ON maintenance_candidates USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS imports_member ON imports;
CREATE POLICY imports_member ON imports USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
DROP POLICY IF EXISTS exports_owner ON exports;
CREATE POLICY exports_owner ON exports USING (owl_is_brain_owner(brain_id)) WITH CHECK (owl_is_brain_owner(brain_id));
DROP POLICY IF EXISTS audit_member ON audit_events;
CREATE POLICY audit_member ON audit_events USING (
  brain_id IS NULL OR owl_can_read_brain(brain_id)
) WITH CHECK (actor_id = owl_user_id());

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

GRANT USAGE ON SCHEMA public TO owl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO owl_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO owl_app;
GRANT EXECUTE ON FUNCTION owl_actor_context(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_user_id() TO owl_app;
GRANT EXECUTE ON FUNCTION owl_can_read_brain(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_can_edit_brain(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_is_brain_owner(uuid) TO owl_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO owl_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO owl_app;
