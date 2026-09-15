import type { ProductSubtype } from '@/lib/inspiration-types';

export type ProductCategory = 'top' | 'bottom' | 'dress' | 'layer' | 'shoes';

export function inferTaxonomy(name: string, sourcePage = ''): { category: ProductCategory; subtype: ProductSubtype } {
  const text = `${name} ${sourcePage}`.toLowerCase();
  if (/\b(blazer)\b/.test(text)) return { category: 'layer', subtype: 'blazer' };
  if (/\b(coat|trench)\b/.test(text)) return { category: 'layer', subtype: 'coat' };
  if (/\b(jacket|blouson)\b/.test(text)) return { category: 'layer', subtype: 'jacket' };
  if (/\b(dress|gown)\b/.test(text)) return { category: 'dress', subtype: 'dress' };
  if (/\b(boots?|booties?)\b/.test(text)) return { category: 'shoes', subtype: 'boot' };
  if (/\b(loafers?|moccasins?)\b/.test(text)) return { category: 'shoes', subtype: 'loafer' };
  if (/\b(sneakers?|trainers?)\b/.test(text)) return { category: 'shoes', subtype: 'sneaker' };
  if (/\b(heels?|heeled|high-heels?|mid-heels?|slingbacks?)\b/.test(text)) return { category: 'shoes', subtype: 'heel' };
  if (/\b(sandals?|flip-flops?)\b/.test(text)) return { category: 'shoes', subtype: 'sandal' };
  if (/\b(flats?|ballet|ballerinas?)\b/.test(text)) return { category: 'shoes', subtype: 'flat' };
  if (/\b(skirt|skort)\b/.test(text)) return { category: 'bottom', subtype: 'skirt' };
  if (/\bshorts\b/.test(text)) return { category: 'bottom', subtype: 'short' };
  if (/\b(jeans?|denim pant)\b/.test(text)) return { category: 'bottom', subtype: 'jean' };
  if (/\b(trousers?|pants?|capris?|leggings?)\b/.test(text)) return { category: 'bottom', subtype: 'trouser' };
  if (/\b(bodysuit)\b/.test(text)) return { category: 'top', subtype: 'bodysuit' };
  if (/\b(cami|camisole|tank|halter)\b/.test(text)) return { category: 'top', subtype: 'cami' };
  if (/\b(t-?shirt|tee)\b/.test(text)) return { category: 'top', subtype: 'tee' };
  if (/\b(shirt|blouse)\b/.test(text)) return { category: 'top', subtype: 'shirt' };
  if (/\b(sweater|jumper|cardigan|knit|polo)\b/.test(text)) return { category: 'top', subtype: 'knit' };
  if (/\/shoes/.test(text)) return { category: 'shoes', subtype: 'unknown' };
  if (/\/dresses/.test(text)) return { category: 'dress', subtype: 'dress' };
  if (/\/blazers/.test(text)) return { category: 'layer', subtype: 'blazer' };
  if (/\/(jackets|coats-jackets)/.test(text)) return { category: 'layer', subtype: 'jacket' };
  if (/\/(trousers|pants)/.test(text)) return { category: 'bottom', subtype: 'trouser' };
  if (/\/jeans/.test(text)) return { category: 'bottom', subtype: 'jean' };
  if (/\/skirts/.test(text)) return { category: 'bottom', subtype: 'skirt' };
  if (/\/t-shirts/.test(text)) return { category: 'top', subtype: 'tee' };
  if (/\/(shirts|tops)/.test(text)) return { category: 'top', subtype: 'shirt' };
  if (/\/(jumpers)/.test(text)) return { category: 'top', subtype: 'knit' };
  return { category: 'top', subtype: 'unknown' };
}
