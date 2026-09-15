import candidates from '@/data/candidates.json';
import type { AnswerMap } from '@/data/questions';
import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, FREEZE_ID, recordEvent, SESSION_ID } from '@/lib/persistence';
import { buildQuestionnaireRanking, type CandidateEvidence } from '@/lib/ranking';

type FreezeRow = {
  id: string;
  session_id: string;
  version: string;
  created_at: number;
  answers_json: string;
  baseline_json: string;
  adjusted_json: string;
  audit_json: string;
  integrity_hash: string;
  blind_labels_seen: number;
};

function parseFreeze(row: FreezeRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    version: row.version,
    createdAt: row.created_at,
    answers: JSON.parse(row.answers_json),
    baseline: JSON.parse(row.baseline_json),
    adjusted: JSON.parse(row.adjusted_json),
    questionAudit: JSON.parse(row.audit_json),
    integrityHash: row.integrity_hash,
    blindLabelsSeen: Boolean(row.blind_labels_seen),
  };
}

async function currentFreeze() {
  return database().prepare('SELECT * FROM ranking_freezes WHERE id = ?').bind(FREEZE_ID).first<FreezeRow>();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(request: Request) {
  if (!requireRole(request, ['admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  const row = await currentFreeze();
  return Response.json({ freeze: row ? parseFreeze(row) : null });
}

export async function POST(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  await ensureSession();

  const existing = await currentFreeze();
  if (existing) return Response.json({ created: false, freeze: parseFreeze(existing) });

  const ratingCount = await database().prepare('SELECT COUNT(*) AS count FROM blind_ratings WHERE session_id = ?').bind(SESSION_ID).first<{ count: number }>();
  if (Number(ratingCount?.count ?? 0) > 0) {
    return Response.json({ error: 'Freeze refused because blind labels already exist.' }, { status: 409 });
  }

  const answerRows = await database().prepare('SELECT question_id, answer, note FROM answers WHERE session_id = ? ORDER BY created_at').bind(SESSION_ID).all();
  if (answerRows.results.length < 12) return Response.json({ error: 'All 12 calibration answers are required.' }, { status: 409 });
  const answers = Object.fromEntries(answerRows.results.map((row) => [String(row.question_id), { answer: String(row.answer), note: row.note ? String(row.note) : null }])) as AnswerMap;
  const ranking = buildQuestionnaireRanking(candidates as CandidateEvidence[], answers);
  const createdAt = Date.now();
  const evidence = {
    freezeId: FREEZE_ID,
    sessionId: SESSION_ID,
    version: ranking.version,
    createdAt,
    blindLabelsSeen: false,
    answers,
    baseline: ranking.baseline,
    adjusted: ranking.adjusted,
    questionAudit: ranking.questionAudit,
  };
  const integrityHash = await sha256(JSON.stringify(evidence));

  await database().prepare(
    'INSERT INTO ranking_freezes (id, session_id, version, created_at, answers_json, baseline_json, adjusted_json, audit_json, integrity_hash, blind_labels_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    FREEZE_ID,
    SESSION_ID,
    ranking.version,
    createdAt,
    JSON.stringify(answers),
    JSON.stringify(ranking.baseline),
    JSON.stringify(ranking.adjusted),
    JSON.stringify(ranking.questionAudit),
    integrityHash,
    0,
  ).run();
  await recordEvent('ranking_frozen', { freezeId: FREEZE_ID, version: ranking.version, integrityHash, blindLabelsSeen: false });

  const row = await currentFreeze();
  return Response.json({ created: true, freeze: row ? parseFreeze(row) : null });
}
