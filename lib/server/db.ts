import { env } from 'cloudflare:workers';
import { emptyQuiz, type Purchase, type Quiz, type Reaction, type TasteState } from '@/lib/taste/types';

export function database() {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  return env.DB;
}

// Personal rows only, keyed by user_id. Product search results are never
// stored (Shopify's catalog terms forbid caching them). Keep in step with
// db/schema.ts and drizzle/0008_v3_taste.sql.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS taste_profiles (user_id TEXT PRIMARY KEY, quiz_json TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, brand TEXT NOT NULL, title TEXT NOT NULL, slot TEXT, size TEXT NOT NULL, status TEXT NOT NULL, return_reason TEXT, price REAL, source TEXT NOT NULL, confidence REAL NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS purchases_user_time_idx ON purchases(user_id, created_at)',
  'CREATE TABLE IF NOT EXISTS reactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, brand TEXT NOT NULL, title TEXT NOT NULL, features_json TEXT NOT NULL, reaction TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS reactions_user_time_idx ON reactions(user_id, created_at)',
];

let ready: Promise<void> | null = null;
export function ensureSchema() {
  ready ??= database().batch(SCHEMA.map(sql => database().prepare(sql))).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export async function ensureUser(userId: string) {
  await database().prepare('INSERT INTO users (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(userId, Date.now()).run();
}

export async function loadState(userId: string): Promise<TasteState & { hasQuiz: boolean }> {
  const db = database();
  const [quiz, purchases, reactions] = await Promise.all([
    db.prepare('SELECT quiz_json FROM taste_profiles WHERE user_id = ?').bind(userId).first<{ quiz_json: string }>(),
    db.prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at, id').bind(userId).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM reactions WHERE user_id = ? ORDER BY created_at, id').bind(userId).all<Record<string, unknown>>(),
  ]);
  return {
    hasQuiz: Boolean(quiz),
    quiz: quiz ? { ...emptyQuiz(), ...JSON.parse(quiz.quiz_json) as Quiz } : emptyQuiz(),
    purchases: purchases.results.map(r => ({ id: String(r.id), brand: String(r.brand), title: String(r.title), slot: (r.slot as Purchase['slot']) ?? null, size: String(r.size),
      status: r.status as Purchase['status'], returnReason: (r.return_reason as Purchase['returnReason']) ?? null, price: r.price as number | null, source: r.source as Purchase['source'],
      confidence: Number(r.confidence), createdAt: Number(r.created_at) })),
    reactions: reactions.results.map(r => ({ id: String(r.id), brand: String(r.brand), title: String(r.title), features: JSON.parse(String(r.features_json)),
      reaction: r.reaction as Reaction['reaction'], reason: (r.reason as Reaction['reason']) ?? null, createdAt: Number(r.created_at) })),
  };
}

export async function saveQuiz(userId: string, quiz: Quiz) {
  await database().prepare('INSERT INTO taste_profiles (user_id, quiz_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET quiz_json = excluded.quiz_json, updated_at = excluded.updated_at')
    .bind(userId, JSON.stringify(quiz), Date.now()).run();
}

export async function upsertPurchase(userId: string, p: Purchase) {
  await database().prepare(`INSERT INTO purchases (id, user_id, brand, title, slot, size, status, return_reason, price, source, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET size = excluded.size, status = excluded.status, return_reason = excluded.return_reason, confidence = excluded.confidence WHERE purchases.user_id = excluded.user_id`)
    .bind(p.id, userId, p.brand, p.title, p.slot, p.size, p.status, p.returnReason ?? null, p.price ?? null, p.source, p.confidence, p.createdAt).run();
}

export async function insertReaction(userId: string, r: Reaction) {
  await database().prepare('INSERT OR IGNORE INTO reactions (id, user_id, brand, title, features_json, reaction, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(r.id, userId, r.brand, r.title, JSON.stringify(r.features), r.reaction, r.reason ?? null, r.createdAt).run();
}

export async function deleteRecord(userId: string, table: 'purchases' | 'reactions', id: string) {
  return (await database().prepare(`DELETE FROM ${table} WHERE user_id = ? AND id = ?`).bind(userId, id).run()).meta.changes > 0;
}

export async function deleteUserData(userId: string) {
  const db = database();
  await db.batch(['purchases', 'reactions', 'taste_profiles'].map(t => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId)));
}
