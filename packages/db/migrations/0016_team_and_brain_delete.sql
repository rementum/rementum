-- Brains kept the FOR ALL policy from 0001, so at the database layer any brain reader could
-- DELETE or UPDATE the row. Deletion becomes a real feature here, which is exactly when that
-- must tighten: split per command the way workspaces and teams were split in 0008, with the
-- destructive commands scoped to the brain owner.
DROP POLICY IF EXISTS brains_member ON brains;
CREATE POLICY brains_select ON brains FOR SELECT USING (owl_can_read_brain(id));
CREATE POLICY brains_insert ON brains FOR INSERT WITH CHECK (
  workspace_id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
CREATE POLICY brains_update ON brains FOR UPDATE
  USING (owl_is_brain_owner(id)) WITH CHECK (owl_is_brain_owner(id));
CREATE POLICY brains_delete ON brains FOR DELETE USING (owl_is_brain_owner(id));

-- Deleting a team cascades into team_members, and row-level BEFORE DELETE triggers fire on
-- cascaded rows too, so the owner-immutability trigger from 0008 blocked team deletion
-- outright. The owner row may only go once its team row is already gone in this transaction —
-- which is precisely the cascade case; a direct delete of the owner membership still fails.
-- SECURITY DEFINER so row-level security cannot make an existing team look absent: an
-- invisible team must still protect its owner row.
CREATE OR REPLACE FUNCTION owl_preserve_team_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF TG_OP = 'DELETE' THEN
      IF EXISTS (SELECT 1 FROM teams WHERE id = OLD.team_id) THEN
        RAISE EXCEPTION 'team_owner_is_immutable' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'team_owner_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
