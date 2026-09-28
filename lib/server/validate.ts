import type { Candidate, Garment, Slot } from '@/lib/look/types';
import { SLOTS } from '@/lib/look/types';
import { NEVER_OPTIONS, type Never, type Purchase, type Quiz, type ReturnReason } from '@/lib/taste/types';

export class InputError extends Error {}

const record = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const list = (v: unknown, max = 20) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => text(x, 60)).filter(Boolean).slice(0, max);
const REASONS: ReturnReason[] = ['too-small', 'too-large', 'too-long', 'too-short', 'quality', 'style', 'color', 'other'];

export const slot = (v: unknown): Slot => {
  if (!SLOTS.includes(v as Slot)) throw new InputError('Unknown garment type.');
  return v as Slot;
};

export function parseQuiz(input: unknown): Quiz {
  const raw = record(input);
  const sizes = record(raw.sizes), fit = record(raw.fit), m = record(raw.measurements);
  const size = (v: unknown) => text(v, 8).toUpperCase() || undefined;
  const inches = (v: unknown) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? undefined : n >= 18 && n <= 75 ? n : (() => { throw new InputError('Measurements must be in inches, 18–75.'); })(); };
  const budget = raw.budgetMax === '' || raw.budgetMax == null ? undefined : Number(raw.budgetMax);
  if (budget !== undefined && (!Number.isFinite(budget) || budget < 10 || budget > 5000)) throw new InputError('Budget must be between $10 and $5,000.');
  const reactions = Object.fromEntries(Object.entries(record(raw.imageReactions)).filter(([k, v]) => /^q-[a-z-]+$/.test(k) && (v === 'love' || v === 'no')).slice(0, 20)) as Quiz['imageReactions'];
  return {
    sizes: { top: size(sizes.top), bottom: size(sizes.bottom), dress: size(sizes.dress), jeans: size(sizes.jeans) },
    measurements: { bust: inches(m.bust), waist: inches(m.waist), hips: inches(m.hips) },
    fit: { top: ['fitted', 'relaxed', 'oversized'].includes(String(fit.top)) ? fit.top as Quiz['fit']['top'] : undefined, bottom: ['fitted', 'straight', 'wide'].includes(String(fit.bottom)) ? fit.bottom as Quiz['fit']['bottom'] : undefined },
    neverWear: list(raw.neverWear).filter((n): n is Never => (NEVER_OPTIONS as readonly string[]).includes(n)),
    budgetMax: budget, brandsLove: list(raw.brandsLove), brandsAvoid: list(raw.brandsAvoid), imageReactions: reactions,
  };
}

export function parseCandidate(input: unknown): Candidate {
  const r = record(input);
  const url = text(r.url, 800);
  if (!/^https:\/\//.test(url)) throw new InputError('Product link must be https.');
  return { id: text(r.id, 200), title: text(r.title, 200), brand: text(r.brand, 80), url, image: text(r.image, 800), price: Number(r.price) || 0, currency: text(r.currency, 3) || 'USD',
    sizes: list(r.sizes, 40), fabric: text(r.fabric, 200), rating: r.rating == null ? null : Number(r.rating), reviews: r.reviews == null ? null : Number(r.reviews),
    sources: list(r.sources, 5), visual: Math.max(0, Math.min(1, Number(r.visual) || 0)) };
}

export function parseGarment(input: unknown): Garment {
  const r = record(input), a = record(r.attributes);
  return { id: text(r.id, 80), slot: slot(r.slot), query: text(r.query, 200), crop: '',
    attributes: { type: text(a.type, 60), color: text(a.color, 40), pattern: text(a.pattern, 40), fabric: text(a.fabric, 40), vibe: text(a.vibe, 40), length: text(a.length, 20) || undefined } };
}

export function parsePurchase(input: unknown, source: Purchase['source'], now: number): Purchase {
  const r = record(input);
  const status = ['ordered', 'kept', 'returned'].includes(String(r.status)) ? r.status as Purchase['status'] : null;
  if (!status) throw new InputError('Status must be ordered, kept or returned.');
  const brand = text(r.brand, 80), title = text(r.title, 200), size = text(r.size, 12);
  if (!brand || !title || !size) throw new InputError('Brand, item and size are required.');
  const reason = REASONS.includes(r.returnReason as ReturnReason) ? r.returnReason as ReturnReason : null;
  if (status === 'returned' && !reason) throw new InputError('Say why it went back.');
  return { id: text(r.id, 100) || crypto.randomUUID(), brand, title, slot: r.slot ? slot(r.slot) : null, size, status, returnReason: status === 'returned' ? reason : null,
    price: r.price == null ? null : Number(r.price) || null, source, confidence: Math.max(0.1, Math.min(1, Number(r.confidence) || 1)), createdAt: Number(r.createdAt) || now };
}
