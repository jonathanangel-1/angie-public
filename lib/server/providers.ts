import { env } from 'cloudflare:workers';
import { DemoGarments, DemoSource, SidecarGarments } from '@/lib/look/garments';
import { SerpApiSource } from '@/lib/look/sources/serpapi';
import { ShopifyCatalogSource } from '@/lib/look/sources/shopify';
import type { GarmentProvider, ProductSource } from '@/lib/look/types';

type ProviderEnv = { GARMENT_SERVICE_URL?: string; SERPAPI_API_KEY?: string; SHOPIFY_CATALOG_URL?: string };

// Demo: fictional fixtures only. Otherwise: open-model garment service +
// Shopify Global Catalog (keyless), plus SerpApi when a key is configured.
export function providers(demo: boolean): { garments: GarmentProvider; sources: ProductSource[] } {
  if (demo) return { garments: new DemoGarments(), sources: [new DemoSource()] };
  const config = env as unknown as ProviderEnv;
  if (!config.GARMENT_SERVICE_URL) throw new Error('GARMENT_SERVICE_URL is not set. Start the garment service (see README).');
  // SHOPIFY_CATALOG_URL exists only so tests can point at a local stub.
  const sources: ProductSource[] = [new ShopifyCatalogSource(undefined, 'US', config.SHOPIFY_CATALOG_URL || undefined)];
  // Google Lens needs a public crop URL; without crop hosting only the text
  // (Google Shopping) half of SerpApi runs.
  if (config.SERPAPI_API_KEY) sources.push(new SerpApiSource(config.SERPAPI_API_KEY, async () => null));
  return { garments: new SidecarGarments(config.GARMENT_SERVICE_URL), sources };
}
