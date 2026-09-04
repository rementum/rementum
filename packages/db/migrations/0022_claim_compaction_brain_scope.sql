-- The compaction claim takes the oldest available job on the whole instance. That is
-- what the worker wants, but not what the integration suites want: they share one
-- database and run test files in parallel, so a test claiming "the" queued job could
-- lease a job another file had just queued, and both files then failed on each other's
-- attempt counters. This overload scopes the claim to one brain. The worker keeps
-- calling the two-argument form and still drains the whole instance.
CREATE OR REPLACE FUNCTION owl_worker_claim_compaction(
  claimant text,
  lease_seconds integer DEFAULT 120,
  target_brain uuid DEFAULT NULL
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
    SELECT job.id, owner.user_id AS owner_id
    FROM article_compaction_jobs job
    JOIN workspaces workspace ON workspace.id = job.workspace_id
    JOIN LATERAL (SELECT owl_worker_brain_owner(job.brain_id) AS user_id) owner
      ON owner.user_id IS NOT NULL
    WHERE workspace.llm_compaction_enabled
      AND (target_brain IS NULL OR job.brain_id = target_brain)
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
        claimed_by = claimant || ':' || gen_random_uuid()::text,
        lease_expires_at = now() + (lease_seconds * interval '1 second'),
        updated_at = now()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*, candidate.owner_id
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
         claimed.owner_id,
         claimed.claimed_by
  FROM claimed
  LEFT JOIN article_updated ON article_updated.id = claimed.article_id
$$;

GRANT EXECUTE ON FUNCTION owl_worker_claim_compaction(text, integer, uuid) TO owl_app;
