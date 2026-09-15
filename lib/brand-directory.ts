import type { InspirationGarment } from './inspiration-types';

// Search routing, NOT an objective quality score or an Angie endorsement.
// Category relevance is an editorial starting hypothesis; item-level evidence
// and explicit Angie feedback decide the result. Broader recovery remains open.
export const brandDirectory = [
  { name: 'LESET', domain: 'leset.com', categories: ['top','bottom'], positioning: 'Matching separates and jersey basics', source: 'https://leset.com/products/demo-slim-fit-tee-white', checked: '2026-09-15' },
  { name: 'Cotton Citizen', domain: 'cottoncitizen.com', categories: ['top'], positioning: 'Premium casual jersey and garment dye', source: 'https://cottoncitizen.com/pages/our-story', checked: '2026-09-15' },
  { name: 'COS', domain: 'www.cos.com', categories: ['top','bottom','layer'], positioning: 'Modern minimal shapes and tailoring', source: 'https://www.cos.com/en-us/women/tops', checked: '2026-09-15' },
  { name: 'Reformation', domain: 'www.thereformation.com', categories: ['dress','bottom','shoes'], positioning: 'Dresses and feminine separates', source: 'https://www.thereformation.com/products/ellery-dress/1319608BLK.html', checked: '2026-09-15' },
] as const;

export function firstPassDomains(garments: InspirationGarment[]): string[] {
  const categories = new Set(garments.map(g => g.category));
  const relevant = brandDirectory.filter(brand => brand.categories.some(category => categories.has(category)));
  return [...relevant.map(brand => brand.domain), 'www.aritzia.com', 'www.massimodutti.com', 'www.nordstrom.com'];
}
