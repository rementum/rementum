-- The worker impersonates a brain owner, and every worker function resolved that owner with
-- an inner join on brain_members. A brain whose owner row is gone (its creator was removed
-- from the team, which deletes all of their brain memberships) silently dropped out of
-- maintenance scans, re-embedding, and compaction retries, and the compaction claim was worse:
-- its data-modifying CTEs still leased the job and bumped the attempt counters before the
-- join returned nothing, so the job cycled through processing on every poll forever.
--
-- Team owners already act as the owner of every brain in their workspaces, so they are the
-- fallback identity. The claim resolves the owner before it leases anything.
CREATE OR REPLACE FUNCTION owl_worker_brain_owner(target_brain uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM (
    SELECT member.user_id, 0 AS priority, member.created_at
    FROM brain_members member
    WHERE member.brain_id = target_brain AND member.role = 'owner'
    UNION ALL
    SELECT team_member.user_id, 1 AS priority, team_member.created_at
    FROM brains brain
    JOIN workspaces workspace ON workspace.id = brain.workspace_id
    JOIN team_members team_member
      ON team_member.team_id = workspace.team_id AND team_member.role = 'owner'
    WHERE brain.id = target_brain
  ) candidates
  ORDER BY priority, created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION owl_worker_brains()
RETURNS TABLE (brain_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, owner.user_id
  FROM brains b
  JOIN LATERAL (SELECT owl_worker_brain_owner(b.id) AS user_id) owner ON owner.user_id IS NOT NULL
  WHERE b.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION owl_worker_unindexed_articles(max_rows integer, active_model text)
RETURNS TABLE (article_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, owner.user_id
  FROM articles a
  JOIN brains b ON b.id = a.brain_id AND b.deleted_at IS NULL
  JOIN LATERAL (SELECT owl_worker_brain_owner(b.id) AS user_id) owner ON owner.user_id IS NOT NULL
  WHERE a.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM article_embeddings ae
      WHERE ae.article_id = a.id AND ae.version = a.current_version
        AND ae.model = active_model
    )
  ORDER BY a.updated_at
  LIMIT max_rows
$$;

CREATE OR REPLACE FUNCTION owl_worker_failed_compactions(
  cooldown_seconds integer DEFAULT 3600,
  max_rows integer DEFAULT 100
)
RETURNS TABLE (article_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, owner.user_id
  FROM articles a
  JOIN brains b ON b.id = a.brain_id AND b.deleted_at IS NULL
  JOIN workspaces w ON w.id = b.workspace_id AND w.llm_compaction_enabled
  JOIN LATERAL (SELECT owl_worker_brain_owner(b.id) AS user_id) owner ON owner.user_id IS NOT NULL
  WHERE a.archived_at IS NULL
    AND a.compaction_status = 'failed'
    AND a.updated_at <= now() - (cooldown_seconds * interval '1 second')
  ORDER BY a.updated_at
  LIMIT max_rows
$$;

-- The claim id was the worker id, so a worker that lost its lease to a slow provider call
-- could re-claim the same job on its next poll and then have the earlier call's result
-- accepted against the later claim. Each claim now carries its own identifier.
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
    SELECT job.id, owner.user_id AS owner_id
    FROM article_compaction_jobs job
    JOIN workspaces workspace ON workspace.id = job.workspace_id
    JOIN LATERAL (SELECT owl_worker_brain_owner(job.brain_id) AS user_id) owner
      ON owner.user_id IS NOT NULL
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

-- A provider call may legitimately outlast the lease. The worker extends it while the call
-- runs instead of letting another claim take the job over and count a second attempt.
CREATE OR REPLACE FUNCTION owl_worker_extend_compaction_lease(
  target_job uuid,
  claim text,
  lease_seconds integer
) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH extended AS (
    UPDATE article_compaction_jobs job
    SET lease_expires_at = now() + (lease_seconds * interval '1 second'), updated_at = now()
    WHERE job.id = target_job AND job.claimed_by = claim AND job.status = 'processing'
    RETURNING job.id
  )
  SELECT EXISTS (SELECT 1 FROM extended)
$$;

-- Accepting an invitation replaced whatever role the invitee already held, so inviting the
-- brain's only owner as a viewer demoted them and left the brain with no owner row at all.
CREATE OR REPLACE FUNCTION owl_accept_brain_invitation(
  supplied_token_hash text,
  supplied_user_id uuid,
  supplied_display_name text,
  supplied_password_hash text
) RETURNS TABLE (user_id uuid, user_email text, brain_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite invitations%ROWTYPE;
  accepted_user users%ROWTYPE;
BEGIN
  SELECT * INTO invite FROM invitations
  WHERE token_hash = supplied_token_hash
    AND accepted_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO accepted_user FROM users WHERE lower(email) = lower(invite.email);
  IF FOUND THEN
    IF supplied_user_id IS NULL OR accepted_user.id <> supplied_user_id THEN
      RAISE EXCEPTION 'login_required' USING ERRCODE = '28000';
    END IF;
    IF accepted_user.disabled_at IS NOT NULL THEN
      RAISE EXCEPTION 'account_disabled' USING ERRCODE = '28000';
    END IF;
    UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
    WHERE id = accepted_user.id;
  ELSE
    IF supplied_user_id IS NOT NULL OR supplied_password_hash IS NULL OR supplied_display_name IS NULL THEN
      RAISE EXCEPTION 'invalid_invitation_account' USING ERRCODE = '22023';
    END IF;
    INSERT INTO users (email, display_name, password_hash, email_verified_at)
    VALUES (invite.email, supplied_display_name, supplied_password_hash, now())
    RETURNING * INTO accepted_user;
  END IF;

  INSERT INTO brain_members (brain_id, user_id, role)
  VALUES (invite.brain_id, accepted_user.id, invite.brain_role)
  ON CONFLICT ON CONSTRAINT brain_members_pkey DO UPDATE SET role = excluded.role
  WHERE brain_members.role <> 'owner';

  UPDATE invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email, invite.brain_id;
END $$;

GRANT EXECUTE ON FUNCTION owl_worker_brain_owner(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_worker_extend_compaction_lease(uuid, text, integer) TO owl_app;
