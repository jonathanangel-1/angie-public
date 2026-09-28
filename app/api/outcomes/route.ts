import { describeAdjustments, learnFit, recommendSize } from '@/lib/fit/model';
import type { Outcome } from '@/lib/fit/types';
import { deleteOutcome, insertOutcome, searchBelongsTo } from '@/lib/server/db';
import { body, handle, profileSummary } from '@/lib/server/context';
import { InputError, parseOutcome } from '@/lib/server/validate';

export function GET(request: Request) {
  return handle(request, async context => Response.json({ outcomes: profileSummary(context).outcomes }, { headers: { 'Cache-Control': 'private, no-store' } }));
}

// A keep/return is appended to the log; the fit profile is replayed from the
// log, so the response can show exactly what this one outcome changed.
export function POST(request: Request) {
  return handle(request, async context => {
    const { searchId, ...parsed } = parseOutcome(await body(request), Date.now());
    const product = parsed.productId ? context.products.find(p => p.id === parsed.productId) : undefined;
    if (parsed.productId && !product) throw new InputError('That product is not in the catalog.');
    if (product && !product.sizes.includes(parsed.size)) throw new InputError(`${product.name} does not come in ${parsed.size}.`);
    const outcome: Outcome = { ...parsed, id: crypto.randomUUID(), ...(product ? { brand: product.brand, category: product.category } : {}) };
    await insertOutcome(context.userId, outcome, searchId && await searchBelongsTo(context.userId, searchId) ? searchId : null);

    const outcomes = [...context.outcomes, outcome];
    const learned = learnFit(context.profile, outcomes, context.charts, context.products);
    const before = describeAdjustments(context.learned), after = describeAdjustments(learned);
    const changed = after.filter(a => !before.some(b => b.text === a.text));
    const recommendation = product ? {
      productId: product.id,
      before: recommendSize(product, context.profile, context.learned, context.charts),
      after: recommendSize(product, context.profile, learned, context.charts),
    } : null;
    return Response.json({ outcome, changed, recommendation, profile: profileSummary({ ...context, outcomes, learned }) });
  });
}

export function DELETE(request: Request) {
  return handle(request, async context => {
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!(await deleteOutcome(context.userId, id))) return Response.json({ error: 'Not found.' }, { status: 404 });
    const outcomes = context.outcomes.filter(o => o.id !== id);
    return Response.json({ profile: profileSummary({ ...context, outcomes, learned: learnFit(context.profile, outcomes, context.charts, context.products) }) });
  });
}
