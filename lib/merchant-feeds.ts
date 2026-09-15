import type { CatalogProduct } from './inspiration-engine';
import { inferTaxonomy } from '@/lib/catalog-taxonomy';
import { normalizeFeature } from '@/lib/garment-evidence';
import { canonicalProductUrl, trustedProductImage } from '@/lib/retailer-sources';
import { env } from 'cloudflare:workers';

const merchants = [
  { host: 'leset.com', name: 'LESET' },
  { host: 'cottoncitizen.com', name: 'Cotton Citizen' },
  { host: 'www.threedots.com', name: 'Three Dots' },
  { host: 'www.dolcevita.com', name: 'Dolce Vita' },
  { host: 'www.rails.com', name: 'Rails' },
];
type Variant = { id: number; available: boolean; price: string; option1?: string; option2?: string; option3?: string; featured_image?: { src?: string } };
type FeedProduct = { id: number; title: string; handle: string; product_type?: string; tags?: string[]; body_html?: string; options?: { name: string; position: number }[]; variants?: Variant[]; images?: { src: string; variant_ids?: number[] }[] };
const cache = new Map<string, { expires: number; products: CatalogProduct[] }>();

export function parseMerchantFeed(rows: FeedProduct[], merchant: typeof merchants[number]): CatalogProduct[] {
  return rows.flatMap(row => {
    const text = (row.body_html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').slice(0, 1800);
    if (/\b(men'?s|bebe|toddler|kids|gift card)\b/i.test(`${row.product_type} ${row.title}`)) return [];
    if (row.tags?.some(tag => /^(men|mens|men-size-chart|kids|children)$/i.test(tag))) return [];
    const taxonomy = inferTaxonomy(`${row.title} ${row.product_type || ''}`);
    if (taxonomy.subtype === 'unknown') return [];
    const colorIndex = row.options?.find(option => /colou?r/i.test(option.name))?.position;
    const sizeIndex = row.options?.find(option => /size/i.test(option.name))?.position;
    const option = (variant: Variant, index?: number) => index ? String(variant[`option${index}` as keyof Variant] || '') : '';
    const colors = new Set((row.variants || []).map(v => option(v, colorIndex)));
    return [...colors].flatMap(color => {
      const displayColor = color || (merchant.name === 'Rails' && row.title.includes(' - ') ? row.title.split(' - ').at(-1)! : 'unknown');
      const variants = (row.variants || []).filter(v => option(v, colorIndex) === color);
      const available = variants.filter(v => v.available === true);
      if (!available.length) return [];
      const variant = available[0];
      const url = canonicalProductUrl(`https://${merchant.host}/products/${row.handle}${colors.size > 1 ? `?variant=${variant.id}` : ''}`);
      if (!url) return [];
      const variantImage = variant.featured_image?.src || row.images?.find(image => image.variant_ids?.includes(variant.id))?.src;
      const image = trustedProductImage(variantImage || (colors.size === 1 ? row.images?.[0]?.src || '' : ''), url);
      if (!image) return [];
      const sizes = available.map(v => option(v, sizeIndex)).filter(Boolean);
      return [{ id: `live-${merchant.name}-/products/${row.handle}-${colors.size > 1 ? `variant=${variant.id}` : 'default'}`,
        retailerProductId: String(row.id), masterProductId: String(row.id), retailer: merchant.name, canonicalUrl: url,
        name: row.title, ...taxonomy, status: 'active' as const, verifiedAt: new Date().toISOString(), sourceStatus: 'catalog-verified' as const,
        feedVerifiedAt: Date.now(), imageSourceUrl: image, imageUrl: '', color: displayColor, price: null,
        availableSizes: sizes,
        attributes: { publicDescription: text, colorFamily: normalizeFeature('colorFamily', displayColor),
          silhouette: normalizeFeature('silhouette', text), sleeve: normalizeFeature('sleeve', text), neckline: normalizeFeature('neckline', text),
          composition: (text.match(/\b\d+\s*%\s*(?:cotton|silk|wool|linen|cashmere|viscose|rayon|modal|polyester|nylon|spandex|elastane)\b/gi) || []).join(' / '),
          sizeEvidence: sizes.length ? `Available retailer variants: ${sizes.join(', ')}; checked ${new Date().toISOString()}. Availability is not fit.` : undefined },
      }];
    });
  });
}

export async function discoverMerchantFeeds(): Promise<CatalogProduct[]> {
  const found = await Promise.all(merchants.map(async merchant => {
    const cached = cache.get(merchant.host);
    if (cached && cached.expires > Date.now()) return cached.products;
    try {
      const localToken = (env as unknown as Record<string, string>).LOCAL_RETAILER_RENDER_TOKEN;
      const response = localToken
        ? await fetch('http://127.0.0.1:4319', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${localToken}`}, body:JSON.stringify({kind:'merchant-feed',host:merchant.host}), signal:AbortSignal.timeout(12000) })
        : await fetch(`https://${merchant.host}/products.json?limit=250`, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
      if (!response.ok) { console.warn('[merchant-feed]', merchant.name, response.status); return []; }
      const reader = response.body?.getReader();
      if (!reader) { console.warn('[merchant-feed]', merchant.name, 'empty body'); return []; }
      let text = ''; let length = 0; const decoder = new TextDecoder();
      try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 5_000_000) return []; text += decoder.decode(part.value, { stream: true }); } } finally { await reader.cancel().catch(() => undefined); }
      const data = JSON.parse(text) as { products?: FeedProduct[] };
      const products = parseMerchantFeed((data.products || []).slice(0, 250), merchant);
      console.info('[merchant-feed]', merchant.name, { rows: data.products?.length || 0, products: products.length });
      cache.set(merchant.host, { products, expires: Date.now() + 10 * 60000 });
      return products;
    } catch (error) { console.warn('[merchant-feed]', merchant.name, error instanceof Error ? error.message : 'unavailable'); return []; }
  }));
  return found.flat();
}
