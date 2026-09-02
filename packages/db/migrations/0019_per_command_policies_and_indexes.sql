-- Every brain-scoped table kept the FOR ALL policy from 0001: USING read, WITH CHECK edit.
-- PostgreSQL applies only USING to DELETE, so at the database layer any brain viewer could
-- delete articles, versions, staged writes, tasks, embeddings, and even the owner's own
-- membership row. The service layer never issued such a delete, but this layer is meant
-- to stand on its own. Split per command the way 0008 and 0016 did for teams, workspaces,
-- and brains: reads stay at read, every write needs edit, and membership writes need owner.

DROP POLICY IF EXISTS articles_member ON articles;
CREATE POLICY articles_select ON articles FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY articles_insert ON articles FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY articles_update ON articles FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY articles_delete ON articles FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS article_versions_member ON article_versions;
CREATE POLICY article_versions_select ON article_versions FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY article_versions_insert ON article_versions FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY article_versions_update ON article_versions FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY article_versions_delete ON article_versions FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS staged_writes_member ON staged_writes;
CREATE POLICY staged_writes_select ON staged_writes FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY staged_writes_insert ON staged_writes FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY staged_writes_update ON staged_writes FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY staged_writes_delete ON staged_writes FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS sources_member ON sources;
CREATE POLICY sources_select ON sources FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY sources_insert ON sources FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY sources_update ON sources FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY sources_delete ON sources FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS article_sources_member ON article_sources;
CREATE POLICY article_sources_select ON article_sources FOR SELECT USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_read_brain(a.brain_id))
);
CREATE POLICY article_sources_insert ON article_sources FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_sources_update ON article_sources FOR UPDATE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_sources_delete ON article_sources FOR DELETE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);

DROP POLICY IF EXISTS article_links_member ON article_links;
CREATE POLICY article_links_select ON article_links FOR SELECT USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_read_brain(a.brain_id))
);
CREATE POLICY article_links_insert ON article_links FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_links_update ON article_links FOR UPDATE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_edit_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_links_delete ON article_links FOR DELETE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = from_article_id AND owl_can_edit_brain(a.brain_id))
);

DROP POLICY IF EXISTS article_embeddings_member ON article_embeddings;
CREATE POLICY article_embeddings_select ON article_embeddings FOR SELECT USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_read_brain(a.brain_id))
);
CREATE POLICY article_embeddings_insert ON article_embeddings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_embeddings_update ON article_embeddings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);
CREATE POLICY article_embeddings_delete ON article_embeddings FOR DELETE USING (
  EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND owl_can_edit_brain(a.brain_id))
);

DROP POLICY IF EXISTS tasks_member ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY tasks_update ON tasks FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY tasks_delete ON tasks FOR DELETE USING (owl_can_edit_brain(brain_id));

-- Commenters hold no edit setting, so comment inserts stay at read; changing or removing a
-- comment is an editor's action.
DROP POLICY IF EXISTS task_comments_member ON task_comments;
CREATE POLICY task_comments_select ON task_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
);
CREATE POLICY task_comments_insert ON task_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
);
CREATE POLICY task_comments_update ON task_comments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
CREATE POLICY task_comments_delete ON task_comments FOR DELETE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);

DROP POLICY IF EXISTS task_articles_member ON task_articles;
CREATE POLICY task_articles_select ON task_articles FOR SELECT USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
);
CREATE POLICY task_articles_insert ON task_articles FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
CREATE POLICY task_articles_update ON task_articles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
CREATE POLICY task_articles_delete ON task_articles FOR DELETE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);

DROP POLICY IF EXISTS task_links_member ON task_links;
CREATE POLICY task_links_select ON task_links FOR SELECT USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_read_brain(t.brain_id))
);
CREATE POLICY task_links_insert ON task_links FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
CREATE POLICY task_links_update ON task_links FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);
CREATE POLICY task_links_delete ON task_links FOR DELETE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND owl_can_edit_brain(t.brain_id))
);

DROP POLICY IF EXISTS maintenance_member ON maintenance_candidates;
CREATE POLICY maintenance_select ON maintenance_candidates FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY maintenance_insert ON maintenance_candidates FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY maintenance_update ON maintenance_candidates FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY maintenance_delete ON maintenance_candidates FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS imports_member ON imports;
CREATE POLICY imports_select ON imports FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY imports_insert ON imports FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY imports_update ON imports FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY imports_delete ON imports FOR DELETE USING (owl_can_edit_brain(brain_id));

DROP POLICY IF EXISTS article_compaction_jobs_member ON article_compaction_jobs;
CREATE POLICY article_compaction_jobs_select ON article_compaction_jobs FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY article_compaction_jobs_insert ON article_compaction_jobs FOR INSERT WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY article_compaction_jobs_update ON article_compaction_jobs FOR UPDATE
  USING (owl_can_edit_brain(brain_id)) WITH CHECK (owl_can_edit_brain(brain_id));
CREATE POLICY article_compaction_jobs_delete ON article_compaction_jobs FOR DELETE USING (owl_can_edit_brain(brain_id));

-- Membership rows: anyone who can read the brain may see who else can; only an owner
-- may grant, change, or revoke.
DROP POLICY IF EXISTS brain_members_visible ON brain_members;
CREATE POLICY brain_members_select ON brain_members FOR SELECT USING (owl_can_read_brain(brain_id));
CREATE POLICY brain_members_insert ON brain_members FOR INSERT WITH CHECK (owl_is_brain_owner(brain_id));
CREATE POLICY brain_members_update ON brain_members FOR UPDATE
  USING (owl_is_brain_owner(brain_id)) WITH CHECK (owl_is_brain_owner(brain_id));
CREATE POLICY brain_members_delete ON brain_members FOR DELETE USING (owl_is_brain_owner(brain_id));

-- Foreign-key columns that cascades and lookups walk without an index. Deleting a brain,
-- workspace, or team scanned every child table, and OAuth grant lookups read the whole
-- history of issued tokens.
CREATE INDEX IF NOT EXISTS article_versions_brain_idx ON article_versions(brain_id);
CREATE INDEX IF NOT EXISTS sources_brain_idx ON sources(brain_id);
CREATE INDEX IF NOT EXISTS article_sources_source_idx ON article_sources(source_id);
CREATE INDEX IF NOT EXISTS article_links_to_idx ON article_links(to_article_id);
CREATE INDEX IF NOT EXISTS task_articles_article_idx ON task_articles(article_id);
CREATE INDEX IF NOT EXISTS brain_members_user_idx ON brain_members(user_id);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(user_id);
CREATE INDEX IF NOT EXISTS invitations_brain_idx ON invitations(brain_id);
CREATE INDEX IF NOT EXISTS article_compaction_jobs_brain_idx ON article_compaction_jobs(brain_id);
CREATE INDEX IF NOT EXISTS article_compaction_jobs_workspace_idx ON article_compaction_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS audit_events_workspace_created_idx ON audit_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS oauth_records_grant_idx ON oauth_records ((payload->>'grantId'));
CREATE INDEX IF NOT EXISTS oauth_records_account_idx ON oauth_records ((payload->>'accountId'));
