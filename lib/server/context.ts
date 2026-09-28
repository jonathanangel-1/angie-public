import { learnWeights } from '@/lib/taste/model';
import type { Quiz } from '@/lib/taste/types';
import { ensureSchema, ensureUser, loadState, saveQuiz } from '@/lib/server/db';
import { viewer } from '@/lib/server/session';
import { InputError } from '@/lib/server/validate';

// Fictional demo participant's answers to the day-one quiz.
export const DEMO_QUIZ: Quiz = {
  sizes: { top: 'M', bottom: '8', dress: 'M', jeans: '28' },
  fit: { top: 'relaxed', bottom: 'wide' },
  neverWear: ['bodycon', 'low rise'],
  budgetMax: 250,
  brandsLove: ['Demo Atelier'],
  brandsAvoid: ['Rue Minuit'],
  imageReactions: { 'q-wide-navy': 'love', 'q-bodycon-red': 'no', 'q-leather-black': 'love', 'q-crop-pink': 'no' },
};

export async function userContext(request: Request) {
  const who = await viewer(request);
  if (!who) return null;
  await ensureSchema();
  await ensureUser(who.userId);
  let state = await loadState(who.userId);
  if (!state.hasQuiz && who.demo) { await saveQuiz(who.userId, DEMO_QUIZ); state = await loadState(who.userId); }
  return { ...who, state };
}

export type UserContext = NonNullable<Awaited<ReturnType<typeof userContext>>>;

export function tasteSummary(context: UserContext) {
  const weights = [...learnWeights(context.state)].filter(([, w]) => Math.abs(w) >= 0.5).sort((a, b) => b[1] - a[1]);
  const brands = new Map<string, { kept: number; returned: number }>();
  for (const p of context.state.purchases) {
    if (p.status === 'ordered') continue;
    const b = brands.get(p.brand) || { kept: 0, returned: 0 };
    b[p.status === 'kept' ? 'kept' : 'returned']++;
    brands.set(p.brand, b);
  }
  return {
    userId: context.userId, demo: context.demo, hasQuiz: context.state.hasQuiz, quiz: context.state.quiz,
    purchases: [...context.state.purchases].reverse(), reactions: [...context.state.reactions].reverse(),
    likes: weights.filter(([, w]) => w > 0).slice(0, 8).map(([f, w]) => ({ feature: f, weight: Math.round(w * 10) / 10 })),
    dislikes: weights.filter(([, w]) => w < 0).reverse().slice(0, 8).map(([f, w]) => ({ feature: f, weight: Math.round(w * 10) / 10 })),
    brands: [...brands].map(([brand, s]) => ({ brand, ...s })),
  };
}

export async function handle(request: Request, run: (context: UserContext) => Promise<Response>) {
  try {
    const context = await userContext(request);
    if (!context) return Response.json({ error: 'Enter your access code.' }, { status: 401 });
    return await run(context);
  } catch (error) {
    if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : '';
    if (/^Demo mode only|^GARMENT_SERVICE_URL|^Garment service/.test(message)) return Response.json({ error: message }, { status: 422 });
    console.error('[angie]', error);
    return Response.json({ error: 'Something went wrong. Nothing was saved.' }, { status: 500 });
  }
}

export async function body(request: Request) {
  try { return await request.json(); } catch { throw new InputError('Send JSON.'); }
}
