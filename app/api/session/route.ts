import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, recordEvent, SESSION_ID } from '@/lib/persistence';

const validStages = new Set(['questions', 'profile', 'complete']);

export async function GET(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  await ensureSession();

  const db = database();
  const storedSession = await db.prepare('SELECT id, participant_name, stage, started_at, updated_at, completed_at FROM sessions WHERE id = ?').bind(SESSION_ID).first();
  // Sessions that reached the retired in-app blind review should resume at the
  // frozen-profile checkpoint instead of restarting the questions.
  const session = storedSession?.stage === 'blind' ? { ...storedSession, stage: 'profile' } : storedSession;
  const answerRows = await db.prepare('SELECT question_id, answer, note, updated_at FROM answers WHERE session_id = ? ORDER BY created_at').bind(SESSION_ID).all();

  return Response.json({ session, answers: answerRows.results });
}

export async function PATCH(request: Request) {
  if (!requireRole(request, ['participant'])) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const stage = String(body.stage ?? '');
  if (!validStages.has(stage)) return Response.json({ error: 'Invalid stage' }, { status: 400 });

  await ensureSchema();
  await ensureSession();
  const now = Date.now();
  await database().prepare('UPDATE sessions SET stage = ?, updated_at = ?, completed_at = ? WHERE id = ?')
    .bind(stage, now, stage === 'complete' ? now : null, SESSION_ID).run();
  await recordEvent('stage_changed', { stage });
  return Response.json({ ok: true, stage });
}
