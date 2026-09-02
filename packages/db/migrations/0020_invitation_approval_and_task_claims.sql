-- An invitation proposed by an agent over MCP no longer carries a token: it waits for a brain
-- owner to approve it in the web UI, which is when the token is minted. Until then nothing
-- can accept it, so a prompt-injected agent cannot grant a stranger access on its own.
-- Owners can also revoke an issued invitation instead of waiting for it to expire.
ALTER TABLE invitations ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE invitations ADD COLUMN proposed_by_client text;
ALTER TABLE invitations ADD COLUMN revoked_at timestamptz;

CREATE OR REPLACE FUNCTION owl_inspect_brain_invitation(supplied_token_hash text)
RETURNS TABLE (brain_id uuid, brain_name text, invite_email text, invite_role brain_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.brain_id, b.name, i.email, i.brain_role
  FROM invitations i
  JOIN brains b ON b.id = i.brain_id
  WHERE i.token_hash = supplied_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
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
  ON CONFLICT ON CONSTRAINT brain_members_pkey DO UPDATE SET role = excluded.role
  WHERE brain_members.role <> 'owner';

  UPDATE invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT accepted_user.id, accepted_user.email, invite.brain_id;
END $$;

-- Approving a task must not be done by the client that worked on it. The live claim is
-- cleared on release, so the last claimant is remembered separately.
ALTER TABLE tasks ADD COLUMN last_claimed_by uuid REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN last_claimed_client_id text;
UPDATE tasks SET last_claimed_by = claimed_by, last_claimed_client_id = claimed_client_id
WHERE claimed_by IS NOT NULL;
