import type { Candidate, Garment, ProductSource, Slot } from '@/lib/look/types';

// Shopify Global Catalog: cross-merchant product search published for agents.
// No API key ("agent profile" auth). Terms: results must not be cached, and
// keyless access is rate-limited per IP. https://shopify.dev/docs/agents/catalog
export const CATALOG_ENDPOINT = 'https://catalog.shopify.com/api/ucp/mcp';
const PROFILE = 'https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json';

type Media = { type?: string; url?: string };
type Variant = { url?: string; price?: { amount: number; currency: string }; media?: Media[]; seller?: { name?: string } };
export type CatalogProduct = {
  id: string; title?: string; media?: Media[]; variants?: Variant[];
  price_range?: { min?: { amount: number; currency: string } };
  rating?: { value?: number; count?: number };
  options?: Array<{ name?: string; values?: Array<{ label: string }> }>;
  metadata?: { tech_specs?: string[] | string };
};

const SLOT_WORDS: Record<Slot, RegExp> = {
  outerwear: /jacket|blazer|coat|trench|bomber|shacket|parka|puffer|biker|moto|overshirt/,
  top: /\btops?\b|tee|t-shirt|shirt|blouse|cami|camisole|tank|bodysuit|sweater|knit|cardigan|corset|turtleneck|polo|halter|bustier/,
  skirt: /skirt|skort/,
  pants: /pants?\b|trouser|jeans?\b|legging|jogger|cargo|culotte|flare/,
  dress: /dress|gown/,
};
const NOT_CLOTHING = /earring|necklace|bracelet|\bring\b|watch|\bband\b|\bbag\b|tote|purse|boot|shoe|sandal|heel|sneaker|scarf|belt|\bhat\b|sock|kids|\bgirls?\b|baby|toddler|\bmen\b|men's|pattern\b|sewing|doll|costume|key ?(ring|chain)|charm|\bpin\b|patch|sticker|poster|phone case|mug/;

// A result must be the same kind of garment as the crop: image search alone
// happily returns a black bag for a black jacket.
export function sameKind(slot: Slot, title: string) {
  const t = title.toLowerCase();
  return SLOT_WORDS[slot].test(t) && !NOT_CLOTHING.test(t);
}

export function normalizeProduct(product: CatalogProduct, source: string): Candidate | null {
  const variant = product.variants?.[0] || {};
  const image = [...(product.media || []), ...(variant.media || [])].find(m => m.type === 'image' && m.url)?.url;
  const price = variant.price || product.price_range?.min;
  if (!image || !variant.url || !price || !product.title) return null;
  const specs = product.metadata?.tech_specs;
  const lines = Array.isArray(specs) ? specs : String(specs || '').split('\n');
  return {
    id: product.id, title: product.title, brand: variant.seller?.name || '', url: variant.url, image,
    price: price.amount / 100, currency: price.currency || 'USD',
    sizes: (product.options || []).find(o => o.name?.toLowerCase() === 'size')?.values?.map(v => v.label) || [],
    fabric: lines.find(line => /fabric|material|%/i.test(line)) || '',
    rating: product.rating?.value ?? null, reviews: product.rating?.count ?? null,
    sources: [source], visual: 0,
  };
}

type Fetch = typeof fetch;

export class ShopifyCatalogSource implements ProductSource {
  readonly name = 'shopify-catalog';
  constructor(private transport: Fetch = (input, init) => fetch(input, init), private country = 'US', private endpoint = CATALOG_ENDPOINT) {}

  private async call(catalog: Record<string, unknown>) {
    const body = { jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'search_catalog', arguments: { meta: { 'ucp-agent': { profile: PROFILE } }, catalog } } };
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.transport(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'angie/0.3' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (response.status === 429) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue; }
      if (!response.ok) throw new Error(`Shopify catalog ${response.status}`);
      const data = await response.json() as { result?: { structuredContent?: { products?: CatalogProduct[] } } };
      return data.result?.structuredContent?.products || [];
    }
    throw new Error('Shopify catalog rate limit');
  }

  async search(garment: Garment, { budgetMax, limit }: { budgetMax?: number; limit: number }) {
    const filters = {
      available: true, ships_to: { country: this.country },
      attributes: [{ name: 'Target gender', values: ['Female'] }],
      ...(budgetMax ? { price: { max: Math.round(budgetMax * 100) } } : {}),
    };
    const context = { address_country: this.country, currency: 'USD' };
    const crop = garment.crop.replace(/^data:image\/jpeg;base64,/, '');
    const [byText, byImage] = await Promise.all([
      this.call({ query: garment.query, pagination: { limit }, context, filters }),
      crop ? this.call({ like: [{ image: { content_type: 'image/jpeg', data: crop } }], pagination: { limit }, context, filters }) : Promise.resolve([]),
    ]);
    // Shopify's own image-search order is the visual signal when no local
    // similarity model is available: first image hit ≈ 1, last ≈ 0.5.
    const imageRank = new Map(byImage.map((p, i) => [p.id, 1 - 0.5 * (i / Math.max(1, byImage.length - 1))]));
    return [...byImage.map(p => normalizeProduct(p, 'shopify-image')), ...byText.map(p => normalizeProduct(p, 'shopify-text'))]
      .filter((c): c is Candidate => Boolean(c) && sameKind(garment.slot, c!.title))
      .map(c => ({ ...c, visual: imageRank.get(c.id) ?? 0.45 }));
  }
}
