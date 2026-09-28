import type { Candidate, Garment, ProductSource } from '@/lib/look/types';
import { sameKind } from '@/lib/look/sources/shopify';

// Broad-coverage layer: Google Lens (visual matches) + Google Shopping (text),
// through SerpApi. Needs SERPAPI_API_KEY (paid plans ~$0.009–0.025 per search;
// free plan 250/month). Google Lens needs a public URL for the crop, so the
// caller supplies `cropUrl` (e.g. a short-lived R2 object). Not exercised live
// in this repository: no key was available; parsers are tested on documented shapes.
type LensMatch = { title?: string; link?: string; source?: string; thumbnail?: string; image?: string; price?: { extracted_value?: number; currency?: string }; in_stock?: boolean };
type ShoppingResult = { title?: string; product_link?: string; link?: string; source?: string; thumbnail?: string; extracted_price?: number };

const currencyCode = (symbol?: string) => (symbol === '$' || !symbol ? 'USD' : symbol === '€' ? 'EUR' : symbol === '£' ? 'GBP' : symbol);

export function parseLens(data: { visual_matches?: LensMatch[] }, slot: Garment['slot']): Candidate[] {
  const matches = (data.visual_matches || []).filter(m => m.link && m.title && m.price?.extracted_value && m.in_stock !== false);
  return matches.flatMap((m, i) => sameKind(slot, m.title!) ? [{
    id: `lens:${m.link}`, title: m.title!, brand: m.source || new URL(m.link!).hostname, url: m.link!, image: m.image || m.thumbnail || '',
    price: m.price!.extracted_value!, currency: currencyCode(m.price!.currency), sizes: [], fabric: '', rating: null, reviews: null,
    sources: ['google-lens'], visual: 1 - 0.5 * (i / Math.max(1, matches.length - 1)),
  }] : []);
}

export function parseShopping(data: { shopping_results?: ShoppingResult[] }, slot: Garment['slot']): Candidate[] {
  return (data.shopping_results || []).flatMap(r => {
    const url = r.product_link || r.link;
    if (!url || !r.title || !r.extracted_price || !sameKind(slot, r.title)) return [];
    return [{ id: `shopping:${url}`, title: r.title, brand: r.source || '', url, image: r.thumbnail || '', price: r.extracted_price, currency: 'USD',
      sizes: [], fabric: '', rating: null, reviews: null, sources: ['google-shopping'], visual: 0.45 }];
  });
}

export class SerpApiSource implements ProductSource {
  readonly name = 'serpapi';
  constructor(private apiKey: string, private cropUrl: (garment: Garment) => Promise<string | null>, private transport: typeof fetch = (input, init) => fetch(input, init)) {}

  private async get(params: Record<string, string>) {
    const url = new URL('https://serpapi.com/search.json');
    for (const [k, v] of Object.entries({ ...params, api_key: this.apiKey })) url.searchParams.set(k, v);
    const response = await this.transport(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`SerpApi ${response.status}`);
    return response.json() as Promise<Record<string, never>>;
  }

  async search(garment: Garment, { budgetMax }: { budgetMax?: number; limit: number }) {
    const cropUrl = await this.cropUrl(garment);
    const [lens, shopping] = await Promise.all([
      cropUrl ? this.get({ engine: 'google_lens', url: cropUrl, type: 'products', country: 'us', hl: 'en' }).then(d => parseLens(d, garment.slot)) : Promise.resolve([]),
      this.get({ engine: 'google_shopping', q: garment.query, gl: 'us', hl: 'en' }).then(d => parseShopping(d, garment.slot)),
    ]);
    return [...lens, ...shopping].filter(c => !budgetMax || c.price <= budgetMax);
  }
}
