-- Markdown wiki links are derived from encrypted bodies in the application, but their routing
-- targets are searchable metadata like titles and summaries. Keep unresolved targets so a link
-- can become live after its destination is created, and reserve old slugs so renames remain safe.
ALTER TABLE articles ADD COLUMN wiki_links_body_hash text;
ALTER TABLE staged_writes ADD COLUMN slug_aliases text[] NOT NULL DEFAULT '{}';

ALTER TABLE articles
  ADD CONSTRAINT articles_brain_id_id_uq UNIQUE (brain_id, id);

CREATE TABLE article_slug_registry (
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  article_id uuid NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brain_id, slug),
  CONSTRAINT article_slug_registry_brain_article_fkey
    FOREIGN KEY (brain_id, article_id) REFERENCES articles(brain_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX article_slug_registry_current_uq
  ON article_slug_registry(article_id) WHERE is_current;
CREATE INDEX article_slug_registry_article_idx ON article_slug_registry(article_id);

CREATE TABLE article_wiki_links (
  brain_id uuid NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  from_article_id uuid NOT NULL,
  target_slug text NOT NULL CHECK (
    length(target_slug) BETWEEN 1 AND 120 AND target_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  to_article_id uuid REFERENCES articles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_article_id, target_slug),
  CONSTRAINT article_wiki_links_brain_source_fkey
    FOREIGN KEY (brain_id, from_article_id) REFERENCES articles(brain_id, id) ON DELETE CASCADE,
  -- The single-column FK above keeps ON DELETE SET NULL semantics. This composite FK also
  -- prevents a malformed row from resolving across brain boundaries.
  CONSTRAINT article_wiki_links_brain_target_fkey
    FOREIGN KEY (brain_id, to_article_id) REFERENCES articles(brain_id, id)
);
CREATE INDEX article_wiki_links_target_idx ON article_wiki_links(brain_id, to_article_id);
CREATE INDEX article_wiki_links_unresolved_idx
  ON article_wiki_links(brain_id, target_slug) WHERE to_article_id IS NULL;

INSERT INTO article_slug_registry (brain_id, slug, article_id, is_current)
SELECT brain_id, slug, id, true FROM articles;

CREATE OR REPLACE FUNCTION owl_article_slug_registry_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  claimed_by uuid;
BEGIN
  -- brain_id is immutable: the registry PK is (brain_id, slug), so a brain move would
  -- orphan the old row and violate the composite FK. Keep the invariant explicit.
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
    -- Trigger is `AFTER UPDATE OF slug`, so this branch is dead for slug-only
    -- updates, but keep it for direct function calls and future trigger changes.
    RETURN NEW;
  END IF;

  SELECT article_id INTO claimed_by
  FROM article_slug_registry
  WHERE brain_id = NEW.brain_id AND slug = NEW.slug;
  IF claimed_by IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Article slug or alias % is already claimed', NEW.slug
      USING ERRCODE = '23505';
  END IF;
  -- No-op when is_current already true; kept to repair a stale flag without a
  -- separate UPDATE inside the ELSIF branch.
  UPDATE article_slug_registry SET is_current = true
  WHERE brain_id = NEW.brain_id AND slug = NEW.slug AND article_id = NEW.id
    AND NOT is_current;

  RETURN NEW;
END $$;

CREATE TRIGGER articles_slug_registry_sync
AFTER INSERT OR UPDATE OF slug ON articles
FOR EACH ROW EXECUTE FUNCTION owl_article_slug_registry_sync();

CREATE FUNCTION owl_article_slug_registry_resolve()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE article_wiki_links SET to_article_id = NEW.article_id, updated_at = now()
  WHERE brain_id = NEW.brain_id AND target_slug = NEW.slug
    AND to_article_id IS DISTINCT FROM NEW.article_id;
  RETURN NEW;
END $$;

CREATE TRIGGER article_slug_registry_resolve
AFTER INSERT ON article_slug_registry
FOR EACH ROW EXECUTE FUNCTION owl_article_slug_registry_resolve();

ALTER TABLE article_slug_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_slug_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE article_wiki_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_wiki_links FORCE ROW LEVEL SECURITY;

CREATE POLICY article_slug_registry_member ON article_slug_registry
USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY article_wiki_links_member ON article_wiki_links
USING (owl_can_read_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));

CREATE FUNCTION owl_worker_unindexed_wiki_links(max_rows integer DEFAULT 100)
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

GRANT EXECUTE ON FUNCTION owl_worker_unindexed_wiki_links(integer) TO owl_app;
