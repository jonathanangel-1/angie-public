CREATE TABLE IF NOT EXISTS recommendation_candidates (
  session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  product_snapshot_json TEXT NOT NULL,
  score_breakdown_json TEXT NOT NULL,
  vetoes_json TEXT NOT NULL,
  score REAL NOT NULL,
  shown INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, recommendation_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS recommendation_candidates_session_time_idx ON recommendation_candidates(session_id, created_at);

CREATE TABLE IF NOT EXISTS outcome_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  edit_id TEXT,
  catalog_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outcome_events_session_catalog_time_idx ON outcome_events(session_id, catalog_id, created_at);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  fixture_version TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  passed INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluation_runs_session_time_idx ON evaluation_runs(session_id, created_at);
