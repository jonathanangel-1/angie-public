import { features } from '@/lib/taste/features';
import type { Purchase, Reaction } from '@/lib/taste/types';
import { insertReaction, upsertPurchase } from '@/lib/server/db';
import { body, handle, tasteSummary, userContext } from '@/lib/server/context';
import { InputError, parseCandidate, parseGarment } from '@/lib/server/validate';

const NO_REASONS = ['style', 'color', 'price', 'fabric', 'fit'] as const;
const RETURN_REASONS = ['too-small', 'too-large', 'too-long', 'too-short', 'quality', 'style', 'color', 'other'] as const;

// love / no teach taste; bought / kept / returned build the purchase history
// that drives size and return risk.
export function POST(request: Request) {
  return handle(request, async context => {
    const input = await body(request) as Record<string, unknown>;
    const garment = parseGarment(input.garment), candidate = parseCandidate(input.candidate);
    const action = String(input.action), now = Date.now();
    const purchaseId = `fb-${candidate.id}`.slice(0, 100);
    if (action === 'love' || action === 'no') {
      const reason = NO_REASONS.includes(input.reason as typeof NO_REASONS[number]) ? input.reason as Reaction['reason'] : null;
      await insertReaction(context.userId, { id: crypto.randomUUID(), brand: candidate.brand, title: candidate.title, features: features(candidate), reaction: action, reason: action === 'no' ? reason : null, createdAt: now });
    } else if (['bought', 'kept', 'returned'].includes(action)) {
      const size = String(input.size || '').trim().slice(0, 12);
      if (!size) throw new InputError('Which size did you order?');
      const returnReason = action === 'returned' ? RETURN_REASONS.find(r => r === input.reason) : null;
      if (action === 'returned' && !returnReason) throw new InputError('Say why it went back.');
      const prior = context.state.purchases.find(p => p.id === purchaseId);
      const purchase: Purchase = { id: purchaseId, brand: candidate.brand, title: candidate.title, slot: garment.slot, size, status: action === 'bought' ? 'ordered' : action as Purchase['status'],
        returnReason: returnReason ?? null, price: candidate.price, source: 'feedback', confidence: 1, createdAt: prior?.createdAt ?? now };
      await upsertPurchase(context.userId, purchase);
    } else throw new InputError('Unknown action.');
    return Response.json(tasteSummary((await userContext(request))!));
  });
}
