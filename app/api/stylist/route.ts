import { requireRole } from '@/lib/auth';
import { database, ensureSchema, ensureSession, recordEvent, SESSION_ID } from '@/lib/persistence';
import { buildStylistResponse, type FeedbackSignal, type StyleReaction } from '@/lib/stylist';

type FeedbackRow = {
  reaction: string;
  target_item_ids_json: string;
};

function parseFeedback(rows: FeedbackRow[]): FeedbackSignal[] {
  return rows.flatMap((row) => {
    if (!['love', 'close', 'no'].includes(row.reaction)) return [];
    try {
      const targets = JSON.parse(row.target_item_ids_json);
      if (!Array.isArray(targets)) return [];
      return [{ reaction: row.reaction as StyleReaction, targetItemIds: targets.map(String) }];
    } catch {
      return [];
    }
  });
}

export async function POST(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const prompt = String(body.prompt ?? '').trim().slice(0, 600);

  await ensureSchema();
  await ensureSession();
  const rows = await database().prepare(
    'SELECT reaction, target_item_ids_json FROM stylist_feedback WHERE session_id = ? ORDER BY created_at ASC',
  ).bind(SESSION_ID).all<FeedbackRow>();
  const feedback = parseFeedback(rows.results);
  const response = buildStylistResponse(prompt, feedback);
  await recordEvent('stylist_requested', { request: response.request, intent: response.intent, lookIds: response.looks.map((look) => look.id) });
  return Response.json(response);
}
