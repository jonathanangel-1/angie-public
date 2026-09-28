// End-to-end HTTP check against the real routes and local D1, in a throwaway
// state directory. Phase 1: the fictional demo flow. Phase 2: private mode,
// wired to a local stub standing in for the garment service and the Shopify
// catalog, so the test never calls a third party.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 4185, STUB = 4186;
const BASE = `http://127.0.0.1:${PORT}`;
const state = mkdtempSync(join(tmpdir(), 'angie-e2e-'));

async function withServer(env: Record<string, string>, run: () => Promise<void>) {
  const keep = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
  const childEnv: Record<string, string> = { ...keep, ...env, ANGIE_STATE_DIR: state, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
  const child = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--port', String(PORT), '--strictPort'], { env: childEnv as unknown as NodeJS.ProcessEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', c => { log = (log + c).slice(-8000); });
  child.stderr.on('data', c => { log = (log + c).slice(-8000); });
  try {
    for (let i = 0; i < 240; i++) {
      if (child.exitCode !== null) throw new Error(`server exited: ${log}`);
      try { if ((await fetch(`${BASE}/api/access`, { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* starting */ }
      await delay(500);
    }
    await run();
  } catch (error) { console.error(log); throw error; }
  finally { try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* stopped */ } await delay(1000); }
}

let cookie = '';
async function call<T = Record<string, unknown>>(path: string, { method = 'GET', json, form, status = 200 }: { method?: string; json?: unknown; form?: FormData; status?: number } = {}): Promise<T> {
  const response = await fetch(BASE + path, { method: form || json !== undefined ? (method === 'GET' ? 'POST' : method) : method, headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data).slice(0, 400)}`);
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return data as T;
}
const photo = (path: string, type = 'image/png') => { const f = new FormData(); f.set('image', new File([readFileSync(path)], 'look', { type })); return f; };
type Item = { id: string; title: string; brand: string; size: { size: string | null; confidence: string; note: string }; risk: number };
type Look = { pieces: Array<{ garment: { id: string; slot: string }; results: Item[]; candidates: unknown[]; excluded: Array<{ title: string; reason: string }> }>; provider: string };
type Summary = { quiz: { sizes: Record<string, string> }; purchases: Array<{ id: string; title: string; status: string; returnReason: string | null }>; reactions: unknown[]; dislikes: Array<{ feature: string }> };

await withServer({ PUBLIC_DEMO: '1' }, async () => {
  await call('/api/taste', { status: 401 });
  await call('/api/access', { json: { code: 'demo-participant' } });
  const summary = await call<Summary>('/api/demo/reset', { method: 'POST' });
  assert.equal(summary.quiz.sizes.bottom, '8');

  await call('/api/look', { form: photo('public/demo/quiz/q-wide-navy.svg', 'image/png'), status: 422 });
  const look = await call<Look>('/api/look', { form: photo('public/demo/looks/look-01-city.png') });
  assert.match(look.provider, /mock/);
  assert.deepEqual(look.pieces.map(p => p.garment.slot), ['outerwear', 'top', 'pants']);
  const pants = look.pieces.find(p => p.garment.slot === 'pants')!;
  const harbor = pants.results.find(r => r.title.startsWith('Harbor'))!;
  assert.equal(harbor.size.size, '8');
  assert.deepEqual(pants.excluded.map(e => e.reason).sort(), ['brand you avoid', 'never wear: low rise']);

  const emails = readdirSync('public/demo/emails').sort().map(f => readFileSync(`public/demo/emails/${f}`, 'utf8'));
  const preview = await call<{ candidates: Array<{ id: string; title: string }> }>('/api/emails/preview', { json: { emails } });
  const imported = await call<{ imported: number; summary: Summary }>('/api/emails/import', { json: { purchases: preview.candidates } });
  assert.equal(imported.imported, preview.candidates.length);
  assert.equal(imported.summary.purchases.find(p => p.title.startsWith('Harbor'))!.returnReason, 'too-small');

  const reranked = await call<{ pieces: Array<{ garmentId: string; ranked: Item[] }> }>('/api/rank', { json: { pieces: look.pieces.map(p => ({ garment: p.garment, candidates: p.candidates })) } });
  const after = reranked.pieces.find(p => p.garmentId === pants.garment.id)!.ranked.find(r => r.title.startsWith('Harbor'))!;
  assert.equal(after.size.size, '10', 'a "too small" return from email moves Northfield up a size');
  assert.match(after.size.note, /returned 8/);

  const jacket = look.pieces.find(p => p.garment.slot === 'outerwear')!;
  const moto = jacket.candidates.find((c: unknown) => (c as Item).title === 'Moto Leather Jacket') as Item;
  const liked = await call<Summary>('/api/feedback', { json: { garment: jacket.garment, candidate: moto, action: 'no', reason: 'color' } });
  assert.equal(liked.reactions.length, 1);
  await call('/api/feedback', { json: { garment: jacket.garment, candidate: moto, action: 'returned', size: 'M' }, status: 400 });
  await call('/api/feedback', { json: { garment: jacket.garment, candidate: moto, action: 'bought', size: 'M' } });
  const returned = await call<Summary>('/api/feedback', { json: { garment: jacket.garment, candidate: moto, action: 'returned', size: 'M', reason: 'too-large' } });
  const record = returned.purchases.find(p => p.title === 'Moto Leather Jacket')!;
  assert.deepEqual([record.status, record.returnReason], ['returned', 'too-large']);
  const undone = await call<Summary>(`/api/records?type=purchase&id=${encodeURIComponent(record.id)}`, { method: 'DELETE' });
  assert.ok(!undone.purchases.some(p => p.title === 'Moto Leather Jacket'));
  console.log('PASS demo: look → 3 pieces → sized matches, filters applied → email import → size 8 → 10 → feedback → undo');
});

// Stub for the garment service and the Shopify Global Catalog (fictional data).
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/understand') return res.end(JSON.stringify({ garments: [{ id: 'g0-skirt', slot: 'skirt', attributes: { type: 'midi skirt', color: 'green', pattern: 'solid', fabric: 'satin', vibe: 'elegant' }, query: 'green midi skirt women', crop: 'data:image/jpeg;base64,AAAA', embedding: [0.1, 0.2] }] }));
    if (req.url === '/similarity') return res.end(JSON.stringify({ scores: JSON.parse(body).urls.map((_: string, i: number) => 0.75 - i * 0.1) }));
    const catalog = JSON.parse(body).params.arguments.catalog;
    const product = (id: string, title: string) => ({ id, title, media: [{ type: 'image', url: `https://cdn.example.com/${id}.jpg` }], options: [{ name: 'Size', values: [{ label: 'S' }, { label: 'M' }] }],
      variants: [{ url: `https://shop.example.com/products/${id}`, price: { amount: 9500, currency: 'USD' }, seller: { name: 'Fictional Store' } }] });
    res.end(JSON.stringify({ result: { structuredContent: { products: 'like' in catalog ? [product('p1', 'Satin Midi Skirt'), product('p2', 'Satin Hair Scarf')] : [product('p3', 'Pleated Midi Skirt')] } } }));
  });
}).listen(STUB);

await withServer({ PUBLIC_DEMO: '0', ANGIE_ACCESS_CODE: 'e2e-private-code', GARMENT_SERVICE_URL: `http://127.0.0.1:${STUB}`, SHOPIFY_CATALOG_URL: `http://127.0.0.1:${STUB}/catalog` }, async () => {
  cookie = '';
  await call('/api/access', { json: { code: 'demo-participant' }, status: 401 });
  await call('/api/access', { json: { code: 'e2e-private-code' } });
  const empty = await call<Summary & { hasQuiz: boolean; demo: boolean }>('/api/taste');
  assert.deepEqual([empty.hasQuiz, empty.demo, empty.purchases.length], [false, false, 0], 'real users never see demo data');
  await call('/api/taste', { method: 'PUT', json: { sizes: { bottom: 'S' }, neverWear: [], brandsLove: [], brandsAvoid: [], imageReactions: {}, fit: {} } });
  const look = await call<Look>('/api/look', { form: photo('public/demo/looks/look-03-office.png') });
  assert.equal(look.provider, 'open-models-sidecar');
  const results = look.pieces[0].results;
  assert.deepEqual(results.map(r => r.title), ['Satin Midi Skirt', 'Pleated Midi Skirt'], 'the scarf is filtered; image hits lead');
  assert.equal(results[0].size.size, 'S');
  console.log('PASS private: demo code refused → empty profile → quiz → garment service + Shopify catalog (stubbed) → sized matches');
});

stub.close();
rmSync(state, { recursive: true, force: true });
