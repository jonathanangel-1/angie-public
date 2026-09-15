const base = process.env.ANGIE_TEST_URL ?? 'http://localhost:3000';

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function call(path, options = {}, cookie = '') {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
  });
  const data = await response.json();
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie };
}

const anonymous = await call('/api/access');
check(anonymous.response.ok && anonymous.data.role === null, 'private room starts locked');

const participantLogin = await call('/api/access', { method: 'POST', body: JSON.stringify({ code: 'demo-participant' }) });
check(participantLogin.data.role === 'participant' && participantLogin.cookie, 'participant access works');
const participantCookie = participantLogin.cookie;

const session = await call('/api/session', {}, participantCookie);
check(session.response.ok && session.data.session.id === 'angie-v1', 'participant can read the Angie session');

const adminLogin = await call('/api/access', { method: 'POST', body: JSON.stringify({ code: 'demo-admin' }) });
check(adminLogin.data.role === 'admin' && adminLogin.cookie, 'admin access works');
const adminCookie = adminLogin.cookie;
const results = await call('/api/results', {}, adminCookie);
check(results.response.ok && results.data.ranked.length === 30, 'admin can read all 30 candidates');
check(results.data.freeze && results.data.metrics.questionsAnswered === 12, 'questionnaire and immutable ranking freeze exist');
check(results.data.metrics.ratingsAnswered === 0 || results.data.metrics.ratingsAnswered === 30, 'blind labels are either absent or a complete 30-item batch');
check(results.data.freeze.blindLabelsSeen === (results.data.metrics.ratingsAnswered === 30), 'freeze label flag matches imported evidence');

const freeze = await call('/api/freeze', {}, adminCookie);
check(freeze.response.ok && freeze.data.freeze.integrityHash === results.data.freeze.integrityHash, 'freeze hash is stable across independent reads');

const ids = results.data.ranked.map((item) => item.id);
const baselineRanks = results.data.ranked.map((item) => item.baselineRank).sort((left, right) => left - right);
const adjustedRanks = results.data.ranked.map((item) => item.rank).sort((left, right) => left - right);
const expectedRanks = Array.from({ length: 30 }, (_, index) => index + 1);
check(new Set(ids).size === 30, 'adjusted ranking contains each candidate exactly once');
check(JSON.stringify(baselineRanks) === JSON.stringify(expectedRanks), 'baseline ranking is a complete 1-to-30 permutation');
check(JSON.stringify(adjustedRanks) === JSON.stringify(expectedRanks), 'adjusted ranking is a complete 1-to-30 permutation');

console.log(`\nFrozen experiment verified without changing data: ${results.data.freeze.integrityHash}`);
