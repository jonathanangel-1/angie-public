import { inspirationScope } from '@/lib/inspiration-scope';
import { database, ensureSchema } from '@/lib/persistence';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { refreshSavedEdits } from '@/lib/saved-looks';
import type { InspirationEdit } from '@/lib/inspiration-types';

// A swap uses another checked candidate from this exact inspiration, never a
// client-supplied product. Keep previous versions immutable for feedback.
export async function POST(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body || Array.isArray(body) || typeof body !== 'object') return Response.json({ error: 'Choose a replacement.' }, { status: 400 });
  if (![body.recommendationId, body.editId, body.itemId, body.replacementId].every(v => typeof v === 'string' && v.length < 150))
    return Response.json({ error: 'Choose a replacement.' }, { status: 400 });
  await ensureSchema();
  const db = database();
  const row = await db.prepare('SELECT edits_json FROM inspiration_recommendations WHERE id = ? AND session_id = ?').bind(body.recommendationId, scope.sessionId).first<{ edits_json: string }>();
  if (!row) return Response.json({ error: 'Look not found.' }, { status: 404 });
  const edits = JSON.parse(row.edits_json) as InspirationEdit[];
  const base = edits.find(e => e.id === body.editId);
  const item = base?.items.find(i => i.id === body.itemId);
  const replacement = edits.flatMap(e => e.items).find(i => i.id === body.replacementId);
  if (!base || !item || !replacement || replacement.slot !== item.slot || replacement.catalogId === item.catalogId)
    return Response.json({ error: 'That replacement is not available for this piece.' }, { status: 400 });
  const items = base.items.map(i => i.id === item.id ? replacement : i);
  // Repeated submissions resolve to the same saved version.
  const existing = edits.find(e => e.items.length === items.length && e.items.every((i, n) => i.catalogId === items[n].catalogId));
  if (existing) return Response.json({ edit: refreshSavedEdits([existing], await getInspirationMemory(scope.sessionId))[0] });
  if (edits.length >= 30) return Response.json({ error: 'This look has reached its saved-version limit. Start a new look.' }, { status: 409 });
  const edited: InspirationEdit = { ...base, id: `swap-${crypto.randomUUID()}`, title: 'Your edit', items,
    confidence: items.every(i => i.sizeConfidence === 'High') ? 'High' : 'Low' };
  const result = await db.prepare('UPDATE inspiration_recommendations SET edits_json = ? WHERE id = ? AND session_id = ? AND edits_json = ?')
    .bind(JSON.stringify([...edits, edited]), body.recommendationId, scope.sessionId, row.edits_json).run();
  if (!result.meta.changes) return Response.json({ error: 'This look changed. Reopen it from Saved looks and try again.' }, { status: 409 });
  return Response.json({ edit: refreshSavedEdits([edited], await getInspirationMemory(scope.sessionId))[0] });
}
