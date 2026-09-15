import candidates from '@/data/candidates.json';
import type { AnswerMap } from '@/data/questions';
import { requireRole } from '@/lib/auth';
import { buildProfile } from '@/lib/profile';
import { database, ensureSchema, ensureSession, FREEZE_ID, SESSION_ID } from '@/lib/persistence';
import { evaluateRanking, type BlindRating, type FrozenRankItem } from '@/lib/ranking';

type FreezeRow = {
  id: string;
  version: string;
  created_at: number;
  baseline_json: string;
  adjusted_json: string;
  audit_json: string;
  integrity_hash: string;
  blind_labels_seen: number;
};

const round = (value: number | null) => value === null ? null : Math.round(value * 1000) / 1000;

export async function GET(request: Request) {
  if (!requireRole(request, ['admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  await ensureSession();
  const db = database();
  const session = await db.prepare('SELECT id, participant_name, stage, started_at, updated_at, completed_at FROM sessions WHERE id = ?').bind(SESSION_ID).first();
  const answerRows = await db.prepare('SELECT question_id, answer, note, updated_at FROM answers WHERE session_id = ? ORDER BY created_at').bind(SESSION_ID).all();
  const ratingRows = await db.prepare('SELECT candidate_id, rating, reason, note, updated_at FROM blind_ratings WHERE session_id = ? ORDER BY created_at').bind(SESSION_ID).all();
  const freezeRow = await db.prepare('SELECT id, version, created_at, baseline_json, adjusted_json, audit_json, integrity_hash, blind_labels_seen FROM ranking_freezes WHERE id = ?').bind(FREEZE_ID).first<FreezeRow>();

  const answers = Object.fromEntries(answerRows.results.map((row) => [String(row.question_id), { answer: String(row.answer), note: row.note ? String(row.note) : null }])) as AnswerMap;
  const responses = Object.fromEntries(ratingRows.results.map((row) => [String(row.candidate_id), row])) as Record<string, Record<string, unknown>>;
  const labels = Object.fromEntries(ratingRows.results.map((row) => [String(row.candidate_id), String(row.rating) as BlindRating]));

  const fallbackBaseline = [...candidates]
    .sort((a, b) => b.privateScore - a.privateScore || b.privateFit - a.privateFit || a.id.localeCompare(b.id))
    .map((item, index) => ({ id: item.id, name: item.name, retailer: item.retailer, rank: index + 1, score: item.privateScore }));
  const baseline = freezeRow ? JSON.parse(freezeRow.baseline_json) as Array<{ id: string; rank: number; score: number }> : fallbackBaseline;
  const adjusted = freezeRow ? JSON.parse(freezeRow.adjusted_json) as FrozenRankItem[] : baseline.map((item) => ({
    id: item.id, name: '', retailer: '', baselineRank: item.rank, adjustedRank: item.rank, rankChange: 0,
    baselineScore: item.score, adjustedScore: item.score, adjustments: [],
  }));
  const baselineEvaluation = evaluateRanking(baseline.map((item) => item.id), labels);
  const adjustedEvaluation = evaluateRanking(adjusted.map((item) => item.id), labels);
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  const ranked = adjusted.map((frozen) => ({
    ...candidateById.get(frozen.id),
    rank: frozen.adjustedRank,
    baselineRank: frozen.baselineRank,
    rankChange: frozen.rankChange,
    baselineScore: frozen.baselineScore,
    adjustedScore: frozen.adjustedScore,
    adjustments: frozen.adjustments,
    response: responses[frozen.id] ?? null,
  }));
  const complete = adjustedEvaluation.complete;

  return Response.json({
    session,
    answers,
    profile: buildProfile(answers),
    freeze: freezeRow ? {
      id: freezeRow.id,
      version: freezeRow.version,
      createdAt: freezeRow.created_at,
      integrityHash: freezeRow.integrity_hash,
      blindLabelsSeen: Boolean(freezeRow.blind_labels_seen),
      questionAudit: JSON.parse(freezeRow.audit_json),
    } : null,
    metrics: {
      questionsAnswered: answerRows.results.length,
      ratingsAnswered: ratingRows.results.length,
      topWould: adjustedEvaluation.topWould,
      bottomWould: adjustedEvaluation.bottomWould,
      complete,
      decision: !complete ? 'WAITING' : adjustedEvaluation.pass ? 'PASS' : 'ITERATE',
      threshold: 'Top 10 ≥ 7 Would wear and bottom 10 ≤ 3 Would wear',
    },
    comparison: {
      baseline: baselineEvaluation,
      adjusted: adjustedEvaluation,
      gain: {
        topWould: adjustedEvaluation.topWould - baselineEvaluation.topWould,
        bottomFalsePositivesReduced: baselineEvaluation.bottomWould - adjustedEvaluation.bottomWould,
        ndcgAt10: baselineEvaluation.ndcgAt10 === null || adjustedEvaluation.ndcgAt10 === null ? null : round(adjustedEvaluation.ndcgAt10 - baselineEvaluation.ndcgAt10),
        pairwiseAccuracy: baselineEvaluation.pairwiseAccuracy === null || adjustedEvaluation.pairwiseAccuracy === null ? null : round(adjustedEvaluation.pairwiseAccuracy - baselineEvaluation.pairwiseAccuracy),
      },
    },
    ranked,
  });
}

export async function DELETE(request: Request) {
  if (!requireRole(request, ['admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  const db = database();
  await db.batch([
    db.prepare('DELETE FROM ranking_freezes WHERE session_id = ?').bind(SESSION_ID),
    db.prepare('DELETE FROM answers WHERE session_id = ?').bind(SESSION_ID),
    db.prepare('DELETE FROM blind_ratings WHERE session_id = ?').bind(SESSION_ID),
    db.prepare('DELETE FROM events WHERE session_id = ?').bind(SESSION_ID),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(SESSION_ID),
  ]);
  await ensureSession();
  return Response.json({ ok: true });
}
