import { upsertPurchase } from '@/lib/server/db';
import { body, handle, tasteSummary, userContext } from '@/lib/server/context';
import { parsePurchase } from '@/lib/server/validate';

export function POST(request: Request) {
  return handle(request, async context => {
    const input = await body(request) as { purchases?: unknown[] };
    const purchases = (input.purchases || []).slice(0, 200).map(p => parsePurchase(p, 'email', Date.now()));
    for (const p of purchases) await upsertPurchase(context.userId, { ...p, confidence: Math.min(p.confidence, 0.9) });
    return Response.json({ imported: purchases.length, summary: tasteSummary((await userContext(request))!) });
  });
}
