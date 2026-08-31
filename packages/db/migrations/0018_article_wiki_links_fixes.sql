-- Forward fix for 0017: handle orphaned brains without owner, make brain_id immutable,
-- and document the dead ELSE branch. Fresh installs already get the corrected 0017.
CREATE OR REPLACE FUNCTION owl_article_slug_registry_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  claimed_by uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.brain_id IS DISTINCT FROM OLD.brain_id THEN
    RAISE EXCEPTION 'Article brain_id is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO article_slug_registry (brain_id, slug, article_id, is_current)
    VALUES (NEW.brain_id, NEW.slug, NEW.id, true)
    ON CONFLICT (brain_id, slug) DO NOTHING;
  ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
    UPDATE article_slug_registry SET is_current = false
    WHERE article_id = NEW.id AND is_current;
    INSERT INTO article_slug_registry (brain_id, slug, article_id, is_current)
    VALUES (NEW.brain_id, NEW.slug, NEW.id, true)
    ON CONFLICT (brain_id, slug) DO NOTHING;
  ELSE
    RETURN NEW;
  END IF;

  SELECT article_id INTO claimed_by
  FROM article_slug_registry
  WHERE brain_id = NEW.brain_id AND slug = NEW.slug;
  IF claimed_by IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Article slug or alias % is already claimed', NEW.slug
      USING ERRCODE = '23505';
  END IF;
  UPDATE article_slug_registry SET is_current = true
  WHERE brain_id = NEW.brain_id AND slug = NEW.slug AND article_id = NEW.id
    AND NOT is_current;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION owl_worker_unindexed_wiki_links(max_rows integer DEFAULT 100)
RETURNS TABLE (article_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT article.id, member.user_id
  FROM articles article
  JOIN article_versions version
    ON version.article_id = article.id AND version.version = article.current_version
  JOIN brains brain ON brain.id = article.brain_id AND brain.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT user_id FROM brain_members
    WHERE brain_id = brain.id
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, created_at
    LIMIT 1
  ) member ON true
  WHERE article.archived_at IS NULL
    AND article.wiki_links_body_hash IS DISTINCT FROM version.body_hash
    AND member.user_id IS NOT NULL
  ORDER BY article.updated_at
  LIMIT max_rows
$$;
