import type { Candidate, Slot } from '@/lib/look/types';
import { features, violatesNever } from '@/lib/taste/features';
import { suggestSize, type SizeSuggestion } from '@/lib/taste/size';
import { FIT_REASONS, type Purchase, type TasteState } from '@/lib/taste/types';

// Fictional swatches in the onboarding quiz, with the features a reaction teaches.
export const QUIZ_SWATCHES: Array<{ id: string; label: string; image: string; features: string[] }> = [
  { id: 'q-wide-navy', label: 'Navy wide-leg trousers', image: '/demo/quiz/q-wide-navy.svg', features: ['style:wide-leg', 'color:navy', 'style:tailored'] },
  { id: 'q-bodycon-red', label: 'Red bodycon mini', image: '/demo/quiz/q-bodycon-red.svg', features: ['style:bodycon', 'style:mini', 'color:red'] },
  { id: 'q-slip-rust', label: 'Rust slip midi', image: '/demo/quiz/q-slip-rust.svg', features: ['style:midi', 'fabric:satin', 'color:rust'] },
  { id: 'q-leather-black', label: 'Black leather jacket', image: '/demo/quiz/q-leather-black.svg', features: ['fabric:leather', 'color:black'] },
  { id: 'q-crop-pink', label: 'Pink crop top', image: '/demo/quiz/q-crop-pink.svg', features: ['style:cropped', 'color:pink'] },
  { id: 'q-knit-cream', label: 'Cream relaxed knit', image: '/demo/quiz/q-knit-cream.svg', features: ['fabric:knit', 'color:cream', 'style:relaxed'] },
];

// Assumed baseline for online apparel returns before we know her.
const BASE_RETURN_RISK = 0.25;
const WEIGHTS = { visual: 0.45, taste: 0.25, keep: 0.2, budget: 0.1 };

// Feature weights from every signal, each with a stated trust level: what she
// kept counts more than what she said she loved; a fit return teaches size, not taste.
export function learnWeights(state: TasteState) {
  const w = new Map<string, number>();
  const add = (fs: string[], delta: number) => { for (const f of fs) w.set(f, (w.get(f) || 0) + delta); };
  for (const [id, r] of Object.entries(state.quiz.imageReactions)) {
    const swatch = QUIZ_SWATCHES.find(s => s.id === id);
    if (swatch) add(swatch.features, r === 'love' ? 1 : -1);
  }
  for (const b of state.quiz.brandsLove) add([`brand:${b.toLowerCase()}`], 2);
  for (const r of state.reactions) {
    const fs = r.reaction === 'no' && r.reason && r.reason !== 'fit'
      ? r.features.filter(f => f.startsWith(r.reason === 'style' ? 'style:' : `${r.reason}:`))
      : r.features.filter(f => r.reaction === 'love' || !f.startsWith('brand:'));
    add(fs.length ? fs : r.features, r.reaction === 'love' ? 1 : -1);
  }
  for (const p of state.purchases) {
    const fs = features({ title: p.title, brand: p.brand, fabric: '', price: p.price ?? 100 });
    const trust = p.confidence;
    if (p.status === 'kept') add(fs, 2 * trust);
    else if (p.status === 'returned' && (p.returnReason === 'style' || p.returnReason === 'color')) add(fs.filter(f => !f.startsWith('brand:')), -1.5 * trust);
    else if (p.status === 'returned' && p.returnReason === 'quality') add([...fs.filter(f => f.startsWith('fabric:')), `brand:${p.brand.toLowerCase()}`], -1.5 * trust);
  }
  return w;
}

export function tasteScore(fs: string[], weights: Map<string, number>) {
  const total = fs.reduce((s, f) => s + (weights.get(f) || 0), 0);
  return { score: (1 + Math.tanh(total / 3)) / 2, drivers: fs.filter(f => Math.abs(weights.get(f) || 0) >= 0.9).sort((a, b) => Math.abs(weights.get(b)!) - Math.abs(weights.get(a)!)) };
}

// Chance she sends it back, from her own history first.
export function returnRisk(item: Candidate, fs: string[], purchases: Purchase[], size: SizeSuggestion) {
  const reasons: string[] = [];
  const atBrand = purchases.filter(p => p.brand.toLowerCase() === item.brand.toLowerCase() && p.status !== 'ordered');
  let risk = BASE_RETURN_RISK;
  if (atBrand.length) {
    const returned = atBrand.filter(p => p.status === 'returned').length;
    const rate = (returned + 0.5) / (atBrand.length + 2);
    risk = 0.4 * risk + 0.6 * rate;
    reasons.push(`${item.brand}: kept ${atBrand.length - returned} of ${atBrand.length}`);
  }
  const qualityFabrics = new Set(purchases.filter(p => p.status === 'returned' && p.returnReason === 'quality')
    .flatMap(p => features({ title: p.title, brand: p.brand, fabric: '', price: 100 }).filter(f => f.startsWith('fabric:'))));
  const badFabric = fs.find(f => qualityFabrics.has(f));
  if (badFabric) { risk += 0.15; reasons.push(`you returned ${badFabric.slice(7)} for quality`); }
  if (size.size === null) { risk += 0.12; reasons.push('size unclear'); }
  else if (size.confidence === 'low') { risk += 0.06; reasons.push('first order at this brand'); }
  else if (size.confidence === 'high') risk -= 0.06;
  if (item.rating !== null && (item.reviews ?? 0) >= 20) {
    if (item.rating < 4) { risk += 0.1; reasons.push(`rated ${item.rating.toFixed(1)}`); }
    else if (item.rating >= 4.6) risk -= 0.04;
  }
  const fitReturns = purchases.filter(p => p.status === 'returned' && FIT_REASONS.includes(p.returnReason!)).length;
  if (fitReturns >= 3 && size.confidence !== 'high') { risk += 0.05; reasons.push('fit is your most common return reason'); }
  return { risk: Math.max(0.05, Math.min(0.9, risk)), reasons };
}

export type RankedCandidate = Candidate & {
  score: number; taste: number; risk: number; size: SizeSuggestion;
  why: string[]; riskReasons: string[]; features: string[];
};

export function rankCandidates(candidates: Candidate[], slot: Slot, state: TasteState, limit = 6): { ranked: RankedCandidate[]; excluded: Array<{ title: string; brand: string; reason: string }> } {
  const weights = learnWeights(state);
  const avoid = new Set(state.quiz.brandsAvoid.map(b => b.toLowerCase()));
  const excluded: Array<{ title: string; brand: string; reason: string }> = [];
  const noAgain = new Set(state.reactions.filter(r => r.reaction === 'no').map(r => `${r.brand}|${r.title}`.toLowerCase()));
  const ranked: RankedCandidate[] = [];
  for (const c of candidates) {
    const fs = features(c);
    const never = violatesNever(c, state.quiz.neverWear);
    const budgetMax = state.quiz.budgetMax;
    const reason = avoid.has(c.brand.toLowerCase()) ? 'brand you avoid' : never ? `never wear: ${never}` : noAgain.has(`${c.brand}|${c.title}`.toLowerCase()) ? 'you said no'
      : budgetMax && c.price > budgetMax * 1.25 ? 'over budget' : null;
    if (reason) { excluded.push({ title: c.title, brand: c.brand, reason }); continue; }
    const taste = tasteScore(fs, weights);
    const size = suggestSize(c, slot, state.quiz, state.purchases);
    const { risk, reasons } = returnRisk(c, fs, state.purchases, size);
    const budget = !budgetMax || c.price <= budgetMax ? 1 : 0.3;
    const score = WEIGHTS.visual * c.visual + WEIGHTS.taste * taste.score + WEIGHTS.keep * (1 - risk) + WEIGHTS.budget * budget;
    const why = [`${Math.round(c.visual * 100)}% look-alike`, ...taste.drivers.slice(0, 2).map(f => `${weights.get(f)! > 0 ? 'you like' : 'you tend to skip'} ${f.split(':')[1]}`)];
    if (budget < 1) why.push('a bit over budget');
    ranked.push({ ...c, score: Math.round(score * 1000) / 1000, taste: Math.round(taste.score * 100) / 100, risk: Math.round(risk * 100) / 100, size, why, riskReasons: reasons, features: fs });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ranked: ranked.slice(0, limit), excluded };
}
