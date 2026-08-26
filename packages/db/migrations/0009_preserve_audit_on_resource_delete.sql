ALTER TABLE audit_events DROP CONSTRAINT audit_events_team_id_fkey;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_workspace_id_fkey;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_brain_id_fkey;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_brain_id_fkey
  FOREIGN KEY (brain_id) REFERENCES brains(id) ON DELETE SET NULL;
