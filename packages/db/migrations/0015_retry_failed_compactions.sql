-- Terminal compaction failures are timestamped through articles.updated_at (failCompaction
-- bumps it), so the cooldown reads that column and the scan is covered by the partial index
-- articles_compaction_status_idx from 0012. Workspaces with compaction turned off are
-- excluded here so the worker never queues jobs nothing would process.
CREATE OR REPLACE FUNCTION owl_worker_failed_compactions(
  cooldown_seconds integer DEFAULT 3600,
  max_rows integer DEFAULT 100
)
RETURNS TABLE (article_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, bm.user_id
  FROM articles a
  JOIN brains b ON b.id = a.brain_id AND b.deleted_at IS NULL
  JOIN workspaces w ON w.id = b.workspace_id AND w.llm_compaction_enabled
  JOIN LATERAL (
    SELECT user_id FROM brain_members
    WHERE brain_id = b.id AND role = 'owner'
    ORDER BY created_at LIMIT 1
  ) bm ON true
  WHERE a.archived_at IS NULL
    AND a.compaction_status = 'failed'
    AND a.updated_at <= now() - (cooldown_seconds * interval '1 second')
  ORDER BY a.updated_at
  LIMIT max_rows
$$;

GRANT EXECUTE ON FUNCTION owl_worker_failed_compactions(integer, integer) TO owl_app;
