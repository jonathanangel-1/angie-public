import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, recordEvent, SESSION_ID } from '@/lib/persistence';

export async function POST(request: Request) {
  if (!requireRole(request, ['participant'])) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const questionId = String(body.questionId ?? '').slice(0, 80);
  const answer = String(body.answer ?? '').slice(0, 120);
  const note = body.note ? String(body.note).slice(0, 500) : null;
  if (!questionId || !answer) return Response.json({ error: 'Missing answer' }, { status: 400 });

  await ensureSchema();
  await ensureSession();
  const now = Date.now();
  await database().prepare(
    'INSERT INTO answers (session_id, question_id, answer, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, question_id) DO UPDATE SET answer = excluded.answer, note = excluded.note, updated_at = excluded.updated_at',
  ).bind(SESSION_ID, questionId, answer, note, now, now).run();
  await recordEvent('answer_saved', { questionId, answer });
  return Response.json({ ok: true });
}
