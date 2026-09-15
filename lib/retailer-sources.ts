// Exact product routes only. Discovery can be broad without fetching arbitrary
// hosts, search/category pages, or transferring a user's image to retailers.
export type DiscoveryScope = 'preferred' | 'expanded';
const sources = [
  { name: 'Aritzia', host: 'www.aritzia.com', path: /^\/us\/en\/product\/[^/]+\/\d+\.html$/, query: ['color'] },
  { name: 'Massimo Dutti', host: 'www.massimodutti.com', path: /^\/us\/[^/]+-l\d+(?:\.html)?$/, query: ['pelement', 'colorId'] },
  { name: 'Cotton On', host: 'cottonon.com', path: /^\/US\/[^/]+\/[\w-]+\.html$/, query: [] },
  { name: 'Cotton Citizen', host: 'cottoncitizen.com', path: /^\/products\/[\w-]+$/, query: ['variant'] },
  { name: 'Three Dots', host: 'www.threedots.com', path: /^\/products\/[\w-]+$/, query: ['variant'] },
  { name: 'Nordstrom', host: 'www.nordstrom.com', path: /^\/s\/(?:[^/]+\/)?\d+$/, query: ['color', 'colorId'] },
  { name: 'L.L.Bean', host: 'www.llbean.com', path: /^\/llb\/shop\/\d+(?:\/(?:[^/]+\.html|page\.html))?$/, query: ['attrValue_0'] },
  { name: 'H&M', host: 'www2.hm.com', path: /^\/en_us\/productpage\.\d+\.html$/, query: [] },
  { name: 'LESET', host: 'leset.com', path: /^\/products\/[\w-]+$/, query: ['variant'] },
  { name: 'Reformation', host: 'www.thereformation.com', path: /^\/products\/[\w-]+\/\d+[A-Z0-9]*\.html$/, query: [] },
  { name: 'COS', host: 'www.cos.com', path: /^\/en-us\/women\/(?:[\w-]+\/)*product\/[\w-]+-\d+$/, query: [] },
  { name: 'Dolce Vita', host: 'www.dolcevita.com', path: /^\/products\/[\w-]+$/, query: ['variant'] },
  { name: 'Rails', host: 'www.rails.com', path: /^\/products\/[\w-]+$/, query: ['variant'] },
];
export function retailerSource(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    return sources.find(source => source.host === url.hostname && source.path.test(url.pathname));
  } catch { return; }
}
export function canonicalProductUrl(value: string): string | null {
  const source = retailerSource(value);
  if (!source) return null;
  const url = new URL(value), clean = new URL(url.origin + url.pathname);
  // Cotton On search citations sometimes combine one colour's product path
  // with another colour's selector. Never silently turn that into a match.
  if (source.name === 'Cotton On') {
    const variant = url.pathname.split('/').pop()!.replace(/\.html$/, '');
    for (const [key, value] of url.searchParams) {
      if (/^dwvar_.+_color$/.test(key) && value !== variant) return null;
    }
  }
  if (source.name === 'Reformation') {
    const selected = [...url.searchParams].find(([key]) => /^dwvar_.+_color$/.test(key));
    if (selected && !url.pathname.endsWith(selected[1] + '.html')) return null;
  }
  for (const key of source.query) if (url.searchParams.has(key)) clean.searchParams.set(key, url.searchParams.get(key)!);
  return clean.href;
}
export function discoveryDomains(scope: DiscoveryScope) {
  return sources.slice(0, scope === 'preferred' ? 2 : undefined).map(source => source.host);
}
export function trustedProductImage(value: string, productUrl: string): string {
  try {
    const source = retailerSource(productUrl), image = new URL(value);
    if (!source || image.protocol !== 'https:' || image.username || image.password || image.port) return '';
    const imageHosts: Record<string, string[]> = {
      'Aritzia': ['assets.aritzia.com'], 'Massimo Dutti': ['static.massimodutti.net'],
      'Cotton On': ['cottonon.com'], 'Cotton Citizen': ['cottoncitizen.com', 'cdn.shopify.com'],
      'Three Dots': ['www.threedots.com', 'cdn.shopify.com'], 'Nordstrom': ['n.nordstrommedia.com'],
      'L.L.Bean': ['cdni.llbean.net'], 'H&M': ['image.hm.com'],
      'LESET': ['leset.com', 'cdn.shopify.com'], 'Reformation': ['media.thereformation.com'], 'COS': ['media.cos.com'],
      'Dolce Vita': ['www.dolcevita.com', 'cdn.shopify.com'], 'Rails': ['www.rails.com', 'cdn.shopify.com'],
    };
    return imageHosts[source.name]?.includes(image.hostname) ? image.href : '';
  } catch { return ''; }
}
