import { inspirationScope } from '@/lib/inspiration-scope';
import { getInspirationMemory, feedbackSignals } from '@/lib/inspiration-learning';
import type { InspirationEdit, InspirationReaction } from '@/lib/inspiration-types';
import { database, ensureSchema, ensureSession, recordEvent } from '@/lib/persistence';

const REACTIONS = new Set<InspirationReaction>(['love', 'close', 'no']);
type RecommendationRow = { edits_json: string };
type FeedbackRow = { reaction: string; target_item_ids_json: string; note: string | null };

export async function POST(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  const sessionId = scope.sessionId;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.confirmed !== true) return Response.json({ error: 'Confirm your reaction before saving.' }, { status: 400 });
  const recommendationId = String(body.recommendationId ?? '').trim().slice(0, 80);
  const editId = String(body.editId ?? '').trim().slice(0, 80);
  const reaction = String(body.reaction ?? '') as InspirationReaction;
  const requestedTargets: string[] = Array.isArray(body.targetItemIds) ? body.targetItemIds.map(String).slice(0, 10) : [];
  const note = String(body.note ?? '').trim().slice(0, 800);
  if (!recommendationId || !editId || !REACTIONS.has(reaction)) return Response.json({ error: 'Incomplete reaction.' }, { status: 400 });

  await ensureSchema();
  await ensureSession(sessionId, scope.mode === 'test' ? 'Style QA' : 'Angie');
  const db = database();
  const [row, existing] = await Promise.all([
    db.prepare('SELECT edits_json FROM inspiration_recommendations WHERE id = ? AND session_id = ?').bind(recommendationId, sessionId).first<RecommendationRow>(),
    db.prepare('SELECT reaction, target_item_ids_json, note FROM inspiration_feedback WHERE session_id = ? AND recommendation_id = ? AND edit_id = ? LIMIT 1').bind(sessionId, recommendationId, editId).first<FeedbackRow>(),
  ]);
  if (!row) return Response.json({ error: 'That edit is no longer available.' }, { status: 404 });

  let edits: InspirationEdit[];
  try {
    edits = JSON.parse(row.edits_json) as InspirationEdit[];
  } catch {
    return Response.json({ error: 'That edit could not be read.' }, { status: 500 });
  }
  const edit = edits.find((candidate) => candidate.id === editId);
  if (!edit) return Response.json({ error: 'That edit is no longer available.' }, { status: 404 });
  const itemIds = new Set(edit.items.map((item) => item.id));
  const wholeLook = requestedTargets.includes('whole-look');
  const selectedTargets = reaction === 'love' || wholeLook
    ? [...itemIds]
    : [...new Set(requestedTargets.filter((id) => itemIds.has(id)))];
  if (reaction !== 'love' && selectedTargets.length === 0) {
    return Response.json({ error: 'Tap what made it miss.' }, { status: 400 });
  }

  // Retrying a confirmed request after a dropped connection must not learn twice.
  async function alreadySaved(saved: FeedbackRow) {
    const same = saved.reaction === reaction && (saved.note ?? '') === note
      && JSON.stringify((JSON.parse(saved.target_item_ids_json) as string[]).sort()) === JSON.stringify([...selectedTargets].sort());
    if (!same) return Response.json({ error: 'A different reaction was already saved.' }, { status: 409 });
    return Response.json({ ok: true, alreadySaved: true, learnedFrom: selectedTargets, memory: await getInspirationMemory(sessionId) });
  }
  if (existing) return alreadySaved(existing);

  const now = Date.now();
  const selectedSet = new Set(selectedTargets);
  const statements: D1PreparedStatement[] = [
    db.prepare(
      'INSERT INTO inspiration_feedback (session_id, recommendation_id, edit_id, reaction, target_item_ids_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(sessionId, recommendationId, editId, reaction, JSON.stringify(selectedTargets), note || null, now),
  ];

  for (const item of edit.items) {
    const selected = selectedSet.has(item.id);
    if (!selected) continue;
    for (const signal of feedbackSignals(item, reaction, note, wholeLook)) {
      statements.push(db.prepare(
        'INSERT INTO preference_signals (session_id, recommendation_id, feature_type, feature_value, weight_delta, reaction, target_item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(sessionId, recommendationId, signal.type, signal.value, signal.delta, reaction, item.id, now));
    }
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const saved = await db.prepare('SELECT reaction, target_item_ids_json, note FROM inspiration_feedback WHERE session_id = ? AND recommendation_id = ? AND edit_id = ? LIMIT 1')
      .bind(sessionId, recommendationId, editId).first<FeedbackRow>();
    if (saved) return alreadySaved(saved);
    throw error;
  }
  await recordEvent('inspiration_feedback', { recommendationId, editId, reaction, targetItemIds: selectedTargets, note: note || null, confirmed: true, actorRole: scope.actorRole, mode: scope.mode }, sessionId);
  const memory = await getInspirationMemory(sessionId);
  return Response.json({ ok: true, learnedFrom: selectedTargets, memory });
}
