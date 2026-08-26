DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role team_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

INSERT INTO teams (id, slug, name, created_by, created_at)
SELECT id, slug, name, created_by, created_at FROM workspaces;

INSERT INTO team_members (team_id, user_id, role, created_at)
SELECT workspace_id, user_id, role::text::team_role, created_at FROM workspace_members;

ALTER TABLE workspaces ADD COLUMN team_id uuid;
UPDATE workspaces SET team_id = id;
ALTER TABLE workspaces ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE workspaces DROP CONSTRAINT workspaces_slug_key;
CREATE UNIQUE INDEX workspaces_team_slug_uq ON workspaces(team_id, slug);

DROP POLICY IF EXISTS team_invitations_manage ON team_invitations;
DROP INDEX IF EXISTS team_invitations_pending_email_uq;
DROP INDEX IF EXISTS team_invitations_workspace_idx;
DROP FUNCTION IF EXISTS owl_accept_team_invitation(text, uuid, text, text);
DROP FUNCTION IF EXISTS owl_inspect_team_invitation(text);
ALTER TABLE team_invitations DROP CONSTRAINT team_invitations_workspace_id_fkey;
ALTER TABLE team_invitations DROP CONSTRAINT team_invitations_role_check;
ALTER TABLE team_invitations RENAME COLUMN workspace_id TO team_id;
ALTER TABLE team_invitations ALTER COLUMN role TYPE team_role USING role::text::team_role;
ALTER TABLE team_invitations
  ADD CONSTRAINT team_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_invitations
  ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('admin', 'member'));
CREATE UNIQUE INDEX team_invitations_pending_email_uq
  ON team_invitations(team_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX team_invitations_team_idx ON team_invitations(team_id, created_at);

ALTER TABLE audit_events
  ADD COLUMN team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
UPDATE audit_events
SET team_id = workspace_id
WHERE resource LIKE 'team:%';
CREATE INDEX audit_events_team_created_idx ON audit_events(team_id, created_at DESC);

CREATE OR REPLACE FUNCTION owl_can_manage_team(target_team uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_team::text = ANY(
    string_to_array(coalesce(current_setting('app.manage_team_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_is_team_owner(target_team uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_team::text = ANY(
    string_to_array(coalesce(current_setting('app.owner_team_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_actor_context(target_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH team_access AS (
    SELECT team_id, role
    FROM team_members
    WHERE user_id = target_user
  ), workspace_access AS (
    SELECT w.id AS workspace_id, ta.role
    FROM team_access ta
    JOIN workspaces w ON w.team_id = ta.team_id
  ), explicit_access AS (
    SELECT brain_id,
      role,
      CASE role
        WHEN 'owner' THEN 4 WHEN 'editor' THEN 3 WHEN 'commenter' THEN 2 ELSE 1
      END AS rank
    FROM brain_members
    WHERE user_id = target_user
  ), inherited_access AS (
    SELECT b.id AS brain_id,
      CASE WHEN wa.role IN ('owner', 'admin') THEN 'owner'::brain_role ELSE 'editor'::brain_role END AS role,
      CASE WHEN wa.role IN ('owner', 'admin') THEN 4 ELSE 3 END AS rank
    FROM workspace_access wa
    JOIN brains b ON b.workspace_id = wa.workspace_id AND b.deleted_at IS NULL
  ), effective_access AS (
    SELECT DISTINCT ON (brain_id) brain_id, role
    FROM (
      SELECT * FROM explicit_access
      UNION ALL
      SELECT * FROM inherited_access
    ) access
    ORDER BY brain_id, rank DESC
  )
  SELECT jsonb_build_object(
    'teamRoles', coalesce((
      SELECT jsonb_object_agg(team_id::text, role::text) FROM team_access
    ), '{}'::jsonb),
    'workspaceRoles', coalesce((
      SELECT jsonb_object_agg(workspace_id::text, role::text) FROM workspace_access
    ), '{}'::jsonb),
    'brainRoles', coalesce((
      SELECT jsonb_object_agg(brain_id::text, role::text) FROM effective_access
    ), '{}'::jsonb)
  )
$$;

DROP POLICY IF EXISTS workspaces_select ON workspaces;
DROP POLICY IF EXISTS workspaces_insert ON workspaces;
DROP POLICY IF EXISTS workspaces_update ON workspaces;
DROP POLICY IF EXISTS workspaces_delete ON workspaces;
CREATE POLICY workspaces_select ON workspaces FOR SELECT USING (
  id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
CREATE POLICY workspaces_insert ON workspaces FOR INSERT WITH CHECK (
  owl_can_manage_team(team_id) AND created_by = owl_user_id()
);
CREATE POLICY workspaces_update ON workspaces FOR UPDATE
  USING (owl_can_manage_team(team_id)) WITH CHECK (owl_can_manage_team(team_id));
CREATE POLICY workspaces_delete ON workspaces FOR DELETE USING (owl_is_team_owner(team_id));

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members FORCE ROW LEVEL SECURITY;
CREATE POLICY teams_select ON teams FOR SELECT USING (
  id::text = ANY(string_to_array(coalesce(current_setting('app.team_ids', true), ''), ','))
);
CREATE POLICY teams_insert ON teams FOR INSERT WITH CHECK (
  owl_is_team_owner(id) AND created_by = owl_user_id()
);
CREATE POLICY teams_update ON teams FOR UPDATE
  USING (owl_can_manage_team(id)) WITH CHECK (owl_can_manage_team(id));
CREATE POLICY teams_delete ON teams FOR DELETE USING (owl_is_team_owner(id));
CREATE POLICY team_members_select ON team_members FOR SELECT USING (
  team_id::text = ANY(string_to_array(coalesce(current_setting('app.team_ids', true), ''), ','))
);
CREATE POLICY team_members_insert ON team_members FOR INSERT
  WITH CHECK (owl_can_manage_team(team_id));
CREATE POLICY team_members_update ON team_members FOR UPDATE
  USING (owl_can_manage_team(team_id)) WITH CHECK (owl_can_manage_team(team_id));
CREATE POLICY team_members_delete ON team_members FOR DELETE
  USING (owl_can_manage_team(team_id));

DROP POLICY IF EXISTS audit_member ON audit_events;
CREATE POLICY audit_member ON audit_events USING (
  (brain_id IS NOT NULL AND owl_can_read_brain(brain_id))
  OR (
    brain_id IS NULL AND team_id::text = ANY(
      string_to_array(coalesce(current_setting('app.team_ids', true), ''), ',')
    )
  )
  OR (brain_id IS NULL AND team_id IS NULL AND actor_id = owl_user_id())
) WITH CHECK (actor_id = owl_user_id());

DROP TRIGGER IF EXISTS workspace_members_preserve_owner ON workspace_members;
DROP FUNCTION IF EXISTS owl_preserve_team_owner();
CREATE OR REPLACE FUNCTION owl_preserve_team_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'team_owner_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'team_owner_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER team_members_preserve_owner
BEFORE UPDATE OR DELETE ON team_members
FOR EACH ROW EXECUTE FUNCTION owl_preserve_team_owner();

CREATE POLICY team_invitations_manage ON team_invitations
  USING (owl_can_manage_team(team_id))
  WITH CHECK (owl_can_manage_team(team_id));

DROP FUNCTION IF EXISTS owl_accept_invitation(text, text, text);
DROP POLICY IF EXISTS workspace_members_select ON workspace_members;
DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
DROP POLICY IF EXISTS workspace_members_update ON workspace_members;
DROP POLICY IF EXISTS workspace_members_delete ON workspace_members;
DROP TABLE workspace_members;

CREATE FUNCTION owl_accept_team_invitation(
  supplied_token_hash text,
  supplied_user_id uuid,
  supplied_display_name text,
  supplied_password_hash text
) RETURNS TABLE (user_id uuid, user_email text, team_id uuid, workspace_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite team_invitations%ROWTYPE;
  accepted_user users%ROWTYPE;
  first_workspace_id uuid;
BEGIN
  SELECT * INTO invite FROM team_invitations
  WHERE token_hash = supplied_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO accepted_user FROM users WHERE lower(email) = lower(invite.email);
  IF FOUND THEN
    IF supplied_user_id IS NULL OR accepted_user.id <> supplied_user_id THEN
      RAISE EXCEPTION 'login_required' USING ERRCODE = '28000';
    END IF;
    IF accepted_user.disabled_at IS NOT NULL THEN
      RAISE EXCEPTION 'account_disabled' USING ERRCODE = '28000';
    END IF;
    UPDATE users
    SET email_verified_at = coalesce(email_verified_at, now())
    WHERE id = accepted_user.id;
  ELSE
    IF supplied_user_id IS NOT NULL OR supplied_password_hash IS NULL OR supplied_display_name IS NULL THEN
      RAISE EXCEPTION 'invalid_invitation_account' USING ERRCODE = '22023';
    END IF;
    INSERT INTO users (email, display_name, password_hash, email_verified_at)
    VALUES (invite.email, supplied_display_name, supplied_password_hash, now())
    RETURNING * INTO accepted_user;
  END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (invite.team_id, accepted_user.id, invite.role)
  ON CONFLICT ON CONSTRAINT team_members_pkey DO UPDATE SET role = excluded.role;

  SELECT id INTO first_workspace_id
  FROM workspaces
  WHERE workspaces.team_id = invite.team_id
  ORDER BY created_at, id
  LIMIT 1;

  UPDATE team_invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email, invite.team_id, first_workspace_id;
END $$;

CREATE FUNCTION owl_inspect_team_invitation(supplied_token_hash text)
RETURNS TABLE (team_id uuid, team_name text, invite_email text, invite_role team_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ti.team_id, t.name, ti.email, ti.role
  FROM team_invitations ti
  JOIN teams t ON t.id = ti.team_id
  WHERE ti.token_hash = supplied_token_hash
    AND ti.accepted_at IS NULL
    AND ti.revoked_at IS NULL
    AND ti.expires_at > now()
$$;

GRANT EXECUTE ON FUNCTION owl_can_manage_team(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_is_team_owner(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_accept_team_invitation(text, uuid, text, text) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_inspect_team_invitation(text) TO owl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO owl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members TO owl_app;
