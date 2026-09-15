import { inspirationScope } from '@/lib/inspiration-scope';
import { database, ensureSchema, ensureSession, recordEvent } from '@/lib/persistence';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { refreshedFit } from '@/lib/saved-looks';
import type { InspirationEdit } from '@/lib/inspiration-types';

const EVENT_TYPES = new Set(['ordered', 'tried', 'kept', 'returned', 'worn']);

export async function GET(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  const rows = await database().prepare(`SELECT o.*, r.edits_json FROM outcome_events o
    JOIN inspiration_recommendations r ON r.id = o.recommendation_id AND r.session_id = o.session_id
    WHERE o.session_id = ? AND o.id = (SELECT p.id FROM outcome_events p
      WHERE p.session_id = o.session_id AND p.recommendation_id = o.recommendation_id AND p.catalog_id = o.catalog_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 1)
    ORDER BY o.created_at DESC, o.id DESC LIMIT 100`).bind(scope.sessionId).all<{
      recommendation_id: string; edit_id: string; catalog_id: string; event_type: string; reason: string; created_at: number; edits_json: string;
    }>();
  const purchases = rows.results.flatMap(row => {
    const item = (JSON.parse(row.edits_json) as InspirationEdit[]).find(e => e.id === row.edit_id)?.items.find(i => i.catalogId === row.catalog_id);
    if (!item) return [];
    let detail: { size?: string; fit?: string; note?: string } = {};
    try { detail = JSON.parse(row.reason); } catch { /* Legacy free-text outcome. */ }
    return [{ recommendationId: row.recommendation_id, editId: row.edit_id, item, eventType: row.event_type, size: detail.size || '', fit: detail.fit || 'unknown', reason: detail.note || '', createdAt: row.created_at }];
  });
  return Response.json({ purchases }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const recommendationId = String(body.recommendationId ?? '').trim().slice(0, 80);
  const editId = String(body.editId ?? '').trim().slice(0, 80);
  const catalogId = String(body.catalogId ?? '').trim().slice(0, 100);
  const eventType = String(body.eventType ?? '').trim();
  const reason = String(body.reason ?? '').trim().slice(0, 800);
  const size = String(body.size ?? '').trim().slice(0, 20);
  const fit = String(body.fit ?? 'unknown');
  if (!['unknown','fits','too-small','too-large','too-short','too-long'].includes(fit)
    || fit !== 'unknown' && (!size || !['tried','kept','returned','worn'].includes(eventType)))
    return Response.json({ error: 'Choose the size you tried and how it fitted.' }, { status: 400 });
  if (!recommendationId || !catalogId || !EVENT_TYPES.has(eventType)) return Response.json({ error: 'Incomplete outcome.' }, { status: 400 });

  await ensureSchema();
  await ensureSession(scope.sessionId, scope.mode === 'test' ? 'Style QA' : 'Angie');
  const db = database();
  const stored = await db.prepare('SELECT edits_json FROM inspiration_recommendations WHERE id = ? AND session_id = ?')
    .bind(recommendationId, scope.sessionId).first<{ edits_json: string }>();
  const edits = stored ? JSON.parse(stored.edits_json) as InspirationEdit[] : [];
  if (!edits.some(edit => edit.id === editId && edit.items.some(item => item.catalogId === catalogId)))
    return Response.json({ error: 'That product was not shown in this look.' }, { status: 404 });
  const detail = JSON.stringify({ version: 1, size, fit, note: reason });
  const previous = await db.prepare('SELECT reason, event_type FROM outcome_events WHERE session_id = ? AND recommendation_id = ? AND catalog_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .bind(scope.sessionId, recommendationId, catalogId).first<{reason:string;event_type:string}>();
  const item=edits.find(edit=>edit.id===editId)!.items.find(item=>item.catalogId===catalogId)!;
  if (previous?.reason === detail && previous.event_type === eventType) return Response.json({ok:true, duplicate:true,guidance:refreshedFit(item,await getInspirationMemory(scope.sessionId))});
  const createdAt = Date.now();
  await db.prepare(
    'INSERT INTO outcome_events (session_id, recommendation_id, edit_id, catalog_id, event_type, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(scope.sessionId, recommendationId, editId || null, catalogId, eventType, detail, createdAt).run();
  await recordEvent('inspiration_outcome', { recommendationId, editId: editId || null, catalogId, eventType, reason: reason || null, actorRole: scope.actorRole, mode: scope.mode }, scope.sessionId);
  return Response.json({ ok: true, createdAt,guidance:refreshedFit(item,await getInspirationMemory(scope.sessionId)) });
}
