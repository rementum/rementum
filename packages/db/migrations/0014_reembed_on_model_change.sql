-- Vectors are only comparable inside the space of the model that produced them, so an article
-- indexed under a previous embedding model is unindexed for the active one. The one-argument
-- function counted any embedding rows as indexed, which meant a model change left every stale
-- vector in place forever: search filtered them out, nothing re-embedded them, and semantic
-- search silently went dark article by article. The worker now names the active model and the
-- hourly pass re-embeds whatever was produced by anything else.
DROP FUNCTION IF EXISTS owl_worker_unindexed_articles(integer);
CREATE FUNCTION owl_worker_unindexed_articles(max_rows integer, active_model text)
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
        AND ae.model = active_model
    )
  ORDER BY a.updated_at
  LIMIT max_rows
$$;
GRANT EXECUTE ON FUNCTION owl_worker_unindexed_articles(integer, text) TO owl_app;
