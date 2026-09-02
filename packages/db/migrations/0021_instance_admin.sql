-- users.system_owner has marked the account that `create-owner` makes since the first
-- migration, but nothing read it. It now gates the instance panel: the cross-tenant counts
-- and the account list a self-hoster needs and that row-level security rightly hides from
-- every workspace member. These functions run as definer so they can see across tenants,
-- which is exactly why each one re-checks the flag against app.user_id itself instead of
-- trusting whoever called it. The service layer checks the same flag first; this layer is
-- meant to hold on its own.

CREATE OR REPLACE FUNCTION owl_require_system_owner() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = owl_user_id() AND system_owner AND disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'system_owner_required' USING ERRCODE = '42501';
  END IF;
END $$;

-- The rolling windows scan by time across every tenant; the existing indexes all lead
-- with a scope column, so without these two the overview reads both tables end to end.
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_tool_calls_created_idx ON mcp_tool_calls(created_at DESC);

-- Counts only. No article body, tool argument, address, or token is read here, so the
-- overview stays within the metadata the security checklist already lists as stored in
-- plaintext. Heartbeats and the worker's own actions are left out of "active accounts":
-- the worker acts as a brain owner, and a lease renewal is not a person doing something.
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
    'compaction', jsonb_build_object(
      'queued', (SELECT count(*) FROM article_compaction_jobs WHERE status = 'queued'),
      'processing', (SELECT count(*) FROM article_compaction_jobs WHERE status = 'processing'),
      'failed', (SELECT count(*) FROM article_compaction_jobs WHERE status = 'failed')
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

-- One page of accounts, newest first, with the derived facts the panel shows next to each:
-- team memberships, the last audited action, and live MCP grants. The pattern is matched
-- with ILIKE; the caller escapes its wildcards, and the search is bounded by the same
-- flag check as everything else here.
CREATE OR REPLACE FUNCTION owl_instance_users(search text, page_limit int, page_offset int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
  pattern text := '%' || coalesce(search, '') || '%';
BEGIN
  PERFORM owl_require_system_owner();
  WITH matched AS (
    SELECT u.id, u.email, u.display_name, u.system_owner,
      u.email_verified_at, u.disabled_at, u.created_at
    FROM users u
    WHERE coalesce(search, '') = ''
      OR u.email ILIKE pattern ESCAPE '\'
      OR u.display_name ILIKE pattern ESCAPE '\'
  ), page AS (
    SELECT m.*,
      (SELECT count(*)::int FROM team_members tm WHERE tm.user_id = m.id) AS teams,
      (
        SELECT max(e.created_at) FROM audit_events e
        WHERE e.actor_id = m.id
          AND e.action <> 'task.heartbeat'
          AND e.client_id IS DISTINCT FROM 'rementum-worker'
      ) AS last_active_at,
      (
        SELECT count(*)::int FROM oauth_records r
        WHERE r.model = 'Grant'
          AND r.payload->>'accountId' = m.id::text
          AND (r.expires_at IS NULL OR r.expires_at > now())
      ) AS mcp_connections
    FROM matched m
    ORDER BY m.created_at DESC, m.id
    LIMIT greatest(page_limit, 0) OFFSET greatest(page_offset, 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'displayName', p.display_name,
          'systemOwner', p.system_owner,
          'emailVerifiedAt', p.email_verified_at,
          'disabledAt', p.disabled_at,
          'createdAt', p.created_at,
          'teams', p.teams,
          'lastActiveAt', p.last_active_at,
          'mcpConnections', p.mcp_connections
        ) ORDER BY p.created_at DESC, p.id
      )
      FROM page p
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Definer functions are executable by PUBLIC unless said otherwise. They refuse anyone
-- but a system owner on their own, but there is no reason for any other role to reach
-- them at all.
REVOKE ALL ON FUNCTION owl_require_system_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION owl_instance_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION owl_instance_users(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owl_require_system_owner() TO owl_app;
GRANT EXECUTE ON FUNCTION owl_instance_overview() TO owl_app;
GRANT EXECUTE ON FUNCTION owl_instance_users(text, int, int) TO owl_app;
