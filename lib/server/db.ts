import { env } from 'cloudflare:workers';
import demoCatalog from '@/data/demo/catalog.json';
import type { BodySizeChart, FitProfile, Outcome, Product } from '@/lib/fit/types';

export function database() {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  return env.DB;
}

// Every personal row is keyed by user_id; the catalog is shared. Keep this in
// step with db/schema.ts and drizzle/0007_v2_fit_first.sql.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS fit_profiles (user_id TEXT PRIMARY KEY, body_json TEXT NOT NULL, references_json TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS fit_outcomes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT, search_id TEXT, brand TEXT NOT NULL, category TEXT NOT NULL, size TEXT NOT NULL, result TEXT NOT NULL, fit TEXT NOT NULL, area TEXT, reason TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS fit_outcomes_user_time_idx ON fit_outcomes(user_id, created_at)',
  'CREATE TABLE IF NOT EXISTS searches (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT, color_name TEXT NOT NULL, features_json TEXT NOT NULL, result_ids_json TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS searches_user_time_idx ON searches(user_id, created_at)',
  'CREATE TABLE IF NOT EXISTS catalog_products (id TEXT PRIMARY KEY, source TEXT NOT NULL, embedder_version TEXT NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS catalog_size_charts (id TEXT PRIMARY KEY, source TEXT NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL)',
];

let ready: Promise<void> | null = null;
export function ensureSchema() {
  ready ??= database().batch(SCHEMA.map(sql => database().prepare(sql))).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export async function upsertCatalog(source: string, products: Product[], charts: BodySizeChart[]) {
  const db = database(); const now = Date.now();
  const statements = [
    ...products.map(p => db.prepare('INSERT INTO catalog_products (id, source, embedder_version, data_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source = excluded.source, embedder_version = excluded.embedder_version, data_json = excluded.data_json, updated_at = excluded.updated_at')
      .bind(p.id, source, p.features?.version || '', JSON.stringify(p), now)),
    ...charts.map(c => db.prepare('INSERT INTO catalog_size_charts (id, source, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source = excluded.source, data_json = excluded.data_json, updated_at = excluded.updated_at')
      .bind(c.id, source, JSON.stringify(c), now)),
  ];
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
}

export async function seedDemoCatalog() {
  const existing = await database().prepare("SELECT COUNT(*) AS count FROM catalog_products WHERE source = 'demo'").first<{ count: number }>();
  if (Number(existing?.count) === demoCatalog.products.length) return;
  await upsertCatalog('demo', demoCatalog.products as unknown as Product[], demoCatalog.sizeCharts as unknown as BodySizeChart[]);
}

export async function loadCatalog(sources: string[]) {
  const db = database(); const marks = sources.map(() => '?').join(',');
  const [products, charts] = await Promise.all([
    db.prepare(`SELECT data_json FROM catalog_products WHERE source IN (${marks})`).bind(...sources).all<{ data_json: string }>(),
    db.prepare(`SELECT data_json FROM catalog_size_charts WHERE source IN (${marks})`).bind(...sources).all<{ data_json: string }>(),
  ]);
  return {
    products: products.results.map(row => JSON.parse(row.data_json) as Product),
    charts: charts.results.map(row => JSON.parse(row.data_json) as BodySizeChart),
  };
}

export async function ensureUser(userId: string) {
  await database().prepare('INSERT INTO users (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(userId, Date.now()).run();
}

export async function loadProfile(userId: string): Promise<FitProfile | null> {
  const row = await database().prepare('SELECT body_json, references_json FROM fit_profiles WHERE user_id = ?').bind(userId).first<{ body_json: string; references_json: string }>();
  return row ? { body: JSON.parse(row.body_json), references: JSON.parse(row.references_json) } : null;
}

export async function saveProfile(userId: string, profile: FitProfile) {
  await database().prepare('INSERT INTO fit_profiles (user_id, body_json, references_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET body_json = excluded.body_json, references_json = excluded.references_json, updated_at = excluded.updated_at')
    .bind(userId, JSON.stringify(profile.body), JSON.stringify(profile.references), Date.now()).run();
}

type OutcomeRow = { id: string; product_id: string | null; brand: string; category: Outcome['category']; size: string; result: Outcome['result']; fit: Outcome['fit']; area: Outcome['area']; reason: Outcome['reason']; created_at: number };
export async function loadOutcomes(userId: string): Promise<Outcome[]> {
  const rows = await database().prepare('SELECT id, product_id, brand, category, size, result, fit, area, reason, created_at FROM fit_outcomes WHERE user_id = ? ORDER BY created_at, id').bind(userId).all<OutcomeRow>();
  return rows.results.map(r => ({ id: r.id, productId: r.product_id, brand: r.brand, category: r.category, size: r.size, result: r.result, fit: r.fit, area: r.area, reason: r.reason, createdAt: r.created_at }));
}

export async function insertOutcome(userId: string, outcome: Outcome, searchId: string | null) {
  await database().prepare('INSERT OR IGNORE INTO fit_outcomes (id, user_id, product_id, search_id, brand, category, size, result, fit, area, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(outcome.id, userId, outcome.productId || null, searchId, outcome.brand, outcome.category, outcome.size, outcome.result, outcome.fit, outcome.area || null, outcome.reason || null, outcome.createdAt).run();
}

export async function deleteOutcome(userId: string, id: string) {
  const result = await database().prepare('DELETE FROM fit_outcomes WHERE user_id = ? AND id = ?').bind(userId, id).run();
  return result.meta.changes > 0;
}

export async function insertSearch(userId: string, search: { id: string; category: string | null; colorName: string; features: unknown; resultIds: string[] }) {
  await database().prepare('INSERT INTO searches (id, user_id, category, color_name, features_json, result_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(search.id, userId, search.category, search.colorName, JSON.stringify(search.features), JSON.stringify(search.resultIds), Date.now()).run();
}

export async function searchBelongsTo(userId: string, searchId: string) {
  return Boolean(await database().prepare('SELECT 1 FROM searches WHERE id = ? AND user_id = ?').bind(searchId, userId).first());
}

export async function deleteUserData(userId: string) {
  const db = database();
  await db.batch(['fit_outcomes', 'searches', 'fit_profiles'].map(table => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)));
}
