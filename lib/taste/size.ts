import type { Slot } from '@/lib/look/types';
import type { Purchase, Quiz } from '@/lib/taste/types';

export type SizeSuggestion = { size: string | null; confidence: 'high' | 'medium' | 'low'; note: string };

const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
// Rough US women's equivalents, used only to translate between systems.
const LETTER_TO_NUMBER: Record<string, number> = { XXS: 0, XS: 2, S: 5, M: 8, L: 12, XL: 16, XXL: 20 };
const JEANS_TO_NUMBER: Record<number, number> = { 23: 0, 24: 0, 25: 0, 26: 2, 27: 4, 28: 6, 29: 8, 30: 10, 31: 12, 32: 14, 33: 16 };

export function normalizeSize(label: string): string {
  const l = label.trim().toUpperCase().replace(/\s+/g, ' ');
  const words: Record<string, string> = { 'XX-SMALL': 'XXS', 'X-SMALL': 'XS', 'EXTRA SMALL': 'XS', SMALL: 'S', MEDIUM: 'M', LARGE: 'L', 'X-LARGE': 'XL', 'EXTRA LARGE': 'XL', 'XX-LARGE': 'XXL', '2XL': 'XXL' };
  return words[l] || l.replace(/^US\s*/, '').split(/[ /(]/)[0];
}

function toNumber(size: string): number | null {
  const s = normalizeSize(size);
  if (s in LETTER_TO_NUMBER) return LETTER_TO_NUMBER[s];
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n >= 23 && n <= 34 ? JEANS_TO_NUMBER[n] ?? null : n;
}

function step(size: string, direction: 1 | -1): string {
  const s = normalizeSize(size);
  const i = LETTERS.indexOf(s);
  if (i >= 0) return LETTERS[Math.max(0, Math.min(LETTERS.length - 1, i + direction))];
  const n = Number(s);
  if (!Number.isFinite(n)) return size;
  return String(n >= 23 && n <= 34 ? n + direction : Math.max(0, n + 2 * direction));
}

// Pick the listed size closest to what she wears, across letter/number systems.
export function nearestListed(size: string, listed: string[]): { label: string; exact: boolean } | null {
  if (!listed.length) return null;
  const wanted = normalizeSize(size);
  const exact = listed.find(l => normalizeSize(l) === wanted);
  if (exact) return { label: exact, exact: true };
  const target = toNumber(size);
  if (target === null) return null;
  const scored = listed.map(l => ({ l, n: toNumber(l) })).filter((x): x is { l: string; n: number } => x.n !== null);
  if (!scored.length) return null;
  const best = scored.sort((a, b) => Math.abs(a.n - target) - Math.abs(b.n - target))[0];
  return Math.abs(best.n - target) <= 2 ? { label: best.l, exact: false } : null;
}

const quizKey = (slot: Slot, title: string): keyof Quiz['sizes'] =>
  slot === 'dress' ? 'dress' : slot === 'top' || slot === 'outerwear' ? 'top' : /jean|denim/i.test(title) ? 'jeans' : 'bottom';
const group = (slot: Slot | null) => (slot === null ? null : slot === 'top' || slot === 'outerwear' ? 'upper' : slot === 'dress' ? 'dress' : 'lower');

// A size from what she has actually kept or returned at this brand, else her
// stated size. No brand size chart is needed.
export function suggestSize(item: { brand: string; title: string; sizes: string[] }, slot: Slot, quiz: Quiz, purchases: Purchase[]): SizeSuggestion {
  // A record whose garment type is unknown says nothing about this item's size.
  const history = purchases.filter(p => p.slot !== null && p.brand.toLowerCase() === item.brand.toLowerCase() && group(p.slot) === group(slot) && p.size)
    .sort((a, b) => a.createdAt - b.createdAt);
  const kept = history.filter(p => p.status === 'kept').at(-1);
  const lastFit = history.filter(p => p.status === 'returned' && ['too-small', 'too-large'].includes(p.returnReason || '')).at(-1);
  let base: string | null = null, confidence: SizeSuggestion['confidence'] = 'low', why = '';
  if (lastFit && (!kept || lastFit.createdAt > kept.createdAt)) {
    base = step(lastFit.size, lastFit.returnReason === 'too-small' ? 1 : -1);
    confidence = 'medium';
    why = `You returned ${lastFit.size} at ${item.brand} as ${lastFit.returnReason!.replace('-', ' ')}, so one size ${lastFit.returnReason === 'too-small' ? 'up' : 'down'}.`;
  } else if (kept) {
    base = kept.size; confidence = kept.confidence >= 0.8 ? 'high' : 'medium';
    why = `You kept ${kept.size} at ${item.brand}${kept.source === 'email' ? ' (from your order emails)' : ''}.`;
  } else {
    const stated = quiz.sizes[quizKey(slot, item.title)];
    if (stated) { base = stated; why = `Your usual ${quizKey(slot, item.title)} size; nothing kept or returned at ${item.brand} in this category yet.`; }
  }
  if (!base) return { size: null, confidence: 'low', note: 'Add your usual sizes in My taste to get a suggestion.' };
  if (!item.sizes.length) return { size: normalizeSize(base), confidence: confidence === 'high' ? 'medium' : 'low', note: `${why} Sizes weren't listed; check the product page.` };
  const listed = nearestListed(base, item.sizes);
  if (!listed) return { size: null, confidence: 'low', note: `${why} ${normalizeSize(base)} isn't offered (${item.sizes.slice(0, 6).join(', ')}).` };
  const fit = slot === 'pants' || slot === 'skirt' ? quiz.fit.bottom : quiz.fit.top;
  const relaxed = fit === 'relaxed' || fit === 'oversized' || fit === 'wide' ? ' You like room: consider one size up if it runs slim.' : '';
  return listed.exact
    ? { size: listed.label, confidence, note: `${why}${relaxed}` }
    : { size: listed.label, confidence: 'low', note: `${why} Nearest listed size (different sizing system).${relaxed}` };
}
