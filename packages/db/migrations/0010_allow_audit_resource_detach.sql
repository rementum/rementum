CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) - ARRAY['team_id', 'workspace_id', 'brain_id']) =
        (to_jsonb(OLD) - ARRAY['team_id', 'workspace_id', 'brain_id'])
    AND (NEW.team_id IS NOT DISTINCT FROM OLD.team_id OR NEW.team_id IS NULL)
    AND (NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id OR NEW.workspace_id IS NULL)
    AND (NEW.brain_id IS NOT DISTINCT FROM OLD.brain_id OR NEW.brain_id IS NULL)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
