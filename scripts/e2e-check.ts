// End-to-end HTTP check against the real routes and local D1, in a throwaway
// state directory. Phase 1: the fictional demo flow. Phase 2: a configured
// user with an imported catalog, and demo access switched off.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PNG } from 'pngjs';
import { describeImage } from '../lib/match/embedding';
import { importCatalog } from './import-catalog';

const PORT = 4185;
const BASE = `http://127.0.0.1:${PORT}`;
const state = mkdtempSync(join(tmpdir(), 'angie-e2e-'));
const inspiration = (file: string) => {
  const png = PNG.sync.read(readFileSync(`public/demo/inspiration/${file}`));
  return describeImage({ width: png.width, height: png.height, data: png.data });
};

async function withServer(env: Record<string, string>, run: () => Promise<void>) {
  const keep = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
  const childEnv: Record<string, string> = { ...keep, ...env, ANGIE_STATE_DIR: state, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
  const child = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--port', String(PORT), '--strictPort'], {
    env: childEnv as unknown as NodeJS.ProcessEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', c => { log = (log + c).slice(-8000); });
  child.stderr.on('data', c => { log = (log + c).slice(-8000); });
  try {
    for (let i = 0; i < 240; i++) {
      if (child.exitCode !== null) throw new Error(`server exited: ${log}`);
      try { if ((await fetch(`${BASE}/api/access`, { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* still starting */ }
      await delay(500);
    }
    await run();
  } catch (error) { console.error(log); throw error; }
  finally {
    try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already stopped */ }
    await delay(1000);
  }
}

let cookie = '';
async function call<T = Record<string, unknown>>(path: string, { method = 'GET', json, status = 200 }: { method?: string; json?: unknown; status?: number } = {}): Promise<T> {
  const response = await fetch(BASE + path, { method, headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: json === undefined ? undefined : JSON.stringify(json) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return data as T;
}
type Result = { product: { id: string; brand: string; category: string }; fit: { size: string | null; confidence: string; note: string }; similarity: { total: number } };
type Search = { searchId: string; query: { category: string; colorName: string }; results: Result[] };

await withServer({ PUBLIC_DEMO: '1' }, async () => {
  await call('/api/profile', { status: 401 });
  await call('/api/access', { method: 'POST', json: { code: 'nope' }, status: 401 });
  await call('/api/access', { method: 'POST', json: { code: 'demo-participant' } });
  const profile = await call<{ demo: boolean; body: { hips: number }; outcomes: unknown[] }>('/api/demo/reset', { method: 'POST' });
  assert.equal(profile.demo, true);
  assert.equal(profile.body.hips, 40.5);

  const features = inspiration('inspiration-01-navy-wide-leg.png');
  const search = await call<Search>('/api/search', { method: 'POST', json: { features, category: 'auto' } });
  assert.equal(search.query.category, 'bottom');
  assert.equal(search.query.colorName, 'navy');
  assert.ok(['nf-navy-wide-leg', 'jv-navy-wide-leg'].includes(search.results[0].product.id));
  const harbor = search.results.find(r => r.product.id === 'nf-navy-wide-leg')!;
  assert.equal(harbor.fit.size, '8');
  assert.equal(harbor.fit.confidence, 'medium');

  await call('/api/outcomes', { method: 'POST', json: { productId: 'nf-navy-wide-leg', brand: 'x', category: 'bottom', size: 'XL', result: 'returned', fit: 'too-small' }, status: 400 });
  await call('/api/search', { method: 'POST', json: { features: { ...features, version: 'other' } }, status: 400 });
  const logged = await call<{ outcome: { id: string; brand: string }; changed: Array<{ text: string }>; recommendation: { before: { size: string }; after: { size: string } } }>('/api/outcomes', {
    method: 'POST', json: { productId: 'nf-navy-wide-leg', brand: 'ignored', category: 'bottom', size: '8', result: 'returned', fit: 'too-small', area: 'hips', searchId: search.searchId },
  });
  assert.equal(logged.outcome.brand, 'Northfield Studio', 'brand comes from the catalog, not the client');
  assert.match(logged.changed[0].text, /Northfield Studio bottoms: treat your hips as \+1 in/);
  assert.equal(logged.recommendation.before.size, '8');
  assert.equal(logged.recommendation.after.size, '10');

  const again = await call<Search>('/api/search', { method: 'POST', json: { features, category: 'auto', searchId: search.searchId } });
  assert.equal(again.results.find(r => r.product.id === 'nf-navy-wide-leg')!.fit.size, '10');
  assert.equal(again.results.find(r => r.product.id === 'nf-blue-straight-jean')!.fit.size, '10', 'a sibling Northfield bottom updates too');

  await call('/api/outcomes', { method: 'POST', json: { brand: 'Juniper & Vale', category: 'dress', size: 'M', result: 'kept', fit: 'fits' } });
  const undone = await call<{ profile: { adjustments: Array<{ brand: string }> } }>(`/api/outcomes?id=${logged.outcome.id}`, { method: 'DELETE' });
  assert.ok(!undone.profile.adjustments.some(a => a.brand === 'Northfield Studio'), 'undo replays the log without that return');
  await call('/api/catalog', { method: 'POST', json: { products: [] }, status: 403 });
  console.log('PASS demo: upload → ranked matches with sizes → return logged → brand size moves 8 → 10 → undo');
});

await withServer({ PUBLIC_DEMO: '0', ANGIE_ACCESS_CODE: 'e2e-private-code' }, async () => {
  cookie = '';
  await call('/api/access', { method: 'POST', json: { code: 'demo-participant' }, status: 401 });
  await call('/api/access', { method: 'POST', json: { code: 'e2e-private-code' } });
  const empty = await call<{ userId: string; demo: boolean; outcomes: unknown[]; productCount: number }>('/api/profile');
  assert.equal(empty.userId, 'angie');
  assert.equal(empty.demo, false);
  assert.equal(empty.outcomes.length, 0, 'real users never see demo data');
  assert.equal(empty.productCount, 0);
  const features = inspiration('inspiration-01-navy-wide-leg.png');
  await call('/api/search', { method: 'POST', json: { features }, status: 400 });
  await call('/api/profile', { method: 'PUT', json: { body: { bust: 300 } }, status: 400 });
  await call('/api/profile', { method: 'PUT', json: { body: { bust: 34, waist: 28.5, hips: 39 } } });
  const imported = await importCatalog('examples/catalog.example.json', BASE, 'e2e-private-code');
  assert.equal(imported.imported, 2);
  const search = await call<Search>('/api/search', { method: 'POST', json: { features } });
  assert.equal(search.results[0].product.id, 'example-navy-wide-leg');
  assert.equal(search.results[0].fit.size, 'M');
  console.log('PASS private: demo code refused → empty profile → measurements → catalog import → matched and sized');
});

rmSync(state, { recursive: true, force: true });
