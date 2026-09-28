import demoProfile from '@/data/demo/profile.json';
import { describeAdjustments, learnFit } from '@/lib/fit/model';
import type { FitProfile, Outcome } from '@/lib/fit/types';
import { ensureSchema, ensureUser, insertOutcome, loadCatalog, loadOutcomes, loadProfile, saveProfile, seedDemoCatalog } from '@/lib/server/db';
import { viewer } from '@/lib/server/session';
import { InputError } from '@/lib/server/validate';

export async function seedDemoUser(userId: string) {
  await saveProfile(userId, { body: demoProfile.body, references: demoProfile.references as FitProfile['references'] });
  for (const outcome of demoProfile.outcomes as Outcome[]) await insertOutcome(userId, { ...outcome, id: `${outcome.id}-${userId}` }, null);
}

export async function userContext(request: Request) {
  const who = await viewer(request);
  if (!who) return null;
  await ensureSchema();
  await ensureUser(who.userId);
  if (who.demo) await seedDemoCatalog();
  let profile = await loadProfile(who.userId);
  if (!profile && who.demo) { await seedDemoUser(who.userId); profile = await loadProfile(who.userId); }
  profile ??= { body: {}, references: [] };
  const [{ products, charts }, outcomes] = await Promise.all([loadCatalog(who.demo ? ['demo'] : ['import']), loadOutcomes(who.userId)]);
  const learned = learnFit(profile, outcomes, charts, products);
  return { ...who, profile, outcomes, products, charts, learned };
}

export type UserContext = NonNullable<Awaited<ReturnType<typeof userContext>>>;

export function profileSummary(context: UserContext) {
  return {
    userId: context.userId,
    demo: context.demo,
    body: context.profile.body,
    references: context.profile.references,
    adjustments: describeAdjustments(context.learned),
    lengthNotes: context.learned.lengthNotes,
    outcomes: [...context.outcomes].reverse(),
    brands: [...new Set([...context.products.map(p => p.brand), ...context.charts.map(c => c.brand)])].sort(),
    productCount: context.products.length,
  };
}

export async function handle(request: Request, run: (context: UserContext) => Promise<Response>) {
  try {
    const context = await userContext(request);
    if (!context) return Response.json({ error: 'Enter your access code.' }, { status: 401 });
    return await run(context);
  } catch (error) {
    if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
    console.error('[angie]', error);
    return Response.json({ error: 'Something went wrong. Nothing was saved.' }, { status: 500 });
  }
}

export async function body(request: Request) {
  try { return await request.json(); } catch { throw new InputError('Send JSON.'); }
}
