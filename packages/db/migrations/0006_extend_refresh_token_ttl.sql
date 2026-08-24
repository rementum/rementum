UPDATE oauth_records
SET expires_at = greatest(expires_at, now() + interval '60 days')
WHERE model = 'RefreshToken'
  AND expires_at IS NOT NULL;
