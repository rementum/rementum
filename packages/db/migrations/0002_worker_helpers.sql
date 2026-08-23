CREATE OR REPLACE FUNCTION owl_worker_brains()
RETURNS TABLE (brain_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, bm.user_id
  FROM brains b
  JOIN LATERAL (
    SELECT user_id FROM brain_members
    WHERE brain_id = b.id AND role = 'owner'
    ORDER BY created_at LIMIT 1
  ) bm ON true
  WHERE b.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION owl_worker_unindexed_articles(max_rows integer DEFAULT 100)
RETURNS TABLE (article_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, bm.user_id
  FROM articles a
  JOIN brains b ON b.id = a.brain_id AND b.deleted_at IS NULL
  JOIN LATERAL (
    SELECT user_id FROM brain_members
    WHERE brain_id = b.id AND role = 'owner'
    ORDER BY created_at LIMIT 1
  ) bm ON true
  WHERE a.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM article_embeddings ae
      WHERE ae.article_id = a.id AND ae.version = a.current_version
    )
  ORDER BY a.updated_at
  LIMIT max_rows
$$;

GRANT EXECUTE ON FUNCTION owl_worker_brains() TO owl_app;
GRANT EXECUTE ON FUNCTION owl_worker_unindexed_articles(integer) TO owl_app;
