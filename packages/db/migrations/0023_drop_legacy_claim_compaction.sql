-- Migration 0022 added a brain-scoped claim overload for the integration suites, but
-- CREATE OR REPLACE cannot change a signature, so it created a second function beside
-- the original two-argument one instead of replacing it. Because the new overload's
-- target_brain defaults to NULL, a two-argument call matches both functions and
-- Postgres refuses to choose ("function owl_worker_claim_compaction is not unique"),
-- which failed every worker pass and stalled all compaction. The scoped function is a
-- strict superset of the original (target_brain NULL claims the oldest available job
-- instance-wide, exactly what the legacy function did), so the legacy overload is
-- dropped and the worker's two-argument call resolves through the default again.
DROP FUNCTION owl_worker_claim_compaction(text, integer);
