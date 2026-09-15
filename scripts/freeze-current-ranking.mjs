import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.ANGIE_TEST_URL ?? 'http://localhost:3000';
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(projectDir, '../outputs/angie-questionnaire-freeze-v1');

async function login(code) {
  const response = await fetch(`${base}/api/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Access cookie was not returned.');
  return cookie;
}

const cookie = await login('demo-admin');
const beforeResponse = await fetch(`${base}/api/results`, { headers: { Cookie: cookie } });
if (!beforeResponse.ok) throw new Error(`Pre-freeze check failed: ${beforeResponse.status}`);
const before = await beforeResponse.json();
if (before.metrics.ratingsAnswered !== 0) throw new Error('Freeze aborted: blind labels already exist.');
if (before.metrics.questionsAnswered !== 12) throw new Error(`Freeze aborted: expected 12 answers, found ${before.metrics.questionsAnswered}.`);

const freezeResponse = await fetch(`${base}/api/freeze`, { method: 'POST', headers: { Cookie: cookie } });
const freezeResult = await freezeResponse.json();
if (!freezeResponse.ok) throw new Error(freezeResult.error ?? `Freeze failed: ${freezeResponse.status}`);

const resultsResponse = await fetch(`${base}/api/results`, { headers: { Cookie: cookie } });
if (!resultsResponse.ok) throw new Error(`Frozen results read failed: ${resultsResponse.status}`);
const results = await resultsResponse.json();
if (!results.freeze || results.freeze.blindLabelsSeen || results.metrics.ratingsAnswered !== 0) {
  throw new Error('Integrity check failed: freeze is missing or blind-label separation was violated.');
}

const biggestMoves = [...results.ranked]
  .sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange) || a.rank - b.rank)
  .slice(0, 10);
const topA = [...results.ranked].sort((a, b) => a.baselineRank - b.baselineRank).slice(0, 10);
const topB = results.ranked.slice(0, 10);

const artifact = {
  experiment: 'Angie questionnaire incremental-value test',
  frozenBeforeBlindLabels: true,
  blindLabelsImported: 0,
  freeze: results.freeze,
  answers: results.answers,
  profile: results.profile,
  baselineTop10: topA.map((item) => ({ id: item.id, name: item.name, rank: item.baselineRank, score: item.baselineScore })),
  adjustedTop10: topB.map((item) => ({ id: item.id, name: item.name, rank: item.rank, score: item.adjustedScore, previousRank: item.baselineRank, adjustments: item.adjustments })),
  biggestMoves: biggestMoves.map((item) => ({ id: item.id, name: item.name, from: item.baselineRank, to: item.rank, change: item.rankChange, adjustments: item.adjustments })),
  comparisonWhenBlindArrives: {
    labels: { would: 2, maybe: 1, no: 0 },
    metrics: ['top-10 Would wear', 'bottom-10 Would wear', 'NDCG@10', 'pairwise accuracy'],
    decisionRule: 'B must improve top-10 Would-wear count or reduce bottom-10 Would-wear false positives by at least one, worsen neither primary outcome, and reduce NDCG@10 by no more than 0.01. Pairwise accuracy is diagnostic only.',
  },
  fullAdjustedRanking: results.ranked.map((item) => ({
    id: item.id,
    name: item.name,
    retailer: item.retailer,
    baselineRank: item.baselineRank,
    adjustedRank: item.rank,
    rankChange: item.rankChange,
    baselineScore: item.baselineScore,
    adjustedScore: item.adjustedScore,
    adjustments: item.adjustments,
  })),
};

const lines = [
  '# ANGIE RANKING FREEZE',
  '',
  `- Frozen: ${new Date(results.freeze.createdAt).toISOString()}`,
  `- Version: ${results.freeze.version}`,
  `- Integrity hash: \`${results.freeze.integrityHash}\``,
  '- Blind labels present at freeze: **0 / 30**',
  '- Ranking A: email/history only',
  '- Ranking B: email/history plus questionnaire',
  '',
  '## Top 10 — Ranking A',
  '',
  ...topA.map((item) => `${item.baselineRank}. ${item.name} (${item.id}) — ${item.baselineScore.toFixed(2)}`),
  '',
  '## Top 10 — Ranking B',
  '',
  ...topB.map((item) => `${item.rank}. ${item.name} (${item.id}) — ${item.adjustedScore.toFixed(2)} · moved ${item.rankChange > 0 ? '+' : ''}${item.rankChange}`),
  '',
  '## Largest ranking changes',
  '',
  ...biggestMoves.map((item) => `- ${item.name} (${item.id}): A #${item.baselineRank} → B #${item.rank} (${item.rankChange > 0 ? '+' : ''}${item.rankChange})`),
  '',
  '## Evaluation rule',
  '',
  'Do not modify either ranking after viewing Angie’s blind workbook. Import Would wear / Maybe / No, then compare A and B on top-10 Would-wear count, bottom-10 false positives, NDCG@10, and pairwise accuracy.',
  '',
  'Call **QUESTIONS HELPED** only if B improves at least one primary outcome by one or more, worsens neither primary outcome, and reduces NDCG@10 by no more than 0.01. Pairwise accuracy is diagnostic only.',
  '',
  'A match alone does not validate the questions. Ranking B must outperform Ranking A under that pre-registered rule.',
  '',
];

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'angie-ranking-freeze.json'), `${JSON.stringify(artifact, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'ANGIE_RANKING_FREEZE.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({
  created: freezeResult.created,
  freezeId: results.freeze.id,
  integrityHash: results.freeze.integrityHash,
  blindLabelsImported: results.metrics.ratingsAnswered,
  outputDir,
}, null, 2));
