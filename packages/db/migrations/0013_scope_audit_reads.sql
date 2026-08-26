-- audit_events rows keep team_id, workspace_id, and brain_id, and migration 0009 sets
-- those columns NULL when the resource is deleted. The previous policy read
-- "brain_id IS NULL OR owl_can_read_brain(brain_id)", so every team-scoped and
-- workspace-scoped event was readable by any authenticated actor, in any tenant.
-- Require a scope the actor actually holds, and keep an actor's own events visible
-- after their resource is detached.
DROP POLICY IF EXISTS audit_member ON audit_events;
CREATE POLICY audit_member ON audit_events USING (
  actor_id = owl_user_id()
  OR (brain_id IS NOT NULL AND owl_can_read_brain(brain_id))
  OR (
    brain_id IS NULL AND workspace_id IS NOT NULL AND workspace_id::text = ANY(
      string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ',')
    )
  )
  OR (
    brain_id IS NULL AND workspace_id IS NULL AND team_id IS NOT NULL AND team_id::text = ANY(
      string_to_array(coalesce(current_setting('app.team_ids', true), ''), ',')
    )
  )
) WITH CHECK (actor_id = owl_user_id());
