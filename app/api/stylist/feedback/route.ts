import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, recordEvent, SESSION_ID } from '@/lib/persistence';

const validReactions = new Set(['love', 'close', 'no']);

export async function GET(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  await ensureSession();
  const rows = await database().prepare(
    'SELECT request, look_id, reaction, item_ids_json, target_item_ids_json, note, created_at FROM stylist_feedback WHERE session_id = ? ORDER BY created_at DESC LIMIT 30',
  ).bind(SESSION_ID).all();
  return Response.json({ feedback: rows.results });
}

export async function POST(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reaction = String(body.reaction ?? '');
  const requestText = String(body.request ?? '').trim().slice(0, 600);
  const lookId = String(body.lookId ?? '').trim().slice(0, 500);
  const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds.map(String).slice(0, 12) : [];
  const requestedTargets: string[] = Array.isArray(body.targetItemIds) ? body.targetItemIds.map(String).slice(0, 12) : [];
  const targetItemIds = reaction === 'love' || requestedTargets.includes('whole-look') ? itemIds : requestedTargets;
  const note = String(body.note ?? '').trim().slice(0, 800);

  if (!validReactions.has(reaction) || !requestText || !lookId || itemIds.length === 0) {
    return Response.json({ error: 'Incomplete feedback.' }, { status: 400 });
  }
  if (reaction !== 'love' && targetItemIds.length === 0) {
    return Response.json({ error: 'Choose what changed your reaction.' }, { status: 400 });
  }

  await ensureSchema();
  await ensureSession();
  const now = Date.now();
  await database().prepare(
    'INSERT INTO stylist_feedback (session_id, request, look_id, reaction, item_ids_json, target_item_ids_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(SESSION_ID, requestText, lookId, reaction, JSON.stringify(itemIds), JSON.stringify(targetItemIds), note || null, now).run();
  await recordEvent('stylist_feedback', { lookId, reaction, targetItemIds, note: note || null });
  return Response.json({ ok: true, learnedFrom: targetItemIds });
}
