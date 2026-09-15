import candidates from '@/data/candidates.json';
import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, FREEZE_ID, SESSION_ID } from '@/lib/persistence';

const validRatings = new Set(['would', 'maybe', 'no']);
const expectedIds = new Set(candidates.map((candidate) => candidate.id));

type SubmittedRating = {
  candidateId?: unknown;
  rating?: unknown;
  reason?: unknown;
  note?: unknown;
};

function normalizeRatings(value: unknown) {
  if (!Array.isArray(value) || value.length !== expectedIds.size) {
    throw new Error(`Exactly ${expectedIds.size} blind ratings are required.`);
  }

  const seen = new Set<string>();
  const ratings = value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Every blind rating must be an object.');
    const item = raw as SubmittedRating;
    const candidateId = String(item.candidateId ?? '');
    const rating = String(item.rating ?? '');
    const reason = item.reason ? String(item.reason).slice(0, 80) : null;
    const note = item.note ? String(item.note).slice(0, 300) : null;

    if (!expectedIds.has(candidateId)) throw new Error(`Unknown candidate: ${candidateId || '(missing)'}.`);
    if (seen.has(candidateId)) throw new Error(`Duplicate candidate: ${candidateId}.`);
    if (!validRatings.has(rating)) throw new Error(`Invalid rating for ${candidateId}: ${rating || '(missing)'}.`);
    seen.add(candidateId);
    return { candidateId, rating, reason, note };
  });

  const missing = [...expectedIds].filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`Missing candidates: ${missing.join(', ')}.`);
  return ratings;
}

export async function POST(request: Request) {
  if (!requireRole(request, ['admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  let ratings: ReturnType<typeof normalizeRatings>;
  try {
    ratings = normalizeRatings((body as { ratings?: unknown }).ratings);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid blind ratings.' }, { status: 400 });
  }

  await ensureSchema();
  await ensureSession();
  const db = database();
  const freeze = await db.prepare('SELECT id FROM ranking_freezes WHERE id = ?').bind(FREEZE_ID).first();
  if (!freeze) {
    return Response.json({ error: 'Blind-label import refused: freeze rankings A and B first.' }, { status: 409 });
  }

  const existing = await db.prepare('SELECT COUNT(*) AS count FROM blind_ratings WHERE session_id = ?').bind(SESSION_ID).first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) {
    return Response.json({ error: 'Blind labels were already imported. The frozen experiment cannot be overwritten.' }, { status: 409 });
  }

  const now = Date.now();
  await db.batch([
    ...ratings.map((item) => db.prepare(
      'INSERT INTO blind_ratings (session_id, candidate_id, rating, reason, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(SESSION_ID, item.candidateId, item.rating, item.reason, item.note, now, now)),
    db.prepare('UPDATE ranking_freezes SET blind_labels_seen = 1 WHERE id = ?').bind(FREEZE_ID),
    db.prepare('INSERT INTO events (session_id, type, payload, created_at) VALUES (?, ?, ?, ?)').bind(
      SESSION_ID,
      'blind_labels_imported',
      JSON.stringify({ count: ratings.length, freezeId: FREEZE_ID }),
      now,
    ),
  ]);

  return Response.json({ ok: true, imported: ratings.length, freezeId: FREEZE_ID });
}
