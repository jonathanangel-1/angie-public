import { guessCategory, rankProducts } from '@/lib/match/rank';
import { insertSearch } from '@/lib/server/db';
import { body, handle } from '@/lib/server/context';
import { category as parseCategory, InputError, parseFeatures } from '@/lib/server/validate';

// The browser sends a compact image descriptor, never the photo itself.
export function POST(request: Request) {
  return handle(request, async context => {
    const input = await body(request) as { features?: unknown; category?: unknown; searchId?: unknown };
    const features = parseFeatures(input.features);
    if (!context.products.length) throw new InputError('No catalog yet. Import one with npm run catalog:import (see README).');
    const guess = guessCategory(features, context.products);
    const category = input.category && input.category !== 'auto' ? parseCategory(input.category) : guess.category;
    const results = rankProducts(features, category, context.products, context.profile, context.learned, context.charts);
    const searchId = typeof input.searchId === 'string' && /^[\w-]{1,60}$/.test(input.searchId) ? input.searchId : crypto.randomUUID();
    if (searchId !== input.searchId) await insertSearch(context.userId, { id: searchId, category, colorName: features.colorName, features, resultIds: results.map(r => r.product.id) });
    return Response.json({
      searchId,
      query: { colorName: features.colorName, category, guessedCategory: guess.category, guessConfidence: Math.round(guess.confidence * 100) / 100 },
      results,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}
