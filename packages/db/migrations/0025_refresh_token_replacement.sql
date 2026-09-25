-- Links a rotated refresh token to the replacement issued for it. A client that sent a refresh
-- and never read the reply still holds only the old token; while the replacement is unused, the
-- API lets it retry instead of treating the retry as replay and revoking the grant.
ALTER TABLE oauth_records ADD COLUMN IF NOT EXISTS replaced_by text;
