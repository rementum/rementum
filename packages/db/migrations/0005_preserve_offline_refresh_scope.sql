UPDATE oauth_records
SET payload = jsonb_set(
  payload,
  '{scope}',
  to_jsonb(trim((payload->>'scope') || ' offline_access'))
)
WHERE model = 'RefreshToken'
  AND jsonb_typeof(payload->'scope') = 'string'
  AND NOT ('offline_access' = ANY(regexp_split_to_array(payload->>'scope', '\s+')));
