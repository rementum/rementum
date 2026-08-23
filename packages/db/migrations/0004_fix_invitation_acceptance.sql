CREATE OR REPLACE FUNCTION owl_accept_invitation(
  supplied_token_hash text,
  supplied_display_name text,
  supplied_password_hash text
) RETURNS TABLE (user_id uuid, user_email text)
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
  IF NOT FOUND THEN
    INSERT INTO users (email, display_name, password_hash)
    VALUES (invite.email, supplied_display_name, supplied_password_hash)
    RETURNING * INTO accepted_user;
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (invite.workspace_id, accepted_user.id, invite.workspace_role)
  ON CONFLICT ON CONSTRAINT workspace_members_pkey DO NOTHING;

  INSERT INTO brain_members (brain_id, user_id, role)
  VALUES (invite.brain_id, accepted_user.id, invite.brain_role)
  ON CONFLICT ON CONSTRAINT brain_members_pkey DO UPDATE SET role = excluded.role;

  UPDATE invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email;
END $$;

GRANT EXECUTE ON FUNCTION owl_accept_invitation(text, text, text) TO owl_app;
