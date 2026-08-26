DO $$ BEGIN
  CREATE TYPE compaction_status AS ENUM (
    'not_requested',
    'queued',
    'processing',
    'compacted',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE workspaces
  ADD COLUMN llm_compaction_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE articles
  ADD COLUMN compaction_status compaction_status NOT NULL DEFAULT 'not_requested',
  ADD COLUMN compaction_attempts integer NOT NULL DEFAULT 0 CHECK (compaction_attempts >= 0),
  ADD COLUMN compaction_error text,
  ADD COLUMN compacted_at timestamptz;

CREATE INDEX articles_compaction_status_idx
  ON articles(compaction_status, updated_at)
  WHERE archived_at IS NULL;

CREATE TABLE article_compaction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  article_id uuid NOT NULL,
  article_version integer NOT NULL CHECK (article_version > 0),
  source_title text NOT NULL,
  status compaction_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, article_version),
  CONSTRAINT article_compaction_jobs_article_version_fkey
    FOREIGN KEY (article_id, article_version)
    REFERENCES article_versions(article_id, version) ON DELETE CASCADE
);

CREATE INDEX article_compaction_jobs_claim_idx
  ON article_compaction_jobs(status, available_at, created_at);

ALTER TABLE article_compaction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_compaction_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY article_compaction_jobs_member ON article_compaction_jobs
  USING (owl_can_read_brain(brain_id))
  WITH CHECK (owl_can_edit_brain(brain_id));

CREATE OR REPLACE FUNCTION owl_brain_compaction_enabled(target_brain uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT workspace.llm_compaction_enabled
    FROM brains brain
    JOIN workspaces workspace ON workspace.id = brain.workspace_id
    WHERE brain.id = target_brain AND owl_can_read_brain(brain.id)
  ), false)
$$;

CREATE OR REPLACE FUNCTION owl_worker_claim_compaction(
  claimant text,
  lease_seconds integer DEFAULT 120
) RETURNS TABLE (
  job_id uuid,
  workspace_id uuid,
  brain_id uuid,
  article_id uuid,
  article_version integer,
  source_title text,
  attempts integer,
  owner_id uuid,
  claim_id text
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH candidate AS (
    SELECT job.id
    FROM article_compaction_jobs job
    JOIN workspaces workspace ON workspace.id = job.workspace_id
    WHERE workspace.llm_compaction_enabled
      AND (
        (job.status = 'queued' AND job.available_at <= now())
        OR (job.status = 'processing' AND job.lease_expires_at < now())
      )
    ORDER BY job.available_at, job.created_at
    FOR UPDATE OF job SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE article_compaction_jobs job
    SET status = 'processing',
        attempts = job.attempts + 1,
        claimed_by = claimant,
        lease_expires_at = now() + (lease_seconds * interval '1 second'),
        updated_at = now()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  ), article_updated AS (
    UPDATE articles article
    SET compaction_status = 'processing',
        compaction_attempts = claimed.attempts,
        compaction_error = NULL,
        updated_at = now()
    FROM claimed
    WHERE article.id = claimed.article_id
      AND article.current_version = claimed.article_version
    RETURNING article.id
  )
  SELECT claimed.id,
         claimed.workspace_id,
         claimed.brain_id,
         claimed.article_id,
         claimed.article_version,
         claimed.source_title,
         claimed.attempts,
         owner.user_id,
         claimed.claimed_by
  FROM claimed
  LEFT JOIN article_updated ON article_updated.id = claimed.article_id
  JOIN LATERAL (
    SELECT member.user_id
    FROM brain_members member
    WHERE member.brain_id = claimed.brain_id AND member.role = 'owner'
    ORDER BY member.created_at
    LIMIT 1
  ) owner ON true
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON article_compaction_jobs TO owl_app;
GRANT USAGE ON TYPE compaction_status TO owl_app;
GRANT EXECUTE ON FUNCTION owl_brain_compaction_enabled(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_worker_claim_compaction(text, integer) TO owl_app;
