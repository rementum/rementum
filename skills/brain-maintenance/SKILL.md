---
name: brain-maintenance
description: Review Rementum maintenance candidates and stage safe splits, merges, deprecations, or freshness updates.
---

# Maintain a brain

1. Call `scan_brain`, then `list_maintenance_candidates`.
2. Work one candidate cluster at a time. Read every involved article and its current version.
3. For stale knowledge, verify against an authoritative source before calling `verify_article`.
4. For duplicates, preserve distinct claims and provenance in one canonical article; stage updates
   before changing links or archiving anything.
5. For oversized articles, split by subject, not arbitrary length. Add explicit links between the
   resulting articles and update the routing summaries.
6. For potential contradictions, describe both claims and ask the user which is current unless a
   source clearly resolves it.
7. Never auto-promote maintenance. Return staged write ids and a concise review report.
