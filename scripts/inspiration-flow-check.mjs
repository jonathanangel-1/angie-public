// Offline regression checks: real component handlers, routes, SQL and ranking.
// No network requests, production writes or API credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import { inheritStableVisualEvidence } from './catalog-evidence.mjs';

const require = createRequire(import.meta.url);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function load(path, dependencies, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(source, {
    exports: loadedModule.exports, module: loadedModule, require: (name) => name in dependencies ? dependencies[name] : name === 'cloudflare:workers' ? { env: {} } : name.startsWith('@/data/') && name.endsWith('.json') ? require('../' + name.slice(2)) : (name.startsWith('@/lib/') || name.startsWith('@/data/') && !name.endsWith('.json')) ? load(name.slice(2) + '.ts', dependencies, globals) : require(name),
    process: { env: {} }, Error, TypeError, RangeError, Request, Response, FormData, File, TextEncoder, TextDecoder, URL, crypto, console, setTimeout, clearTimeout, btoa, atob, AbortController, AbortSignal,
    ...globals,
  }, { filename: path });
  return loadedModule.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const { SearchBudget } = load('lib/search-budget.ts', {});
const budgetRequest = { method: 'POST', body: JSON.stringify({ model: 'gpt-5.4-mini-2026-03-17', tools: [{ type: 'web_search' }], max_tool_calls: 2, max_output_tokens: 4500 }) };
const budgetProbe = new SearchBudget({ maxUsd: 1, transport: async () => Response.json({ usage: { input_tokens: 1000, output_tokens: 100 }, output: [{ type: 'web_search_call' }] }) });
await budgetProbe.fetch('test')('https://api.openai.com/v1/responses', budgetRequest);
check('mini search reservation uses mini rates without flagship long-context surcharge', () => {
  assert.equal(budgetProbe.snapshot().calls, 1);
  assert.equal(budgetProbe.snapshot().reservedUsd, 0);
  assert.ok(budgetProbe.snapshot().estimatedUsd < 0.02);
});
let releaseBudget;
const heldBudget = new SearchBudget({ maxUsd: 1, transport: () => new Promise(resolve => { releaseBudget = () => resolve(Response.json({ usage: { input_tokens: 1000, output_tokens: 100 }, output: [] })); }) });
const heldRequest = heldBudget.fetch('first')('https://api.openai.com/v1/responses', budgetRequest);
await assert.rejects(heldBudget.fetch('second')('https://api.openai.com/v1/responses', budgetRequest), /Search budget/);
releaseBudget(); await heldRequest;
check('concurrent reservations cannot spend the same allowance twice', () => assert.equal(heldBudget.snapshot().calls, 1));
const tinyBudget = new SearchBudget({ maxUsd: 0.01, transport: () => { throw new Error('must not send'); } });
await assert.rejects(tinyBudget.fetch('test')('https://api.openai.com/v1/responses', budgetRequest), /Search budget/);
check('spending ceiling still blocks unaffordable calls before transport', () => assert.equal(tinyBudget.snapshot().calls, 0));
const emptyMemory = { mode: 'personal', feedbackCount: 0, signalCount: 0, likes: [], avoidances: [], recentNotes: [] };
check('explicit text preferences survive medium-confidence grounding without weakening image rules',()=>{
  const evidence=load('lib/garment-evidence.ts',{});
  const garment={category:'top',details:[],evidence:{colorFamily:{value:'white',confidence:'medium'},neckline:{value:'v',confidence:'medium'},sleeve:{value:'three-quarter',confidence:'medium'}},visibility:{neckline:'clear',sleeveEnds:'clear',hem:'hidden'}};
  assert.equal(evidence.groundedGarment(garment,false).colorFamily,'white');
  assert.equal(evidence.groundedGarment(garment,false).neckline,'v');
  assert.equal(evidence.groundedGarment(garment,true).colorFamily,'unknown');
});
check('catalog refresh preserves matching private captures without requiring AI enrichment', () => {
  const fresh = { id: 'same', imageSourceUrl: 'https://example.com/white.jpg', attributes: {} };
  const prior = { ...fresh, privateImageEvidence: { sourceUrl: fresh.imageSourceUrl, dataUrl: 'capture' } };
  assert.equal(inheritStableVisualEvidence(fresh, new Map([['same', prior]])).privateImageEvidence.dataUrl, 'capture');
  assert.equal(inheritStableVisualEvidence({ ...fresh, imageSourceUrl: 'https://example.com/black.jpg' }, new Map([['same', prior]])).privateImageEvidence, undefined);
});
const edits = [1, 2, 3].map((n) => ({
  id: `edit-${n}`, label: ['BEST MATCH', 'LOW-RISK', 'CONTROLLED STRETCH'][n - 1],
  title: `Option ${n}`, story: 'A white tee.', finish: '', baseMatchScore: 75, matchScore: 75,
  confidence: 'Moderate', learningAdjustment: 0,
  items: [{ id: `item-${n}`, slot: 'T-shirt', name: `Test tee ${n}`, brand: 'Aritzia', color: 'White',
    catalogId: `fixture-${n}`,
    attributes: [{ type: 'fit', value: 'relaxed' }, { type: 'silhouette', value: 'relaxed' }, { type: 'category', value: 'top' }, { type: 'subtype', value: 'tee' }, { type: 'color_family', value: 'white' }],
    officialUrl: `https://www.aritzia.com/us/en/product/test-tee/${1000 + n}.html`, imageUrl: '', price: '',
    recommendedSize: 'XS–S', sizeConfidence: 'Moderate', why: 'Relaxed fit', fitWatch: 'Check length',
  }],
}));
const fixture = { id: 'offline-test', imageUrl: '', brief: { title: 'White tees', observed: 'Your request', preserve: [], adapt: [] }, edits, memory: emptyMemory };

// The hooks harness exercises the actual component event handlers and rendered props.
// It is not a substitute for a visual browser check.
let hooks = [], cursor = 0, tree, calls = [], failSave = false, feedbackCount = 0;
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
  },
  useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
  useEffect() {},
};
const jsx = (type, props) => ({ type, props });
const { default: Component } = load('components/InspirationExperience.tsx', {
  react, 'react/jsx-runtime': { jsx, jsxs: jsx },
}, { window: { scrollTo() {} }, fetch: async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('/feedback')) {
    if (failSave) return Response.json({ error: 'Try again' }, { status: 503 });
    feedbackCount++;
    return Response.json({ memory: { ...emptyMemory, feedbackCount } });
  }
  return Response.json(fixture);
} });
function render() { cursor = 0; tree = Component({ role: 'participant' }); return tree; }
function nodes(node = tree) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
  return [node, ...nodes(node.props?.children ?? null)];
}
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function button(label) { const found = nodes().find((node) => node.type === 'button' && text(node).replace(/^＋/, '') === label); assert.ok(found, label); return found; }
async function click(label) { assert.ok(!button(label).props.disabled, `${label} is enabled`); await button(label).props.onClick(); render(); }
function feedbackCalls() { return calls.filter((call) => call.url.endsWith('/feedback')); }
render();
check('empty request disabled; compact one-line text input', () => {
  assert.equal(button('Find items').props.disabled, true);
  assert.equal(nodes().find((node) => node.type === 'textarea').props.rows, 1);
});
nodes().find((node) => node.type === 'textarea').props.onChange({ target: { value: 'A relaxed white T-shirt' } });
render(); await click('Find items');
check('text-only request sends no image and renders no broken inspiration', () => {
  assert.equal(calls[0].options.body.get('image'), null);
  assert.equal(calls[0].options.body.get('note'), 'A relaxed white T-shirt');
  assert.equal(nodes().filter((node) => node.type === 'img').length, 0);
});
await click('Love'); await click('No');
check('selection can change; neither tap submits', () => {
  assert.equal(feedbackCalls().length, 0);
  assert.equal(button('No').props['aria-pressed'], true);
  assert.equal(button('Love').props['aria-pressed'], false);
});
await click('Cancel');
check('cancel discards selection', () => assert.equal(button('No').props['aria-pressed'], false));
await click('Almost');
check('Almost needs a target before confirming', () => assert.equal(button('Confirm Almost').props.disabled, true));
await click('T-shirt');
nodes().find((node) => node.type === 'textarea').props.onChange({ target: { value: 'Too loose' } });
render();
failSave = true; await click('Confirm Almost');
check('failed save stays on the same option with selection and note intact', () => {
  assert.ok(text(tree).includes('Option 1'));
  assert.equal(button('Almost').props['aria-pressed'], true);
  assert.equal(nodes().find((node) => node.type === 'textarea').props.value, 'Too loose');
});
failSave = false;
const confirm = button('Confirm Almost').props.onClick;
await Promise.all([confirm(), confirm()]); render();
check('confirmed feedback submits once, with target and note, then returns home', () => {
  assert.equal(feedbackCalls().length, 2); // One failed attempt + one successful save.
  assert.deepEqual(JSON.parse(feedbackCalls()[1].options.body), {
    recommendationId: 'offline-test', editId: 'edit-1', reaction: 'close', confirmed: true,
    targetItemIds: ['item-1'], note: 'Too loose',
  });
  assert.ok(button('Find items'));
});
await click('Saved looks');
await nodes().find(node=>node.props?.['aria-label']==='Open saved look 1').props.onClick(); render();
await click('Next option');
function pointer(x) { return { clientX: x, pointerId: 1, button: 0, isPrimary: true, target: { closest: () => null }, currentTarget: { setPointerCapture() {} } }; }
function swipe(from, to, cancel = false) {
  const card = nodes().find((node) => node.props?.onPointerDown);
  card.props.onPointerDown(pointer(from)); card.props.onPointerMove(pointer(to));
  if (cancel) card.props.onPointerCancel(); else card.props.onPointerUp(pointer(to));
  render();
}
swipe(200, 320, true);
check('cancelled pointer gesture does not select or submit', () => assert.equal(button('Love').props['aria-pressed'], false));
swipe(200, 320);
check('right swipe only selects Love', () => {
  assert.equal(button('Love').props['aria-pressed'], true); assert.equal(feedbackCalls().length, 2);
});
swipe(200, 80);
check('left swipe can change selection to No without saving', () => assert.equal(button('No').props['aria-pressed'], true));
await click('Confirm No');
await click('Saved looks'); await nodes().find(node=>node.props?.['aria-label']==='Open saved look 1').props.onClick(); render();
await click('Next option'); await click('Next option'); await click('Love'); await click('Confirm Love');
check('last confirmation returns directly home with clean inputs', () => {
  assert.ok(button('Choose image')); assert.equal(button('Find items').props.disabled, true);
  assert.ok(text(tree).includes('Feedback saved.'));
  assert.equal(nodes().find((node) => node.type === 'textarea').props.value, '');
  assert.equal(feedbackCount, 3);
  assert.ok(!text(tree).includes('reactions'));
});

// Exercise the real route and real learning SQL using an isolated in-memory database.
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE inspiration_recommendations (id TEXT, session_id TEXT, edits_json TEXT, storage_key TEXT, image_type TEXT, image_hash TEXT, note TEXT, style_brief_json TEXT, sources_json TEXT, model TEXT, search_mode TEXT, created_at INTEGER);
CREATE TABLE inspiration_feedback (id INTEGER PRIMARY KEY, session_id TEXT, recommendation_id TEXT, edit_id TEXT, reaction TEXT, target_item_ids_json TEXT, note TEXT, created_at INTEGER, UNIQUE(session_id,recommendation_id,edit_id));
CREATE TABLE preference_signals (session_id TEXT, recommendation_id TEXT, feature_type TEXT, feature_value TEXT, weight_delta REAL, reaction TEXT, target_item_id TEXT, created_at INTEGER);
CREATE TABLE recommendation_candidates (session_id TEXT, recommendation_id TEXT, catalog_id TEXT, product_snapshot_json TEXT, score_breakdown_json TEXT, vetoes_json TEXT, score REAL, shown INTEGER, created_at INTEGER, PRIMARY KEY(session_id,recommendation_id,catalog_id));
CREATE TABLE outcome_events (id INTEGER PRIMARY KEY, session_id TEXT, recommendation_id TEXT, edit_id TEXT, catalog_id TEXT, event_type TEXT, reason TEXT, created_at INTEGER);`);
sql.prepare('INSERT INTO inspiration_recommendations (id,session_id,edits_json) VALUES (?,?,?)').run(fixture.id, 'angie-v1', JSON.stringify(edits));
const database = {
  prepare(query) {
    let bindings = [];
    const statement = {
      bind(...values) { bindings = values; return statement; },
      async first() { return sql.prepare(query).get(...bindings) ?? null; },
      async all() { return { results: sql.prepare(query).all(...bindings) }; },
      async run() { const result = sql.prepare(query).run(...bindings); return { ...result, meta: { changes: result.changes } }; },
    };
    return statement;
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const events = [];
const persistence = { database: () => database, SESSION_ID: 'angie-v1', ensureSchema: async () => {}, ensureSession: async () => {}, recordEvent: async (...args) => { events.push(args); } };
const scopeEnvironment = { INSPIRATION_MODE: 'live' };
const auth = {
  getAccessRole: (request) => ({ yes: 'participant', admin: 'admin' })[request.headers.get('x-test-auth')] ?? null,
  requireRole: (request, roles) => roles.includes(auth.getAccessRole(request)),
};
const scopes = load('lib/inspiration-scope.ts', {
  'cloudflare:workers': { env: scopeEnvironment }, '@/lib/auth': auth, '@/lib/persistence': persistence,
});
const requestAs = (role) => new Request('http://offline.test/?sessionId=angie-v1&mode=personal', { headers: { 'x-test-auth': role, 'x-session-id': 'angie-v1' } });
check('only authenticated live participant access can select Angie memory', () => {
  assert.equal(scopes.inspirationScope(requestAs('yes')).sessionId, 'angie-v1');
  assert.equal(scopes.inspirationScope(requestAs('admin')).sessionId, 'angie-qa-v1');
  assert.equal(scopes.inspirationScope(requestAs('unknown')), null);
});
check('local and unset modes fail closed into QA despite client session overrides', () => {
  scopeEnvironment.INSPIRATION_MODE = 'test';
  assert.equal(scopes.inspirationScope(requestAs('yes')).mode, 'test');
  delete scopeEnvironment.INSPIRATION_MODE;
  assert.equal(scopes.inspirationScope(requestAs('yes')).sessionId, 'angie-qa-v1');
  scopeEnvironment.INSPIRATION_MODE = 'live';
});
const learning = load('lib/inspiration-learning.ts', { '@/lib/persistence': persistence });
const feedback = load('app/api/inspiration/feedback/route.ts', {
  '@/lib/persistence': persistence, '@/lib/inspiration-learning': learning,
  '@/lib/inspiration-scope': scopes,
});
const body = { recommendationId: fixture.id, editId: 'edit-1', reaction: 'close', targetItemIds: ['item-1'], note: 'Too loose', confirmed: true };
const post = (value, authenticated = true, role = 'yes') => feedback.POST(new Request('http://offline.test/api/inspiration/feedback', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'x-test-auth': role } : {}) }, body: JSON.stringify(value),
}));
assert.equal((await post(body, false)).status, 401);
checks++; console.log('PASS unauthenticated feedback rejected');
assert.equal((await post({ ...body, confirmed: false })).status, 400);
assert.equal((await learning.getInspirationMemory('angie-v1')).feedbackCount, 0);
checks++; console.log('PASS unconfirmed feedback leaves SQL memory untouched');
assert.equal((await post({ ...body, targetItemIds: ['unknown'] })).status, 400);
assert.equal((await post(body)).status, 200);
const learned = await learning.getInspirationMemory('angie-v1');
check('confirmation persists negative signals and item-specific comment context', () => {
  assert.equal(learned.feedbackCount, 1);
  assert.ok(learned.avoidances.some((item) => item.type === 'product' && item.value === 'fixture-1'));
  assert.ok(!learned.avoidances.some((item) => item.type === 'top:tee:silhouette'), 'Too loose is fit feedback, not a ban on relaxed cuts');
  assert.ok(!learned.avoidances.some((item) => item.type.includes('color') || item.type === 'category'));
  assert.ok(learned.recentNotes[0].context.includes('Test tee 1'));
  assert.equal(learned.recentNotes[0].note, 'Too loose');
});
assert.equal((await post(body)).status, 200);
assert.equal((await post({ ...body, reaction: 'love' })).status, 409);
assert.deepEqual(plain(await learning.getInspirationMemory('angie-v1')), plain(learned));
checks++; console.log('PASS retry is idempotent and conflicting resubmission cannot change the result');
assert.equal((await post({ ...body, editId: 'edit-2', reaction: 'love', targetItemIds: [], note: '' })).status, 200);
const angieBeforeQa = plain(await learning.getInspirationMemory('angie-v1'));
assert.equal((await post({ ...body, sessionId: 'angie-v1' }, true, 'admin')).status, 404);
sql.prepare('INSERT INTO inspiration_recommendations (id,session_id,edits_json,storage_key) VALUES (?,?,?,?)')
  .run('qa-recommendation', 'angie-qa-v1', JSON.stringify(edits), 'qa-image');
assert.equal((await post({ ...body, recommendationId: 'qa-recommendation' })).status, 404);
assert.equal((await post({ ...body, recommendationId: 'qa-recommendation', sessionId: 'angie-v1' }, true, 'admin')).status, 200);
assert.deepEqual(plain(await learning.getInspirationMemory('angie-v1')), angieBeforeQa);
assert.equal((await learning.getInspirationMemory('angie-qa-v1')).feedbackCount, 1);
checks++; console.log('PASS cross-profile feedback rejected; admin feedback cannot change Angie memory');
check('feedback audit records server-side role, mode, session and explicit confirmation', () => {
  const [type, payload, sessionId] = events.at(-1);
  assert.equal(type, 'inspiration_feedback');
  assert.equal(payload.actorRole, 'admin'); assert.equal(payload.mode, 'test');
  assert.equal(payload.confirmed, true); assert.equal(sessionId, 'angie-qa-v1');
});
const memoryRoute = load('app/api/inspiration/memory/route.ts', { '@/lib/inspiration-scope': scopes, '@/lib/persistence': persistence, '@/lib/inspiration-learning': learning });
assert.equal((await (await memoryRoute.GET(requestAs('yes'))).json()).mode, 'personal');
assert.equal((await (await memoryRoute.GET(requestAs('admin'))).json()).mode, 'test');
checks++; console.log('PASS memory endpoint returns only the authenticated profile');
const imageRoute = load('app/api/inspiration/image/route.ts', {
  '@/lib/inspiration-scope': scopes, '@/lib/persistence': persistence,
  '@/lib/inspiration-storage': { inspirationBucket: () => ({ get: async () => ({ body: 'image', httpEtag: 'test', writeHttpMetadata() {} }) }) },
});
assert.equal((await imageRoute.GET(new Request('http://offline.test/?id=qa-recommendation', { headers: { 'x-test-auth': 'yes' } }))).status, 404);
checks++; console.log('PASS participant cannot access QA inspiration images');
const evalRoute = load('app/api/inspiration/evals/route.ts', { '@/lib/auth': auth, '@/lib/persistence': persistence, '@/lib/inspiration-learning': learning, '@/data/verified-catalog.json': { __esModule: true, default: { version: 'test-v1', generatedAt: new Date().toISOString(), productCount: 1, retailer: 'Test', products: [{ canonicalUrl: 'https://www.aritzia.com/us/en/product/test/1.html', imageUrl: '/catalog/test.jpg', category: 'top' }] } } });
assert.equal((await evalRoute.GET(requestAs('yes'))).status, 401);
const personalEvals = await (await evalRoute.GET(requestAs('admin'))).json();
assert.equal(personalEvals.feedbackCount, angieBeforeQa.feedbackCount);
assert.equal(personalEvals.recommendationCount, 1);
checks++; console.log('PASS administrator evals exclude QA recommendations, reactions and signals');
const strongerMemory = { ...emptyMemory, feedbackCount: 8, likes: [{ type: 'fit', value: 'relaxed', weight: 2 }] };
check('confirmed preference evidence changes future scores, within its safety cap', () => {
  assert.ok(learning.applyLearnedPreferences(edits, strongerMemory)[0].matchScore > edits[0].baseMatchScore);
  assert.ok(learning.applyLearnedPreferences(edits, strongerMemory)[0].learningAdjustment <= 8);
});

let aiBodies = [];
const { angieProfile } = load('data/angie-profile.ts', {});
const ai = load('lib/inspiration-interpreter.ts', { 'cloudflare:workers': { env: { OPENAI_API_KEY: 'offline-test-only' } }, '@/data/angie-profile': { angieProfile } }, {
  process: { env: {} }, fetch: async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body);
      aiBodies.push(body);
      const whole = body.input[0].content.length > 1;
      const result = { brief: fixture.brief, intent: { scope: whole ? 'whole-look' : 'single-item', requestedCategory: whole ? null : 'top', requestedSubtype: whole ? null : 'tee', occasion: 'casual', palette: ['white'], silhouettes: ['relaxed'], avoid: [], keywords: ['t-shirt'], garments: [{ slot: 'top', category: 'top', subtype: 'tee', colorFamily: 'white', silhouette: 'relaxed', length: 'regular', rise: null, neckline: 'crew', sleeve: 'short', material: 'cotton', details: [], importance: 5 }] } };
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
    }
    return new Response('', { status: 404 });
  },
});
await ai.interpretInspiration('', null, 'A relaxed white T-shirt', learned);
await ai.interpretInspiration('image/jpeg', new Uint8Array([1, 2, 3]).buffer, '', learned);
check('garment subtype fixes an inconsistent model category without changing its outfit role', () => {
  assert.equal(ai.normalizeGarmentCategory({slot:'layer',category:'top',subtype:'coat'}).category,'layer');
  assert.equal(ai.normalizeGarmentCategory({slot:'layer',category:'layer',subtype:'knit'}).category,'top');
  assert.equal(ai.normalizeGarmentCategory({slot:'layer',category:'layer',subtype:'knit'}).slot,'layer');
});
check('interpreter sees text/image and cannot search or create products', () => {
  assert.equal(aiBodies[0].input[0].content.length, 1);
  assert.equal(aiBodies[1].input[0].content[1].type, 'input_image');
  assert.equal(aiBodies[0].tools, undefined);
  assert.equal(aiBodies[0].text.format.schema.properties.intent.properties.requestedCategory.enum.includes('top'), true);
  assert.equal(aiBodies[0].text.format.schema.properties.intent.properties.requestedSubtype.enum.includes('tee'), true);
  assert.equal(aiBodies[0].text.format.schema.properties.intent.properties.garments.items.properties.silhouette.type, 'string');
  const prompt = aiBodies[0].input[0].content[0].text;
  assert.ok(prompt.includes('There is no image'));
  assert.ok(prompt.includes('Do not name, search for, or invent any retailer, product'));
  assert.ok(prompt.includes('Too loose'));
});
let visualBody; const visualBodies = [];
const visualMatcher = load('lib/visual-matcher.ts', {
  'cloudflare:workers': { env: { OPENAI_API_KEY: 'offline-test-only' } },
  '@/lib/inspiration-types': {}, '@/lib/inspiration-engine': { MIN_VISUAL_SCORE: 65 },
}, {
  process: { env: {} }, fetch: async (url, options) => {
    if (url.startsWith('https://blocked.example/')) return new Response('forbidden', { status: 403 });
    if (url.startsWith('https://example.com/')) return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    visualBody = JSON.parse(options.body);
    visualBodies.push(visualBody);
    const matches = visualBody.input[0].content.filter((part) => part.type === 'input_text' && part.text.startsWith('Candidate ')).map((part, index) => {
      const [, candidateId, targetSlot] = part.text.match(/^Candidate ([^;]+); target=([^;]+);/);
      return { candidateId, targetSlot, score: 80 - index, reason: 'Same cut; minor fabric difference', hardConflict: false, observedSilhouette: 'straight', observedLength: 'full', observedColorFamily: 'black' };
    });
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ matches }) }] }] });
  },
});
const matcherIntent = { scope: 'single-item', requestedCategory: 'bottom', requestedSubtype: 'trouser', occasion: 'polished', palette: ['black'], silhouettes: ['straight'], avoid: [], keywords: [], garments: [{ slot: 'bottom', category: 'bottom', subtype: 'trouser', colorFamily: 'black', silhouette: 'straight', length: 'full', rise: 'high', neckline: null, sleeve: null, material: null, details: [], importance: 5 }] };
const visualRank = await visualMatcher.rankVisualCandidates('image/jpeg', new Uint8Array([1, 2, 3]).buffer, matcherIntent, [
  { id: 'candidate-a', targetSlot: 'bottom', retailer: 'Aritzia', name: 'A', color: 'Black', imageSourceUrl: 'https://example.com/a.jpg', metadata: 'straight' },
  { id: 'candidate-placeholder', targetSlot: 'bottom', retailer: 'Aritzia', name: 'Blank', color: 'Black', imageSourceUrl: 'https://assets.aritzia.com/image/upload/f7f7f7', metadata: 'blank' },
  { id: 'candidate-blocked', targetSlot: 'bottom', retailer: 'Aritzia', name: 'Blocked', color: 'Black', imageSourceUrl: 'https://blocked.example/bad.jpg', metadata: 'straight', retrievalScore: 50 },
  { id: 'candidate-b', targetSlot: 'bottom', retailer: 'Massimo Dutti', name: 'B', color: 'Black', imageSourceUrl: 'https://example.com/b.jpg', metadata: 'straight' },
]);
check('visual matcher compares the inspiration to every usable private retailer image', () => {
  assert.equal(visualRank.matches.length, 2);
  assert.equal(visualBody.input[0].content.filter((part) => part.type === 'input_image').length, 3);
  assert.ok(visualBody.input[0].content.filter((part) => part.type === 'input_image').every((part) => String(part.image_url).startsWith('data:image/')));
  assert.ok(visualBody.input[0].content[0].text.includes('visual fidelity only'));
  assert.ok(!JSON.stringify(visualBody).includes('candidate-placeholder'));
  assert.ok(!JSON.stringify(visualBody).includes('candidate-blocked'));
});
const tournamentCandidates = Array.from({ length: 27 }, (_, index) => ({ id: `tournament-${index}`, targetSlot: 'bottom', retailer: index % 2 ? 'Aritzia' : 'Massimo Dutti', name: `Trouser ${index}`, color: 'Black', imageSourceUrl: `https://example.com/${index}.jpg`, metadata: 'straight', retrievalScore: 90 - index }));
const cachedImage = 'data:image/jpeg;base64,/9j/2Q==';
const capturedRank = await visualMatcher.rankVisualCandidates('image/jpeg', new Uint8Array([1, 2, 3]).buffer, matcherIntent, [
  { id: 'browser-capture', targetSlot: 'bottom', retailer: 'Aritzia', name: 'Captured trouser', color: 'Black', imageSourceUrl: 'https://blocked.example/captured.jpg', imageDataUrl: cachedImage, metadata: 'straight', retrievalScore: 90 },
]);
check('private browser capture reaches visual judging despite blocked retailer URL', () => {
  assert.equal(capturedRank.matches.length, 1);
  assert.equal(capturedRank.matches[0].candidateId, 'browser-capture');
  assert.ok(visualBody.input[0].content.some((part) => part.type === 'input_image' && part.image_url === cachedImage));
});
const tournamentStart = visualBodies.length;
const tournament = await visualMatcher.rankVisualCandidates('image/jpeg', new Uint8Array([1, 2, 3]).buffer, matcherIntent, tournamentCandidates);
check('visual tournament screens the full pool before a calibrated final', () => {
  const calls = visualBodies.slice(tournamentStart);
  const screenedIds = new Set(calls.slice(0, -1).flatMap((body) => body.input[0].content.filter((part) => part.type === 'input_text' && part.text.startsWith('Candidate ')).map((part) => part.text.match(/^Candidate ([^;]+)/)[1])));
  assert.equal(screenedIds.size, tournamentCandidates.length);
  assert.ok(calls.length >= 3);
  assert.equal(tournament.matches.length, 6, 'Only independently reviewed finalists can be recommended');
  assert.equal(calls.at(-1).model, 'gpt-5.4-2026-03-05');
});
const actualCatalog = JSON.parse(readFileSync(new URL('../data/verified-catalog.json', import.meta.url), 'utf8'));
actualCatalog.products.forEach((product, index) => { product.canonicalUrl = `https://www.aritzia.com/us/en/product/public-fixture/${999000 + index}.html`; });
actualCatalog.products[0].privateImageEvidence = { sourceUrl: actualCatalog.products[0].imageSourceUrl, dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString('base64') };
const styleEmbedding = load('lib/style-embedding.ts', { '@/lib/inspiration-types': {} });
const fitTaxonomy = load('lib/catalog-taxonomy.ts', { '@/lib/inspiration-types': {} });
const fitModule = load('lib/product-fit.ts', {
  '@/data/purchase-evidence.json': {__esModule:true,default:JSON.parse(readFileSync(new URL('../data/purchase-evidence.json',import.meta.url)))},
  '@/lib/catalog-taxonomy': fitTaxonomy,
});
const savedLooksModule=load('lib/saved-looks.ts',{'@/lib/product-fit':fitModule,'@/lib/catalog-taxonomy':fitTaxonomy});
const engine = load('lib/inspiration-engine.ts', {
  '@/lib/product-fit': fitModule,
  '@/data/verified-catalog.json': { __esModule: true, default: actualCatalog },
  '@/lib/inspiration-types': {},
  '@/lib/catalog-taxonomy': load('lib/catalog-taxonomy.ts', { '@/lib/inspiration-types': {} }),
  '@/lib/style-embedding': styleEmbedding,
});
const trouserGarment = { slot: 'bottom', category: 'bottom', subtype: 'trouser', colorFamily: 'black', silhouette: 'straight', length: 'full', rise: 'high', neckline: null, sleeve: null, material: 'tailoring', details: [], importance: 5 };
const trouserIntent = { scope: 'single-item', requestedCategory: 'bottom', requestedSubtype: 'trouser', occasion: 'polished', palette: ['black'], silhouettes: ['straight'], avoid: ['low rise', 'baggy'], keywords: ['trouser'], garments: [trouserGarment] };
const catalogResult = engine.buildCatalogRecommendations(trouserIntent, fixture.brief, emptyMemory);
const privateCandidates = engine.prepareVisualCandidates(trouserIntent, emptyMemory);
check('visual retrieval has distinct private image evidence and never exposes it as UI imagery', () => {
  assert.ok(privateCandidates.length >= 2);
  assert.equal(new Set(privateCandidates.map((candidate) => candidate.imageSourceUrl)).size, privateCandidates.length);
  assert.ok(privateCandidates.every((candidate) => /^https:\/\//.test(candidate.imageSourceUrl) && !candidate.imageSourceUrl.includes('/f7f7f7')));
  assert.ok(privateCandidates.every((candidate) => Number.isFinite(candidate.retrievalScore)));
});
const eligibleIds = new Set(catalogResult.edits.flatMap(edit => edit.items.map(item => item.catalogId)));
const visualWinner = privateCandidates.find(candidate => eligibleIds.has(candidate.id));
assert.ok(visualWinner, 'visual-winner fixture must independently pass product constraints');
const winnerProduct = actualCatalog.products.find(p => p.id === visualWinner.id);
check('same-name colour products cannot crowd an entire visual shortlist', () => {
  const pool = Array.from({ length: 8 }, (_, i) => ({ ...winnerProduct, id: `colour-${i}`, masterProductId: `different-${i}`, name: 'Same trouser style' }));
  const candidates = engine.prepareVisualCandidates(trouserIntent, emptyMemory, pool, undefined, 10);
  assert.equal(candidates.length, 2);
});
check('judged rejections survive the audit cap ahead of unexamined catalog rows', () => {
  const pool = Array.from({ length: 100 }, (_, i) => ({ ...winnerProduct, id: `audit-${i}`, name: `Trouser ${i}` }));
  const result = engine.buildCatalogRecommendations(trouserIntent, fixture.brief, emptyMemory, [
    { candidateId: 'audit-0', targetSlot: 'bottom', score: 90, reason: 'close' },
    { candidateId: 'audit-99', targetSlot: 'bottom', score: 10, reason: 'visually rejected', hardConflict: true },
  ], pool);
  assert.ok(result.audits.some(a => a.catalogId === 'audit-99' && a.vetoes.length));
});
const visuallyRanked = engine.buildCatalogRecommendations(trouserIntent, fixture.brief, emptyMemory, privateCandidates.map((candidate) => ({ candidateId: candidate.id, targetSlot: candidate.targetSlot, score: candidate.id === visualWinner.id ? 100 : 0, reason: candidate.id === visualWinner.id ? 'Closest visible cut and proportions' : 'Different visible cut and proportions' })));
check('private visual similarity changes the winner while product photos stay out of the response', () => {
  assert.equal(visuallyRanked.edits[0].items[0].catalogId, visualWinner.id);
  assert.ok(visuallyRanked.edits.flatMap((edit) => edit.items).every((item) => item.imageUrl === ''));
});
check('recommendations contain only verified catalog products and exact stored URLs', () => {
  const catalogById = new Map(actualCatalog.products.map((product) => [product.id, product]));
  assert.ok(catalogResult.edits.length >= 1 && catalogResult.edits.length <= 3);
  for (const item of catalogResult.edits.flatMap((edit) => edit.items)) {
    assert.equal(item.sourceStatus, 'catalog-verified');
    assert.equal(item.officialUrl, catalogById.get(item.catalogId).canonicalUrl);
    assert.equal(item.imageUrl, '', 'private comparison imagery does not enter the recommendation payload');
  }
});
check('hard trouser vetoes cannot enter the three results', () => {
  const shown = new Set(catalogResult.edits.flatMap((edit) => edit.items.map((item) => item.catalogId)));
  const vetoed = catalogResult.audits.filter((audit) => audit.category === 'bottom' && audit.vetoes.length > 0);
  assert.ok(vetoed.length > 0);
  assert.ok(vetoed.every((audit) => !shown.has(audit.catalogId)));
});
check('a trouser request cannot return jeans, skirts or other bottoms', () => {
  for (const item of catalogResult.edits.flatMap((edit) => edit.items)) {
    assert.equal(item.attributes.find((attribute) => attribute.type === 'subtype')?.value, 'trouser');
  }
});
const teeGarment = { slot: 'top', category: 'top', subtype: 'tee', colorFamily: 'white', silhouette: 'controlled', length: 'regular', rise: null, neckline: 'crew', sleeve: 'short', material: 'cotton', details: [], importance: 5 };
const teeResult = engine.buildCatalogRecommendations({ scope: 'single-item', requestedCategory: 'top', requestedSubtype: 'tee', occasion: 'casual', palette: ['white'], silhouettes: ['controlled'], avoid: ['cropped'], keywords: ['t-shirt'], garments: [teeGarment] }, fixture.brief, emptyMemory);
check('a white T-shirt request cannot return a cami, tube top, knit or shirt', () => {
  for (const item of teeResult.edits.flatMap((edit) => edit.items)) {
    assert.equal(item.attributes.find((attribute) => attribute.type === 'subtype')?.value, 'tee');
    assert.equal(item.attributes.find((attribute) => attribute.type === 'color_family')?.value, 'white');
  }
});
check('alternatives never duplicate a catalog product', () => {
  const ids = catalogResult.edits.flatMap((edit) => edit.items.map((item) => item.catalogId));
  assert.equal(new Set(ids).size, ids.length);
});
const polishedGarments = [
  { slot: 'top', category: 'top', subtype: 'cami', colorFamily: 'black', silhouette: 'fitted', length: 'waist', rise: null, neckline: 'square', sleeve: 'sleeveless', material: null, details: [], importance: 5 },
  trouserGarment,
  { slot: 'shoes', category: 'shoes', subtype: 'heel', colorFamily: 'black', silhouette: 'elegant', length: 'small heel', rise: null, neckline: null, sleeve: null, material: 'leather', details: [], importance: 3 },
];
const monochromeIntent = { scope: 'whole-look', requestedCategory: null, requestedSubtype: null, occasion: 'polished', palette: ['black'], silhouettes: ['fitted', 'straight'], avoid: ['baggy'], keywords: ['minimal'], garments: polishedGarments };
const monochromeResult = engine.buildCatalogRecommendations(monochromeIntent, fixture.brief, emptyMemory);
check('a monochrome inspiration cannot be filled with unrelated colors', () => {
  for (const item of monochromeResult.edits.flatMap((edit) => edit.items)) {
    assert.equal(item.attributes.find((attribute) => attribute.type === 'color_family')?.value, 'black');
  }
});
check('polished whole looks use a heel when a verified one is available', () => {
  for (const edit of monochromeResult.edits) {
    const shoe = edit.items.find((item) => item.attributes.some((attribute) => attribute.type === 'category' && attribute.value === 'shoes'));
    if (shoe) assert.equal(shoe.attributes.find((attribute) => attribute.type === 'subtype')?.value, 'heel');
  }
});
const partialResult = engine.buildCatalogRecommendations({ ...monochromeIntent, garments: [teeGarment, { slot: 'shoes', category: 'shoes', subtype: 'boot', colorFamily: 'black', silhouette: 'fitted', length: 'knee', rise: null, neckline: null, sleeve: null, material: 'leather', details: [], importance: 4 }] }, fixture.brief, emptyMemory, [], actualCatalog.products.filter(p=>p.category!=='shoes'));
check('unsupported whole-look pieces are named as missing instead of replaced or failing the request', () => {
  assert.ok(partialResult.edits.length > 0);
  assert.ok(partialResult.edits.every((edit) => edit.missingSlots.includes('boots')));
  assert.ok(partialResult.edits.every((edit) => edit.items.every((item) => item.attributes.find((attribute) => attribute.type === 'subtype')?.value !== 'boot')));
});
check('match scores no longer saturate at 99', () => assert.ok(monochromeResult.edits.every((edit) => edit.matchScore <= 88)));
check('poor visual matches are rejected even when they are the best available', () => {
  assert.throws(() => engine.buildCatalogRecommendations(trouserIntent, fixture.brief, emptyMemory, privateCandidates.map((c) => ({ candidateId: c.id, targetSlot: c.targetSlot, score: 30, reason: 'Different proportions' }))), /No verified/);
});
const visualTeeIntent = { scope: 'single-item', requestedCategory: 'top', requestedSubtype: 'tee', occasion: 'casual', palette: ['white'], silhouettes: ['controlled'], avoid: [], keywords: ['t-shirt'], garments: [teeGarment] };
const sourceTee = actualCatalog.products.find((p) => p.subtype === 'tee' && p.imageSourceUrl);
check('a black-top cream-bottom inspiration cannot become all cream', () => {
  const contrast = { ...visualTeeIntent, scope: 'whole-look', garments: [{ ...teeGarment, colorFamily: 'black' }, { ...teeGarment, slot: 'bottom', category: 'bottom', subtype: 'skirt', colorFamily: 'cream' }] };
  const light = { ...sourceTee, attributes: { ...sourceTee.attributes, publicDescription: '', colorFamily: 'cream' } };
  assert.throws(() => engine.buildCatalogRecommendations(contrast, fixture.brief, emptyMemory, [{ candidateId: light.id, targetSlot: 'top', score: 80, observedColorFamily: 'cream', reason: 'Similar cut' }], [light]), /No verified/);
});
check('a cached wrong colour cannot suppress the requested colour variant', () => {
  const dark = { ...sourceTee, id: 'dark-variant', masterProductId: 'same-style', color: 'Black', attributes: { ...sourceTee.attributes, colorFamily: 'black' }, privateImageEvidence: { sourceUrl: sourceTee.imageSourceUrl, dataUrl: cachedImage } };
  const white = { ...sourceTee, id: 'white-variant', masterProductId: 'same-style', color: 'White', attributes: { ...sourceTee.attributes, colorFamily: 'white' } };
  assert.equal(engine.prepareVisualCandidates(visualTeeIntent, emptyMemory, [dark, white]).length, 2);
});
check('a high aggregate score cannot hide a major torso-ease mismatch', () => {
  assert.throws(() => engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory,
    [{ candidateId: sourceTee.id, targetSlot: 'top', score: 90, majorProportionMismatch: true, reason: 'Clings instead of skimming' }], [sourceTee]), /No verified/);
});
check('retailer body-hugging evidence overrides an optimistic image score', () => {
  const snug = { ...sourceTee, attributes: { ...sourceTee.attributes, publicDescription: 'Fabric shapes to the body for a hug-like feel.' } };
  assert.throws(() => engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory,
    [{ candidateId: snug.id, targetSlot: 'top', score: 95, observedSilhouette: 'fitted', reason: 'Similar white tee' }], [snug]), /No verified/);
});
check('body-hugging and fitted are not identical retrieval features', () => {
  const base = { category: 'top', subtype: 'tee', name: 'Tee', color: 'white', attributes: { silhouette: 'fitted' } };
  const fitted = { ...teeGarment, silhouette: 'fitted' };
  assert.ok(styleEmbedding.styleSimilarity(base, fitted) > styleEmbedding.styleSimilarity({ ...base, attributes: { silhouette: 'body-hugging' } }, fitted));
});
check('not bodycon is a negation, never permission for a tight stretch tee', () => {
  const snug={...sourceTee,attributes:{...sourceTee.attributes,publicDescription:'Fabric shapes to the body for a hug-like feel.'}};
  for (const detail of ['close but not bodycon','close through torso without looking bodycon','not visibly compressive or second-skin']) {
    const intent={...visualTeeIntent,garments:[{...teeGarment,details:[detail]}]};
    assert.throws(()=>engine.buildCatalogRecommendations(intent,fixture.brief,emptyMemory,[{candidateId:snug.id,targetSlot:'top',score:95,reason:'Optimistic image score'}],[snug]),/No verified/);
  }
});
check('plural retailer footwear names retain their shopping category', () => {
  for(const name of ['Leather riding boots','Soft leather ballerinas','Strappy mid-heel sandals','Soft leather trainers']) assert.equal(fitTaxonomy.inferTaxonomy(name).category,'shoes');
  assert.equal(fitTaxonomy.inferTaxonomy('Short sleeve T-shirt').subtype,'tee');
});
check('historical sizing is style specific and live tried sizes update it',()=>{
  const pant={...sourceTee,id:'fit-test',name:'Straight tailored trousers',retailer:'Demo Atelier',category:'bottom',subtype:'trouser',masterProductId:'',attributes:{}};
  assert.equal(fitModule.productFit(pant).size,'8');
  const memory={...emptyMemory,fitOutcomes:[{catalogId:'fit-test',size:'10',fit:'fits',createdAt:1}]};
  assert.equal(fitModule.productFit(pant,memory).size,'10');
  assert.equal(fitModule.productFit(pant,memory).confidence,'High');
  assert.equal(fitModule.productFit(pant,{...emptyMemory,fitOutcomes:[{catalogId:'fit-test',size:'8',fit:'fits',createdAt:1},{catalogId:'fit-test',size:'10',fit:'too-large',createdAt:2}]}).size,'8');
  assert.equal(fitModule.productFit({...pant,id:'shoe-test',name:'Unknown boot',category:'shoes',subtype:'boot'}).size,'Check size chart');
});
check('a tied sweater uses knitwear inventory without replacing the base tee', () => {
  const sweater = actualCatalog.products.find(p => p.subtype === 'knit' && p.imageSourceUrl);
  const intent = { ...visualTeeIntent, scope: 'whole-look', garments: [teeGarment, { ...teeGarment, slot: 'layer', category: 'top', subtype: 'knit' }] };
  const candidates = engine.prepareVisualCandidates(intent, emptyMemory, [sourceTee, sweater]);
  assert.equal(candidates.find(c => c.id === sweater.id).targetSlot, 'layer');
  assert.equal(candidates.find(c => c.id === sourceTee.id).targetSlot, 'top');
  const result = engine.buildCatalogRecommendations(intent, fixture.brief, emptyMemory, candidates.map(c => ({ candidateId: c.id, targetSlot: c.targetSlot, score: 85, reason: 'Same garment' })), [sourceTee, sweater]);
  assert.equal(result.edits[0].items.length, 2);
  assert.deepEqual(plain(result.edits[0].missingSlots), []);
});
check('an incomplete outfit is visibly labeled partial', () => {
  assert.ok(partialResult.edits.every(edit => edit.title === 'Partial match'));
});
const closeTee = { ...sourceTee, id: 'close-cream', color: 'Cream', attributes: { ...sourceTee.attributes, colorFamily: 'cream', silhouette: 'controlled', length: 'cropped' } };
check('retrieval keeps close-looking candidates before applying historical taste', () => {
  const candidates = engine.prepareVisualCandidates(visualTeeIntent, emptyMemory, [closeTee]);
  assert.equal(candidates.length, 1, 'Past crop preference cannot prevent looking at the picture');
});
check('a close shade and length difference returns a result instead of zero', () => {
  const result = engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory, [{ candidateId: closeTee.id, targetSlot: 'top', score: 62, hardConflict: false, observedColorFamily: 'cream', observedLength: 'cropped', reason: 'Related shape' }], [closeTee]);
  assert.equal(result.edits[0].items[0].catalogId, closeTee.id);
});
check('a weak match cannot also change the inspiration color family or add a bold pattern', () => {
  const changed = { ...closeTee, name: 'Striped long sleeve top' };
  assert.throws(() => engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory, [{ candidateId: changed.id, targetSlot: 'top', score: 62, observedColorFamily: 'brown', reason: 'Shape only' }], [changed]), /No verified/);
  assert.throws(() => engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory, [{ candidateId: changed.id, targetSlot: 'top', score: 62, observedColorFamily: 'cream', reason: 'Strong stripes' }], [changed]), /No verified/);
});
check('retailer subtype labels cannot overrule a positive image comparison', () => {
  const mislabeled = { ...closeTee, subtype: 'knit' };
  assert.equal(engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory, [{ candidateId: closeTee.id, targetSlot: 'top', score: 85, hardConflict: false, reason: 'Same visible garment shape' }], [mislabeled]).edits.length, 1);
});
check('visual resemblance wins over a more familiar personal preference', () => {
  const familiar = { ...sourceTee, id: 'familiar-white', attributes: { ...sourceTee.attributes, colorFamily: 'white', silhouette: 'fitted' } };
  const matches = [{ candidateId: closeTee.id, targetSlot: 'top', score: 92, reason: 'Closest shape' }, { candidateId: familiar.id, targetSlot: 'top', score: 76, reason: 'Less similar shape' }];
  const result = engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, { ...emptyMemory, likes: [{ type: 'product', value: familiar.id, weight: 100 }] }, matches, [closeTee, familiar]);
  assert.equal(result.edits[0].items[0].catalogId, closeTee.id);
});
check('wrong garment function remains rejected despite a high score', () => {
  assert.throws(() => engine.buildCatalogRecommendations(visualTeeIntent, fixture.brief, emptyMemory, [{ candidateId: closeTee.id, targetSlot: 'top', score: 90, hardConflict: true, reason: 'Wrong garment' }], [closeTee]), /No verified/);
});
check('observed baggy construction overrides incomplete catalog metadata', () => {
  assert.throws(() => engine.buildCatalogRecommendations(trouserIntent, fixture.brief, emptyMemory, privateCandidates.map((c) => ({ candidateId: c.id, targetSlot: c.targetSlot, score: 90, reason: 'Same color', observedSilhouette: 'barrel' }))), /No verified/);
});
check('one available shoe is reused instead of falsely missing from later looks', () => {
  const pool = actualCatalog.products.filter((p) => p.category !== 'shoes');
  const shoe = actualCatalog.products.find((p) => p.subtype === 'heel' && p.attributes.colorFamily === 'black');
  const result = engine.buildCatalogRecommendations(monochromeIntent, fixture.brief, emptyMemory, [], [...pool, shoe]);
  assert.ok(result.edits.length > 1);
  assert.ok(result.edits.every((edit) => edit.items.some((item) => item.catalogId === shoe.id)));
});
check('item correction does not teach a dislike of its color or brand', () => {
  const item = { ...edits[0].items[0], attributes: [...edits[0].items[0].attributes, { type: 'retailer', value: 'Aritzia' }] };
  const signals = learning.feedbackSignals(item, 'close', 'Too loose', false);
  assert.ok(signals.some((signal) => signal.type === 'product'));
  assert.ok(!signals.some((signal) => signal.type === 'top:tee:silhouette'));
  assert.ok(signals.every((signal) => !/color|retailer|category/.test(signal.type)));
  assert.equal(learning.feedbackSignals(item, 'no', '', true).length, 0);
});
const taxonomy = load('lib/catalog-taxonomy.ts', { '@/lib/inspiration-types': {} });
const pageUrl = 'https://www.aritzia.com/us/en/product/straight-trouser/123456.html?color=1274';
const productHtml = (availability = 'InStock') => `<html><head><meta property="og:url" content="${pageUrl}"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Straight trouser', image: 'https://assets.aritzia.com/item.jpg', offers: { price: '120', priceCurrency: 'USD', availability: `https://schema.org/${availability}` } })}</script></head></html>`;
let pageMode = '404';
const productSearch = load('lib/product-search.ts', {
  '@/data/discovered-products.json': { __esModule: true, default: { products: [] } },
  'cloudflare:workers': { env: {} }, '@/data/verified-catalog.json': { __esModule: true, default: actualCatalog }, '@/lib/catalog-taxonomy': taxonomy,
}, { process: { env: {} }, fetch: async () => pageMode === '404' ? new Response('', { status: 404 }) : new Response('Access denied', { status: 403 }) });
check('search accepts only exact official US product pages', () => {
  for (const url of ['https://www.aritzia.com/us/en/clothing/pants', 'https://www.aritzia.com/intl/en/product/test/123.html', 'https://www.massimodutti.com/us/', 'https://www.aritzia.com.evil.test/us/en/product/test/123.html']) assert.equal(productSearch.productUrl(url), null);
  assert.equal(productSearch.productUrl(pageUrl), pageUrl);
});
check('shopping queries retain defining shoe and dress construction',()=>{
  const base={colorFamily:'black',silhouette:'unknown',neckline:'unknown',sleeve:'unknown',length:'maxi'};
  const shoe=productSearch.shoppingQuery({...base,category:'shoes',subtype:'heel',details:['thin straps','open-toe','stiletto heel']});
  assert.ok(shoe.includes('strappy open-toe stiletto'));
  const dress=productSearch.shoppingQuery({...base,category:'dress',subtype:'dress',details:['asymmetric shoulder','draped bodice']});
  assert.ok(dress.includes('asymmetric draped'));
});
check('live discovery preserves a matching private capture, not a different image variant', () => {
  const prior = actualCatalog.products.find((p) => p.privateImageEvidence);
  assert.ok(prior, 'Catalog contains at least one captured product');
  const fresh = { ...prior, privateImageEvidence: undefined, imageSourceUrl: '' };
  const retained = productSearch.combineProducts([fresh]).find((p) => p.id === prior.id);
  assert.equal(retained.privateImageEvidence.dataUrl, prior.privateImageEvidence.dataUrl);
  const changed = productSearch.combineProducts([{ ...fresh, imageSourceUrl: 'https://assets.aritzia.com/different-variant.jpg' }]).find((p) => p.id === prior.id);
  assert.equal(changed.privateImageEvidence, undefined);
});
check('page verification rejects shells, wrong products and sold-out evidence', () => {
  assert.equal(productSearch.parseProductPage('<html>Loading…</html>', pageUrl), null);
  assert.equal(productSearch.parseProductPage(productHtml('OutOfStock'), pageUrl), null);
  assert.equal(productSearch.parseProductPage(productHtml().replace('123456.html', '654321.html'), pageUrl), null);
  assert.equal(productSearch.parseProductPage(productHtml(), pageUrl).sourceStatus, 'page-verified');
});
check('discovery takes URLs from provider citations, never generated prose', () => {
  const result = productSearch.searchSourceUrls({ output: [{ type: 'message', content: [{ text: 'https://www.aritzia.com/us/en/product/hallucinated/999.html', annotations: [{ type: 'url_citation', url: pageUrl }] }] }] });
  assert.deepEqual(plain(result), [pageUrl]);
});
const sample = { ...actualCatalog.products[0], canonicalUrl: pageUrl, verifiedAt: new Date().toISOString() };
check('discovered records require a citation and do not assert live availability', () => {
  const result = productSearch.citedProducts({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ products: [
    { url: pageUrl, name: 'Straight trouser', color: 'black', imageUrl: 'https://assets.aritzia.com/large/f24_123456_9999_on_a.jpg' },
    { url: pageUrl.replace('123456', '999999'), name: 'Straight trouser' },
    { url: pageUrl, name: 'Straight trouser', unavailable: true },
  ] }), annotations: [{ type: 'url_citation', url: pageUrl }] }] }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceStatus, 'official-link');
  assert.equal(result[0].imageSourceUrl, '');
});
const dead = await productSearch.verifySelection([sample]);
check('a 404 cannot be resurrected by a recent catalog timestamp', () => assert.equal(dead.accepted.length, 0));
pageMode = '403';
const blocked = await productSearch.verifySelection([{ ...sample, canonicalUrl: pageUrl.replace('123456', '123457') }]);
check('blocked checks keep recent evidence explicitly unconfirmed', () => {
  assert.equal(blocked.accepted.length, 1);
  assert.equal(blocked.accepted[0].sourceStatus, 'official-link');
  assert.equal(blocked.accepted[0].verifiedAt, sample.verifiedAt);
});
const stale = await productSearch.verifySelection([{ ...sample, canonicalUrl: pageUrl.replace('123456', '123458'), verifiedAt: '2020-01-01T00:00:00Z' }]);
check('stale blocked catalog entries cannot be recommended', () => assert.equal(stale.accepted.length, 0));
let uploads = 0;
const generationDependencies = {
  '@/lib/merchant-feeds': { discoverMerchantFeeds: async () => [] },
  '@/lib/inspiration-failure': load('lib/inspiration-failure.ts', {}),
  '@/lib/catalog-retrieval': { preparedCatalog: products => products, retrieveCatalog: async () => ({ scores: new Map(), mode: 'offline-retrieval' }) },
  '@/lib/inspiration-scope': scopes, '@/lib/persistence': persistence,
  '@/lib/inspiration-interpreter': { interpretInspiration: async () => ({ brief: fixture.brief, intent: { scope: 'single-item', requestedCategory: 'top', requestedSubtype: 'tee', occasion: 'casual', palette: ['white'], silhouettes: ['relaxed'], avoid: [], keywords: ['t-shirt'], garments: [teeGarment] }, model: 'offline-interpreter' }) },
  '@/lib/inspiration-engine': { selectionDiagnostics: () => ({ catalog: 0, judged: 1, eligible: 1 }), prepareVisualCandidates: () => [], buildCatalogRecommendations: () => ({ edits: fixture.edits, sources: [], model: 'offline-engine', searchMode: 'verified-local-catalog-v1', audits: [] }) },
  '@/lib/visual-matcher': { rankVisualCandidates: async () => ({ matches: [{ candidateId: 'fixture', score: 80 }], model: 'offline-visual' }) },
  '@/lib/product-search': { discoverProducts: async () => ({ products: [], status: 'offline' }), combineProducts: () => [], verifySelection: async () => ({ accepted: [], rejected: [] }) },
  '@/lib/inspiration-learning': learning,
  '@/lib/inspiration-storage': { storeInspirationImage: async () => { uploads++; return 'test-image'; }, privateSearchCache: () => ({get: async()=>null,put: async()=>{}}) },
};
const inspiration = load('app/api/inspiration/route.ts', {
  ...generationDependencies,
  '@/lib/inspiration-pipeline': load('lib/inspiration-pipeline.ts', generationDependencies),
});
for (const [message,status,code] of [
  ['OpenAI 429: You have no credits remaining. Add credits to continue using the API.',503,'service-credits-exhausted'],
  ['OpenAI 429: Rate limit reached for tokens per minute.',503,'service-busy'],
  ['OpenAI 401: Invalid API key secret-must-not-be-reflected',503,'service-configuration'],
  ['OPENAI_API_KEY is unavailable.',503,'service-configuration'],
  ['The operation timed out',504,'service-timeout'],
  ['No verified close visual match in the two stores today.',422,'no-qualified-products'],
  ['Retailer images are temporarily unavailable.',503,'image-evidence-unavailable'],
  ['A database detail that should stay private',502,'upstream-or-storage-failure'],
]) {
  const route=load('app/api/inspiration/route.ts',{
    ...generationDependencies,
    '@/lib/inspiration-pipeline': {generateInspiration: async()=>{throw new Error(message);}},
  },{console:{info(){},error(){}}});
  const before=sql.prepare('SELECT COUNT(*) AS n FROM inspiration_recommendations').get().n;
  const form=new FormData();form.set('note','White tee');
  const response=await route.POST(new Request('http://offline.test/api/inspiration',{method:'POST',headers:{'x-test-auth':'yes'},body:form}));
  const result=await response.json();
  check(`generation failure correctly identifies ${code} without saving a look`,()=>{
    assert.equal(response.status,status);assert.equal(result.code,code);
    assert.equal(events.at(-1)[1].reason,code);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM inspiration_recommendations').get().n,before);
    assert.ok(!result.error.includes('secret-must-not-be-reflected'));
    if(code!=='no-qualified-products')assert.ok(!result.error.includes('Could not find reliable items'));
  });
}
let recoverySearches = 0, recoverySelections = 0;
const recoveringPipeline = load('lib/inspiration-pipeline.ts', {
  ...generationDependencies,
  '@/lib/inspiration-engine': { ...generationDependencies['@/lib/inspiration-engine'], buildCatalogRecommendations: () => {
    if (++recoverySelections === 1) throw new Error('No verified item is available for this request in the current two-store catalog.');
    return { edits: fixture.edits, searchMode: 'test-recovered' };
  } },
  '@/lib/product-search': { ...generationDependencies['@/lib/product-search'], discoverProducts: async () => { recoverySearches++; return { products: [], status: 'test-search' }; } },
});
await recoveringPipeline.generateInspiration('image/jpeg', new ArrayBuffer(1), '', emptyMemory);
check('an empty first selection reaches targeted recovery across module boundaries', () => {
  assert.equal(recoverySearches, 1); assert.equal(recoverySelections, 2);
});
let rankAttempts = 0;
const recoveryStages = [];
const resilientPipeline = load('lib/inspiration-pipeline.ts', {
  ...generationDependencies,
  '@/lib/inspiration-engine': { ...generationDependencies['@/lib/inspiration-engine'], prepareVisualCandidates: () => [{ id: 'new' }] },
  '@/lib/visual-matcher': { rankVisualCandidates: async () => {
    if (++rankAttempts === 2) throw new Error('Retailer images are temporarily unavailable.');
    return { matches: [{ candidateId: 'fixture', targetSlot: 'top', score: 80 }], model: 'test' };
  } },
  '@/lib/product-search': { ...generationDependencies['@/lib/product-search'], combineProducts: products => products, verifySelection: async products => ({accepted:products,rejected:[]}), discoverProducts: async () => ({ products: [{ id: 'new', canonicalUrl: 'https://test.example/item' }], status: 'test' }) },
});
const preserved = await resilientPipeline.generateInspiration('image/jpeg', new ArrayBuffer(1), '', emptyMemory, stage => recoveryStages.push(stage));
check('a blocked extra garment cannot erase already-qualified partial results', () => {
  assert.equal(rankAttempts, 2); assert.ok(recoveryStages.includes('missing-piece-unavailable'));
  assert.equal(preserved.generated.edits.length, fixture.edits.length);
});
const limitedPipeline = load('lib/inspiration-pipeline.ts', {
  ...generationDependencies,
  '@/lib/inspiration-engine': {...generationDependencies['@/lib/inspiration-engine'],buildCatalogRecommendations:()=>({edits:[{...fixture.edits[0],missingSlots:['Knit']}],searchMode:'test'})},
  '@/lib/product-search': {...generationDependencies['@/lib/product-search'],discoverProducts:async()=>{throw new Error('Search budget: request limit reached.');}},
});
const limited = await limitedPipeline.generateInspiration('image/jpeg', new ArrayBuffer(1), '', emptyMemory);
check('budget-limited partial results say search unfinished, not inventory missing',()=>{
  assert.equal(limited.generated.edits[0].searchIncomplete,true);
  assert.equal(limited.generated.edits[0].items.length,1);
  assert.ok(limited.generated.searchMode.includes('search-incomplete'));
});
const search = (form, role = 'yes') => inspiration.POST(new Request('http://offline.test/api/inspiration', { method: 'POST', headers: { 'x-test-auth': role }, body: form }));
assert.equal((await search(new FormData())).status, 400);
const textForm = new FormData(); textForm.set('note', 'A relaxed white T-shirt');
const textResponse = await search(textForm);
assert.equal(textResponse.status, 200);
const textResult = await textResponse.json();
const row = sql.prepare('SELECT * FROM inspiration_recommendations WHERE id = ?').get(textResult.id);
check('text request persists without an image upload or broken image URL', () => {
  assert.equal(row.image_type, 'text/plain'); assert.equal(row.storage_key, '');
  assert.equal(textResult.imageUrl, ''); assert.equal(uploads, 0);
});
const imageForm = new FormData(); imageForm.set('image', new File(['image bytes'], 'test.jpg', { type: 'image/jpeg' }));
assert.equal((await search(imageForm)).status, 200);
check('image request still uploads its image', () => assert.equal(uploads, 1));
const badForm = new FormData(); badForm.set('image', new File(['bad'], 'test.txt', { type: 'text/plain' }));
assert.equal((await search(badForm)).status, 400);
checks++; console.log('PASS unsupported image type rejected');
const qaForm = new FormData(); qaForm.set('note', 'QA tee'); qaForm.set('sessionId', 'angie-v1');
const qaGeneration = await (await search(qaForm, 'admin')).json();
check('admin generation ignores supplied session and persists only in QA', () => {
  assert.equal(sql.prepare('SELECT session_id FROM inspiration_recommendations WHERE id = ?').get(qaGeneration.id).session_id, 'angie-qa-v1');
  assert.equal(qaGeneration.memory.mode, 'test');
  assert.equal(events.at(-1)[2], 'angie-qa-v1');
});

const outcomesRoute=load('app/api/inspiration/outcomes/route.ts',{'@/lib/inspiration-scope':scopes,'@/lib/persistence':persistence,'@/lib/inspiration-learning':learning,'@/lib/saved-looks':savedLooksModule});
const outcomeBody={recommendationId:textResult.id,editId:'edit-1',catalogId:'fixture-1',eventType:'tried',size:'S',fit:'fits'};
const submitOutcome=(value,role='yes')=>outcomesRoute.POST(new Request('http://offline.test/api/inspiration/outcomes',{method:'POST',headers:{'Content-Type':'application/json','x-test-auth':role},body:JSON.stringify(value)}));
assert.equal((await submitOutcome(outcomeBody,'unknown')).status,401);
assert.equal((await submitOutcome(outcomeBody,'admin')).status,404);
assert.equal((await submitOutcome({...outcomeBody,catalogId:'not-shown'})).status,404);
assert.equal((await submitOutcome({...outcomeBody,size:''})).status,400);
assert.equal((await submitOutcome({...outcomeBody,eventType:'ordered'})).status,400);
assert.equal((await submitOutcome(outcomeBody)).status,200);
assert.equal((await (await submitOutcome(outcomeBody)).json()).duplicate,true);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM outcome_events').get().n,1);
assert.equal((await learning.getInspirationMemory('angie-v1')).fitOutcomes[0].size,'S');
assert.equal((await learning.getInspirationMemory('angie-qa-v1')).fitOutcomes.length,0);
checks++;console.log('PASS tried-size learning is authenticated, item-bound, isolated and retry-safe');
assert.equal((await outcomesRoute.GET(requestAs('unknown'))).status,401);
assert.equal((await (await outcomesRoute.GET(requestAs('admin'))).json()).purchases.length,0);
const purchaseList=await (await outcomesRoute.GET(requestAs('yes'))).json();
assert.equal(purchaseList.purchases[0].item.catalogId,'fixture-1');
assert.equal(purchaseList.purchases[0].size,'S');
checks++;console.log('PASS purchase queue persists actual item and size and isolates profiles');
const swapRoute=load('app/api/inspiration/swap/route.ts',{'@/lib/inspiration-scope':scopes,'@/lib/persistence':persistence,'@/lib/inspiration-learning':learning,'@/lib/saved-looks':savedLooksModule});
const swapBase=JSON.parse(JSON.stringify(edits));
swapBase.forEach(edit=>edit.items.push({...edit.items[0],id:'shared-shoe',catalogId:'shared-shoe',slot:'Shoes'}));
sql.prepare('INSERT INTO inspiration_recommendations(id,session_id,edits_json) VALUES(?,?,?)').run('swap-fixture','angie-v1',JSON.stringify(swapBase));
const swapBody={recommendationId:'swap-fixture',editId:'edit-1',itemId:'item-1',replacementId:'item-2'};
const submitSwap=(body,role='yes')=>swapRoute.POST(new Request('http://offline.test/api/inspiration/swap',{method:'POST',headers:{'Content-Type':'application/json','x-test-auth':role},body:JSON.stringify(body)}));
assert.equal((await submitSwap(swapBody,'unknown')).status,401);
assert.equal((await submitSwap(swapBody,'admin')).status,404);
assert.equal((await submitSwap({...swapBody,replacementId:'shared-shoe'})).status,400);
const swapped=await (await submitSwap(swapBody)).json();
assert.equal(swapped.edit.items[0].catalogId,'fixture-2');
assert.equal(swapped.edit.items[1].catalogId,'shared-shoe');
assert.equal((await (await submitSwap(swapBody)).json()).edit.id,swapped.edit.id);
const storedSwaps=JSON.parse(sql.prepare('SELECT edits_json FROM inspiration_recommendations WHERE id=?').get('swap-fixture').edits_json);
assert.equal(storedSwaps[0].items[0].catalogId,'fixture-1');
checks++;console.log('PASS swap is owned, slot-bound, retry-safe and preserves the rest of the outfit');
assert.equal((await submitSwap(null)).status,400);
swapBase[1].items[1].catalogId='different-shoe';
sql.prepare('UPDATE inspiration_recommendations SET edits_json=? WHERE id=?').run(JSON.stringify(swapBase),'swap-fixture');
const novelSwap=await (await submitSwap(swapBody)).json();
assert.ok(novelSwap.edit.id.startsWith('swap-'));
assert.equal(novelSwap.edit.items[1].catalogId,'shared-shoe');
assert.equal((await (await submitSwap(swapBody)).json()).edit.id,novelSwap.edit.id);
assert.equal(JSON.parse(sql.prepare('SELECT edits_json FROM inspiration_recommendations WHERE id=?').get('swap-fixture').edits_json).length,4);
checks++;console.log('PASS novel swap creates exactly one immutable version and rejects malformed bodies');
const feedModule=load('lib/merchant-feeds.ts',{'cloudflare:workers':{env:{}}});
const feedRequests=[];
const runtimeFeed=load('lib/merchant-feeds.ts',{'cloudflare:workers':{env:{}}}, {fetch:async(url,options)=>{
  assert.equal(options.redirect,'manual');feedRequests.push(url);return Response.json({products:[]});
}});
await runtimeFeed.discoverMerchantFeeds();
assert.equal(feedRequests.length,5);
checks++;console.log('PASS merchant feeds use runtime-compatible redirects without following untrusted locations');
check('merchant feeds require live variants and matching color images without inventing currency',()=>{
  const row={id:1,title:'Cotton V-neck T-shirt',handle:'test-tee',product_type:'T-shirt',options:[{name:'Color',position:1},{name:'Size',position:2}],variants:[{id:11,available:true,price:'50',option1:'White',option2:'S',featured_image:{src:'https://cottoncitizen.com/cdn/shop/files/white.jpg'}},{id:12,available:false,price:'50',option1:'White',option2:'M'},{id:13,available:true,price:'50',option1:'Black',option2:'S'}]};
  const parsed=feedModule.parseMerchantFeed([row],{host:'cottoncitizen.com',name:'Cotton Citizen'});
  assert.equal(parsed.length,1);
  assert.deepEqual(plain(parsed[0].availableSizes),['S']);
  assert.equal(parsed[0].price,null);
  assert.ok(parsed[0].canonicalUrl.includes('variant=11'));
  assert.equal(parsed[0].color,'White');
  assert.equal(feedModule.parseMerchantFeed([{...row,variants:row.variants.map(v=>({...v,available:false}))}],{host:'cottoncitizen.com',name:'Cotton Citizen'}).length,0);
});
const historyRoute=load('app/api/inspiration/history/route.ts',{'@/lib/inspiration-scope':scopes,'@/lib/persistence':persistence,'@/lib/inspiration-learning':learning,'@/lib/saved-looks':savedLooksModule});
assert.equal((await historyRoute.GET(requestAs('unknown'))).status,401);
const savedHistory=await historyRoute.GET(requestAs('yes'));
assert.equal(savedHistory.headers.get('Cache-Control'),'private, no-store');
const savedRows=(await savedHistory.json()).recommendations;
assert.ok(savedRows.some(r=>r.id===textResult.id));assert.ok(savedRows.every(r=>r.id!==qaGeneration.id&&r.id!=='qa-recommendation'));
checks++;console.log('PASS saved looks survive database retrieval without crossing profiles');
const updated=await (await submitOutcome({...outcomeBody,fit:'too-small'})).json();
assert.equal(updated.guidance.recommendedSize,'Check another size');
const afterFit=(await (await historyRoute.GET(requestAs('yes'))).json()).recommendations.find(r=>r.id===textResult.id);
assert.equal(afterFit.edits[0].items[0].recommendedSize,'Check another size');
assert.equal(savedRows.find(r=>r.id===fixture.id).confirmedFeedback['edit-1'].reaction,'close');
checks++;console.log('PASS saved look updates fit guidance and retains its confirmed reaction');
for(let i=0;i<101;i++)sql.prepare('INSERT INTO outcome_events(session_id,catalog_id,event_type,reason,created_at) VALUES (?,?,?,?,?)').run('angie-v1','other-'+i,'ordered',JSON.stringify({version:1,fit:'unknown',size:'S'}),Date.now()+i);
assert.equal((await learning.getInspirationMemory('angie-v1')).fitOutcomes.length,1);
checks++;console.log('PASS unrelated orders cannot evict learned fit evidence');
for(let i=0;i<21;i++)sql.prepare('INSERT INTO inspiration_recommendations(id,session_id,edits_json,style_brief_json,sources_json,created_at) VALUES(?,?,?,?,?,?)').run('pagination-'+String(i).padStart(2,'0'),'angie-v1',JSON.stringify(edits),JSON.stringify(fixture.brief),'[]',9000000000000+i);
const firstPage=await (await historyRoute.GET(requestAs('yes'))).json();
const nextPage=await(await historyRoute.GET(new Request('http://offline.test/?cursor='+encodeURIComponent(firstPage.nextCursor),{headers:{'x-test-auth':'yes'}}))).json();
assert.equal(firstPage.recommendations.length,20);assert.ok(nextPage.recommendations.some(r=>r.id==='pagination-00'));
checks++;console.log('PASS older saved looks remain accessible beyond twenty recommendations');

// Exercise the exact data-only migration, including protection for later real feedback.
sql.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, participant_name TEXT, stage TEXT, started_at INTEGER, updated_at INTEGER)');
const knownQaIds = ['04e6bb17-6297-45eb-8f16-5256d79cc9f5', '95abe3bc-14e7-40e5-aba8-9835e657a944', '92410e83-6de8-443f-b2bd-c6a1e815786e'];
const unknownId = '4d4ec947-8e25-46bd-aca7-0f988a26eec0';
for (const id of [...knownQaIds, unknownId]) sql.prepare('INSERT INTO inspiration_recommendations (id, session_id, edits_json) VALUES (?, ?, ?)').run(id, 'angie-v1', '[]');
const seed = (id, edit, at) => {
  sql.prepare('INSERT INTO inspiration_feedback (session_id, recommendation_id, edit_id, reaction, target_item_ids_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('angie-v1', id, edit, 'love', '["preserved-item"]', 'Preserve this exact note', at);
  sql.prepare('INSERT INTO preference_signals (session_id, recommendation_id, feature_type, feature_value, weight_delta, reaction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('angie-v1', id, 'fit', 'straight', 0.25, 'love', at);
};
seed(knownQaIds[0], 'edit-1', 1788111646187);
seed(knownQaIds[1], 'edit-1', 1788112365944);
seed(knownQaIds[1], 'edit-2', 1788112385741);
seed(knownQaIds[1], 'edit-3', 1788112410198);
seed(unknownId, 'edit-1', 1788158045268);
seed(unknownId, 'edit-2', 1788158050644);
seed(unknownId, 'edit-3', 1788159999999); // Later genuine confirmation must remain.
const migration = readFileSync(new URL('../drizzle/0005_isolate_feedback_history.sql', import.meta.url), 'utf8');
const allFeedbackBefore = sql.prepare('SELECT * FROM inspiration_feedback ORDER BY id').all();
const allSignalsBefore = sql.prepare('SELECT * FROM preference_signals ORDER BY rowid').all();
sql.exec(migration);
check('cleanup archives four known tests and holds only the two timestamp-qualified unknown reactions', () => {
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM inspiration_feedback WHERE session_id = ?').get('angie-qa-legacy-v1').n, 4);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM inspiration_feedback WHERE session_id = ?').get('angie-review-legacy-v1').n, 2);
  assert.equal(sql.prepare('SELECT session_id FROM inspiration_feedback WHERE recommendation_id = ? AND edit_id = ?').get(unknownId, 'edit-3').session_id, 'angie-v1');
  assert.equal(sql.prepare('SELECT session_id FROM inspiration_recommendations WHERE id = ?').get(unknownId).session_id, 'angie-v1');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM inspiration_recommendations WHERE session_id = ?').get('angie-qa-legacy-v1').n, 3);
});
const withoutSession = (rows) => rows.map(({ session_id, ...rest }) => { void session_id; return rest; });
check('migration preserves every original feedback value, note, signal and row', () => {
  assert.deepEqual(withoutSession(sql.prepare('SELECT * FROM inspiration_feedback ORDER BY id').all()), withoutSession(allFeedbackBefore));
  assert.deepEqual(withoutSession(sql.prepare('SELECT * FROM preference_signals ORDER BY rowid').all()), withoutSession(allSignalsBefore));
});
const migratedFeedback = sql.prepare('SELECT * FROM inspiration_feedback ORDER BY id').all();
const migratedSignals = sql.prepare('SELECT * FROM preference_signals ORDER BY rowid').all();
sql.exec(migration);
check('reapplying cleanup is safe and makes no duplicate or further changes', () => {
  assert.deepEqual(sql.prepare('SELECT * FROM inspiration_feedback ORDER BY id').all(), migratedFeedback);
  assert.deepEqual(sql.prepare('SELECT * FROM preference_signals ORDER BY rowid').all(), migratedSignals);
});
sql.close();
console.log(`\n${checks} offline regression checks passed.`);
