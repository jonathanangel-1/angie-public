import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

// Runs the original HTTP routes against local D1. No provider credentials.
// Stop the interactive demo first: Vinext allows one dev server per checkout.
const base = 'http://127.0.0.1:4185';
const runtime = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const child = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--port', '4185', '--strictPort'], {
  env: { ...runtime, PUBLIC_DEMO: '1', INSPIRATION_MODE: 'live', WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', chunk => { log = (log + chunk).slice(-12000); });
child.stderr.on('data', chunk => { log = (log + chunk).slice(-12000); });
let started = false;
try {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Demo server exited with ${child.exitCode}`);
    try { if ((await fetch(base + '/api/access', { signal: AbortSignal.timeout(3000) })).ok) { started = true; break; } } catch { /* compile startup */ }
    await delay(500);
  }
  assert.ok(started, 'Demo server must become ready');
  const request = async (path, { cookie = '', body, form, status = 200 } = {}) => {
    const response = await fetch(base + path, { method: body || form ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: form || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
  assert.equal((await fetch(base)).status, 200);
  await request('/api/inspiration/memory', { status: 401 });
  await request('/api/access', { body: { code: 'wrong' }, status: 401 });
  const participant = await request('/api/access', { body: { code: 'demo-participant' } });
  const admin = await request('/api/access', { body: { code: 'demo-admin' } });
  assert.equal(participant.data.role, 'participant');
  assert.equal(admin.data.role, 'admin');
  await request('/api/inspiration/evals', { cookie: participant.cookie, status: 401 });
  const baseline = (await request('/api/inspiration/evals', { cookie: admin.cookie })).data;
  const before = (await request('/api/inspiration/memory', { cookie: participant.cookie })).data;
  assert.equal(before.mode, 'test', 'Demo must override inherited live learning mode');
  const form = new FormData();
  form.set('note', 'White tee for a polished everyday outfit');
  form.set('sessionId', 'angie-personal-attempt');
  const rec = (await request('/api/inspiration', { cookie: participant.cookie, form })).data;
  assert.equal(rec.memory.mode, 'test');
  assert.match(rec.model, /synthetic-demo-adapter/);
  assert.equal(rec.imageUrl, '');
  assert.ok(rec.edits[0].items.length > 0);
  const edit = rec.edits[0], item = edit.items[0];
  assert.match(item.catalogId, /^demo-product-/);
  const reaction = { recommendationId: rec.id, editId: edit.id, reaction: 'love', confirmed: true };
  await request('/api/inspiration/feedback', { cookie: participant.cookie, body: { ...reaction, confirmed: false }, status: 400 });
  const saved = (await request('/api/inspiration/feedback', { cookie: participant.cookie, body: reaction })).data;
  assert.equal(saved.memory.feedbackCount, before.feedbackCount + 1);
  const retry = (await request('/api/inspiration/feedback', { cookie: participant.cookie, body: reaction })).data;
  assert.equal(retry.alreadySaved, true);
  assert.equal(retry.memory.feedbackCount, saved.memory.feedbackCount, 'A retry must not learn twice');
  const outcome = { recommendationId: rec.id, editId: edit.id, catalogId: item.catalogId, eventType: 'tried', size: 'M', fit: 'fits' };
  await request('/api/inspiration/outcomes', { cookie: participant.cookie, body: { ...outcome, catalogId: 'unshown-product' }, status: 404 });
  const fit = (await request('/api/inspiration/outcomes', { cookie: participant.cookie, body: outcome })).data;
  assert.equal(fit.guidance.recommendedSize, 'M');
  assert.equal(fit.guidance.sizeConfidence, 'High');
  const history = (await request('/api/inspiration/history', { cookie: participant.cookie })).data;
  const reopened = history.recommendations.find(row => row.id === rec.id);
  assert.ok(reopened, 'A saved recommendation must reopen from D1');
  assert.equal(reopened.confirmedFeedback[edit.id].reaction, 'love');
  const purchases = (await request('/api/inspiration/outcomes', { cookie: participant.cookie })).data;
  assert.ok(purchases.purchases.some(row => row.recommendationId === rec.id && row.fit === 'fits'));
  const after = (await request('/api/inspiration/evals', { cookie: admin.cookie })).data;
  assert.deepEqual(after, baseline, 'QA feedback and outcomes must not change the participant baseline');
  console.log('PASS: actual HTTP access → recommendation → explicit feedback → retry → tried size → saved history; baseline unchanged');
} catch (error) {
  console.error(log);
  throw error;
} finally {
  if (child.exitCode === null) {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
    await Promise.race([once(child, 'exit'), delay(3000)]);
    if (child.exitCode === null) {
      try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
    }
  }
}
