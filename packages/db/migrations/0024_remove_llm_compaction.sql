-- LLM compaction is removed. It rewrote article bodies through an external model that had
-- none of the writing agent's context, its output was never verified beyond shape and
-- length, every success bumped current_version and conflicted writes staged against the
-- source, and its retry loop resent rejected bodies in plaintext. Routing summaries are
-- derived locally; titles and bodies stay exactly as submitted.
--
-- The instance overview counted compaction jobs, so it is redefined first: a plpgsql body
-- is only checked when it runs, and the panel would otherwise fail on the dropped table.
CREATE OR REPLACE FUNCTION owl_instance_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM owl_require_system_owner();
  WITH bounds AS (
    SELECT now() AS generated_at,
      ((now() AT TIME ZONE 'UTC')::date - 29) AS series_start
  ), signups AS (
    SELECT (u.created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS signups
    FROM users u CROSS JOIN bounds
    WHERE u.created_at >= (bounds.series_start::timestamp AT TIME ZONE 'UTC')
    GROUP BY day
  ), calls AS (
    SELECT (c.created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS calls
    FROM mcp_tool_calls c CROSS JOIN bounds
    WHERE c.created_at >= (bounds.series_start::timestamp AT TIME ZONE 'UTC')
    GROUP BY day
  ), people AS (
    SELECT e.actor_id, e.created_at
    FROM audit_events e
    WHERE e.created_at >= now() - interval '30 days'
      AND e.action <> 'task.heartbeat'
      AND e.client_id IS DISTINCT FROM 'rementum-worker'
  )
  SELECT jsonb_build_object(
    'generatedAt', bounds.generated_at,
    'accounts', jsonb_build_object(
      'total', (SELECT count(*) FROM users),
      'verified', (
        SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL AND disabled_at IS NULL
      ),
      'unverified', (
        SELECT count(*) FROM users WHERE email_verified_at IS NULL AND disabled_at IS NULL
      ),
      'disabled', (SELECT count(*) FROM users WHERE disabled_at IS NOT NULL),
      'systemOwners', (SELECT count(*) FROM users WHERE system_owner AND disabled_at IS NULL),
      'newLast7Days', (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days'),
      'newLast30Days', (
        SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days'
      ),
      'activeLast7Days', (
        SELECT count(DISTINCT actor_id) FROM people WHERE created_at >= now() - interval '7 days'
      ),
      'activeLast30Days', (SELECT count(DISTINCT actor_id) FROM people)
    ),
    'knowledge', jsonb_build_object(
      'teams', (SELECT count(*) FROM teams),
      'workspaces', (SELECT count(*) FROM workspaces),
      'brains', (SELECT count(*) FROM brains WHERE deleted_at IS NULL),
      'articles', (
        SELECT count(*) FROM articles a
        JOIN brains b ON b.id = a.brain_id AND b.deleted_at IS NULL
        WHERE a.archived_at IS NULL
      ),
      'versions', (SELECT count(*) FROM article_versions),
      'pendingWrites', (SELECT count(*) FROM staged_writes WHERE status = 'pending'),
      'conflictedWrites', (SELECT count(*) FROM staged_writes WHERE status = 'conflicted'),
      'openTasks', (SELECT count(*) FROM tasks WHERE status = 'open'),
      'claimedTasks', (SELECT count(*) FROM tasks WHERE status = 'claimed')
    ),
    'usage', jsonb_build_object(
      'mcpCallsLast24Hours', (
        SELECT count(*) FROM mcp_tool_calls WHERE created_at >= now() - interval '24 hours'
      ),
      'mcpCallsLast7Days', (
        SELECT count(*) FROM mcp_tool_calls WHERE created_at >= now() - interval '7 days'
      ),
      'mcpCallsLast30Days', (
        SELECT count(*) FROM mcp_tool_calls WHERE created_at >= now() - interval '30 days'
      ),
      'mcpCallsTotal', (SELECT count(*) FROM mcp_tool_calls),
      'activeClientsLast30Days', (
        SELECT count(DISTINCT client_id) FROM mcp_tool_calls
        WHERE created_at >= now() - interval '30 days'
      ),
      'webSessions', (SELECT count(*) FROM web_sessions WHERE expires_at > now()),
      'mcpConnections', (
        SELECT count(*) FROM oauth_records
        WHERE model = 'Grant' AND (expires_at IS NULL OR expires_at > now())
      )
    ),
    'storage', jsonb_build_object(
      'databaseBytes', pg_database_size(current_database())
    ),
    'daily', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', to_char(days.day, 'YYYY-MM-DD'),
          'signups', coalesce(s.signups, 0),
          'calls', coalesce(c.calls, 0)
        ) ORDER BY days.day
      )
      FROM (
        SELECT (bounds.series_start + series.day_offset)::date AS day
        FROM bounds CROSS JOIN LATERAL generate_series(0, 29) AS series(day_offset)
      ) days
      LEFT JOIN signups s ON s.day = days.day
      LEFT JOIN calls c ON c.day = days.day
    ), '[]'::jsonb)
  ) INTO result
  FROM bounds;
  RETURN result;
END $$;

DROP FUNCTION IF EXISTS owl_worker_claim_compaction(text, integer, uuid);
DROP FUNCTION IF EXISTS owl_worker_claim_compaction(text, integer);
DROP FUNCTION IF EXISTS owl_worker_extend_compaction_lease(uuid, text, integer);
DROP FUNCTION IF EXISTS owl_worker_failed_compactions(integer, integer);
DROP FUNCTION IF EXISTS owl_brain_compaction_enabled(uuid);
DROP TABLE IF EXISTS article_compaction_jobs;
-- articles_compaction_status_idx goes with its column.
ALTER TABLE articles
  DROP COLUMN IF EXISTS compaction_status,
  DROP COLUMN IF EXISTS compaction_attempts,
  DROP COLUMN IF EXISTS compaction_error,
  DROP COLUMN IF EXISTS compacted_at;
ALTER TABLE workspaces DROP COLUMN IF EXISTS llm_compaction_enabled;
DROP TYPE IF EXISTS compaction_status;
