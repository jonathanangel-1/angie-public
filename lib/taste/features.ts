import type { Candidate } from '@/lib/look/types';
import type { Never } from '@/lib/taste/types';

const COLORS = ['black', 'white', 'cream', 'ivory', 'beige', 'camel', 'tan', 'brown', 'grey', 'gray', 'navy', 'blue', 'red', 'burgundy', 'pink', 'coral', 'orange', 'yellow', 'green', 'olive', 'sage', 'purple', 'lilac', 'denim'];
const FABRICS: Array<[string, RegExp]> = [
  ['polyester', /polyester/], ['cotton', /cotton/], ['linen', /linen/], ['silk', /\bsilk\b/], ['satin', /satin/], ['wool', /\bwool\b|merino|cashmere/],
  ['leather', /(?<!faux |vegan )leather/], ['faux leather', /faux leather|vegan leather|pu leather/], ['viscose', /viscose|rayon/], ['denim', /denim|jean/], ['knit', /\bknit/],
];
const STYLES = ['crop', 'bodycon', 'mini', 'midi', 'maxi', 'wide-leg', 'straight', 'skinny', 'slim', 'oversized', 'ruffle', 'sheer', 'strapless', 'low rise', 'high rise', 'wrap', 'fringe', 'sequin', 'pleated', 'floral', 'striped', 'plaid', 'leopard', 'cargo', 'tailored', 'fitted', 'relaxed'];

// Plain-text features of a product. They are shared by the taste model, the
// never-wear filter, and the explanation she sees.
export function features(item: Pick<Candidate, 'title' | 'brand' | 'fabric' | 'price'>): string[] {
  const text = `${item.title} ${item.fabric}`.toLowerCase().replace(/wide leg/g, 'wide-leg').replace(/low-rise/g, 'low rise').replace(/high-rise/g, 'high rise');
  const out = new Set<string>();
  if (item.brand) out.add(`brand:${item.brand.toLowerCase()}`);
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`).test(text)) out.add(`color:${c === 'gray' ? 'grey' : c}`);
  for (const [name, pattern] of FABRICS) if (pattern.test(text)) out.add(`fabric:${name}`);
  for (const s of STYLES) if (text.includes(s)) out.add(`style:${s === 'crop' ? 'cropped' : s}`);
  out.add(`price:${item.price < 50 ? 'under-50' : item.price < 120 ? '50-120' : item.price < 250 ? '120-250' : '250-plus'}`);
  return [...out];
}

const NEVER: Record<Never, RegExp> = {
  'crop tops': /\bcrop(ped)?\b/, bodycon: /bodycon/, 'low rise': /low[- ]rise/, 'mini length': /\bmini\b/, sheer: /sheer|\bmesh\b/,
  polyester: /polyester/, 'animal print': /leopard|zebra|snake|animal print|cheetah/, ruffles: /ruffle/, strapless: /strapless|bandeau|\btube\b/,
};

export function violatesNever(item: Pick<Candidate, 'title' | 'fabric'>, never: Never[]) {
  const text = `${item.title} ${item.fabric}`.toLowerCase();
  return never.find(n => NEVER[n].test(text)) || null;
}
