import { env } from 'cloudflare:workers';

export const SESSION_ID = 'angie-v1';
export const FREEZE_ID = 'angie-v1-questionnaire-v1';

function database() {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  return env.DB;
}

export async function ensureSchema() {
  const db = database();
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, participant_name TEXT NOT NULL, stage TEXT NOT NULL DEFAULT \'questions\', started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS answers (session_id TEXT NOT NULL, question_id TEXT NOT NULL, answer TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (session_id, question_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS answers_session_idx ON answers(session_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS blind_ratings (session_id TEXT NOT NULL, candidate_id TEXT NOT NULL, rating TEXT NOT NULL, reason TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (session_id, candidate_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS blind_ratings_session_idx ON blind_ratings(session_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS events_session_time_idx ON events(session_id, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ranking_freezes (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, version TEXT NOT NULL, created_at INTEGER NOT NULL, answers_json TEXT NOT NULL, baseline_json TEXT NOT NULL, adjusted_json TEXT NOT NULL, audit_json TEXT NOT NULL, integrity_hash TEXT NOT NULL, blind_labels_seen INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS stylist_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, request TEXT NOT NULL, look_id TEXT NOT NULL, reaction TEXT NOT NULL, item_ids_json TEXT NOT NULL, target_item_ids_json TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS stylist_feedback_session_time_idx ON stylist_feedback(session_id, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS inspiration_recommendations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, storage_key TEXT NOT NULL, image_type TEXT NOT NULL, image_hash TEXT NOT NULL, note TEXT, style_brief_json TEXT NOT NULL, edits_json TEXT NOT NULL, sources_json TEXT NOT NULL, model TEXT NOT NULL, search_mode TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS inspiration_recommendations_session_time_idx ON inspiration_recommendations(session_id, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS inspiration_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, recommendation_id TEXT NOT NULL, edit_id TEXT NOT NULL, reaction TEXT NOT NULL, target_item_ids_json TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS inspiration_feedback_session_recommendation_time_idx ON inspiration_feedback(session_id, recommendation_id, created_at)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS inspiration_feedback_once_idx ON inspiration_feedback(session_id, recommendation_id, edit_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS preference_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, recommendation_id TEXT NOT NULL, feature_type TEXT NOT NULL, feature_value TEXT NOT NULL, weight_delta REAL NOT NULL, reaction TEXT NOT NULL, target_item_id TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS preference_signals_session_feature_idx ON preference_signals(session_id, feature_type, feature_value)'),
    db.prepare('CREATE TABLE IF NOT EXISTS recommendation_candidates (session_id TEXT NOT NULL, recommendation_id TEXT NOT NULL, catalog_id TEXT NOT NULL, product_snapshot_json TEXT NOT NULL, score_breakdown_json TEXT NOT NULL, vetoes_json TEXT NOT NULL, score REAL NOT NULL, shown INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (session_id, recommendation_id, catalog_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS recommendation_candidates_session_time_idx ON recommendation_candidates(session_id, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS outcome_events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, recommendation_id TEXT NOT NULL, edit_id TEXT, catalog_id TEXT NOT NULL, event_type TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS outcome_events_session_catalog_time_idx ON outcome_events(session_id, catalog_id, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS evaluation_runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, pipeline_version TEXT NOT NULL, fixture_version TEXT NOT NULL, metrics_json TEXT NOT NULL, passed INTEGER NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS evaluation_runs_session_time_idx ON evaluation_runs(session_id, created_at)'),
  ]);
}

export async function ensureSession(sessionId = SESSION_ID, participantName = 'Angie') {
  const now = Date.now();
  await database().prepare(
    'INSERT INTO sessions (id, participant_name, stage, started_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
  ).bind(sessionId, participantName, 'questions', now, now).run();
}

export async function recordEvent(type: string, payload?: unknown, sessionId = SESSION_ID) {
  await database().prepare(
    'INSERT INTO events (session_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
  ).bind(sessionId, type, payload === undefined ? null : JSON.stringify(payload), Date.now()).run();
}

export { database };
