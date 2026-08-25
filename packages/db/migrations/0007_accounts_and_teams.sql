ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx
  ON auth_tokens(user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role workspace_role NOT NULL CHECK (role IN ('admin', 'member')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_pending_email_uq
  ON team_invitations(workspace_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Brain invitations used workspace membership only as a transport detail before teams inherited
-- brain access. Remove that legacy membership so existing brain guests do not gain the whole team.
DELETE FROM workspace_members wm
USING invitations i, users u
WHERE i.accepted_at IS NOT NULL
  AND i.workspace_id = wm.workspace_id
  AND u.id = wm.user_id
  AND lower(u.email) = lower(i.email)
  AND wm.role = 'member';

CREATE OR REPLACE FUNCTION owl_can_manage_workspace(target_workspace uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_workspace::text = ANY(
    string_to_array(coalesce(current_setting('app.manage_workspace_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_is_workspace_owner(target_workspace uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT target_workspace::text = ANY(
    string_to_array(coalesce(current_setting('app.owner_workspace_ids', true), ''), ',')
  )
$$;

CREATE OR REPLACE FUNCTION owl_actor_context(target_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH explicit_access AS (
    SELECT brain_id,
      role,
      CASE role
        WHEN 'owner' THEN 4 WHEN 'editor' THEN 3 WHEN 'commenter' THEN 2 ELSE 1
      END AS rank
    FROM brain_members
    WHERE user_id = target_user
  ), inherited_access AS (
    SELECT b.id AS brain_id,
      CASE WHEN wm.role IN ('owner', 'admin') THEN 'owner'::brain_role ELSE 'editor'::brain_role END AS role,
      CASE WHEN wm.role IN ('owner', 'admin') THEN 4 ELSE 3 END AS rank
    FROM workspace_members wm
    JOIN brains b ON b.workspace_id = wm.workspace_id AND b.deleted_at IS NULL
    WHERE wm.user_id = target_user
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
    'workspaceRoles', coalesce((
      SELECT jsonb_object_agg(workspace_id::text, role::text)
      FROM workspace_members WHERE user_id = target_user
    ), '{}'::jsonb),
    'brainRoles', coalesce((
      SELECT jsonb_object_agg(brain_id::text, role::text) FROM effective_access
    ), '{}'::jsonb)
  )
$$;

DROP POLICY IF EXISTS workspaces_member ON workspaces;
CREATE POLICY workspaces_select ON workspaces FOR SELECT USING (
  id::text = ANY(string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ','))
);
CREATE POLICY workspaces_insert ON workspaces FOR INSERT WITH CHECK (
  owl_is_workspace_owner(id) AND created_by = owl_user_id()
);
CREATE POLICY workspaces_update ON workspaces FOR UPDATE
  USING (owl_can_manage_workspace(id)) WITH CHECK (owl_can_manage_workspace(id));
CREATE POLICY workspaces_delete ON workspaces FOR DELETE USING (owl_is_workspace_owner(id));

DROP POLICY IF EXISTS workspace_members_visible ON workspace_members;
CREATE POLICY workspace_members_select ON workspace_members FOR SELECT USING (
  workspace_id::text = ANY(
    string_to_array(coalesce(current_setting('app.workspace_ids', true), ''), ',')
  )
);
CREATE POLICY workspace_members_insert ON workspace_members FOR INSERT
  WITH CHECK (owl_can_manage_workspace(workspace_id));
CREATE POLICY workspace_members_update ON workspace_members FOR UPDATE
  USING (owl_can_manage_workspace(workspace_id)) WITH CHECK (owl_can_manage_workspace(workspace_id));
CREATE POLICY workspace_members_delete ON workspace_members FOR DELETE
  USING (owl_can_manage_workspace(workspace_id));

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
DROP TRIGGER IF EXISTS workspace_members_preserve_owner ON workspace_members;
CREATE TRIGGER workspace_members_preserve_owner
BEFORE UPDATE OR DELETE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION owl_preserve_team_owner();

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY team_invitations_manage ON team_invitations
  USING (owl_can_manage_workspace(workspace_id))
  WITH CHECK (owl_can_manage_workspace(workspace_id));

CREATE OR REPLACE FUNCTION owl_accept_team_invitation(
  supplied_token_hash text,
  supplied_user_id uuid,
  supplied_display_name text,
  supplied_password_hash text
) RETURNS TABLE (user_id uuid, user_email text, workspace_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite team_invitations%ROWTYPE;
  accepted_user users%ROWTYPE;
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

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (invite.workspace_id, accepted_user.id, invite.role)
  ON CONFLICT ON CONSTRAINT workspace_members_pkey DO UPDATE SET role = excluded.role;

  UPDATE team_invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email, invite.workspace_id;
END $$;

CREATE OR REPLACE FUNCTION owl_inspect_team_invitation(supplied_token_hash text)
RETURNS TABLE (workspace_id uuid, team_name text, invite_email text, invite_role workspace_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ti.workspace_id, w.name, ti.email, ti.role
  FROM team_invitations ti
  JOIN workspaces w ON w.id = ti.workspace_id
  WHERE ti.token_hash = supplied_token_hash
    AND ti.accepted_at IS NULL
    AND ti.revoked_at IS NULL
    AND ti.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION owl_inspect_brain_invitation(supplied_token_hash text)
RETURNS TABLE (brain_id uuid, brain_name text, invite_email text, invite_role brain_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.brain_id, b.name, i.email, i.brain_role
  FROM invitations i
  JOIN brains b ON b.id = i.brain_id
  WHERE i.token_hash = supplied_token_hash
    AND i.accepted_at IS NULL
    AND i.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION owl_accept_brain_invitation(
  supplied_token_hash text,
  supplied_user_id uuid,
  supplied_display_name text,
  supplied_password_hash text
) RETURNS TABLE (user_id uuid, user_email text, brain_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite invitations%ROWTYPE;
  accepted_user users%ROWTYPE;
BEGIN
  SELECT * INTO invite FROM invitations
  WHERE token_hash = supplied_token_hash
    AND accepted_at IS NULL
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
    UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
    WHERE id = accepted_user.id;
  ELSE
    IF supplied_user_id IS NOT NULL OR supplied_password_hash IS NULL OR supplied_display_name IS NULL THEN
      RAISE EXCEPTION 'invalid_invitation_account' USING ERRCODE = '22023';
    END IF;
    INSERT INTO users (email, display_name, password_hash, email_verified_at)
    VALUES (invite.email, supplied_display_name, supplied_password_hash, now())
    RETURNING * INTO accepted_user;
  END IF;

  INSERT INTO brain_members (brain_id, user_id, role)
  VALUES (invite.brain_id, accepted_user.id, invite.brain_role)
  ON CONFLICT ON CONSTRAINT brain_members_pkey DO UPDATE SET role = excluded.role;

  UPDATE invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email, invite.brain_id;
END $$;

GRANT EXECUTE ON FUNCTION owl_can_manage_workspace(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_is_workspace_owner(uuid) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_accept_team_invitation(text, uuid, text, text) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_inspect_team_invitation(text) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_inspect_brain_invitation(text) TO owl_app;
GRANT EXECUTE ON FUNCTION owl_accept_brain_invitation(text, uuid, text, text) TO owl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO owl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_invitations TO owl_app;
