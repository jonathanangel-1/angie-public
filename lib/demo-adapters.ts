import { env } from 'cloudflare:workers';
import { interpretInspiration as liveInterpret } from '@/lib/inspiration-interpreter';
import { rankVisualCandidates as liveRank } from '@/lib/visual-matcher';
import { discoverProducts as liveDiscover, verifySelection as liveVerify, combineProducts as liveCombine } from '@/lib/product-search';
import catalog from '@/data/verified-catalog.json';
import type { CatalogProduct } from '@/lib/inspiration-engine';
import { retrieveCatalog as liveRetrieve } from '@/lib/catalog-retrieval';
import { discoverMerchantFeeds as liveFeeds } from '@/lib/merchant-feeds';
import type { InspirationGarment, InspirationIntent } from '@/lib/inspiration-types';

// Only external services are simulated. The original ranking, evidence gates,
// recommendation assembly, persistence, feedback, and learning code still run.
export function isPublicDemo() {
  return (env as unknown as { PUBLIC_DEMO?: string }).PUBLIC_DEMO === '1' || process.env.PUBLIC_DEMO === '1';
}

export async function interpretInspiration(...args: Parameters<typeof liveInterpret>): ReturnType<typeof liveInterpret> {
  if (!isPublicDemo()) return liveInterpret(...args);
  const note = args[2].toLowerCase();
  const category = /dress/.test(note) ? 'dress' : /trouser|pants|jeans/.test(note) ? 'bottom' : 'top';
  const subtype = category === 'dress' ? 'dress' : category === 'bottom' ? (/jeans/.test(note) ? 'jean' : 'trouser') : (/shirt/.test(note) ? 'shirt' : 'tee');
  const garment: InspirationGarment = {
    slot: category, category, subtype,
    colorFamily: /navy/.test(note) ? 'navy' : /black/.test(note) ? 'black' : 'unknown',
    silhouette: 'unknown', length: 'unknown', rise: null, neckline: null, sleeve: null, material: null,
    details: ['Synthetic demonstration'], importance: 5,
  };
  const intent: InspirationIntent = { scope: 'single-item', requestedCategory: category, requestedSubtype: subtype,
    occasion: 'polished', palette: [], silhouettes: [], avoid: [], keywords: ['synthetic'], garments: [garment] };
  return { model: 'synthetic-demo-adapter', intent, brief: {
    title: 'Synthetic service demonstration',
    observed: args[1] ? 'Image recognition is simulated in this public demo. No image was sent to a provider.' : 'A simple local text rule selected a fictional catalog category.',
    preserve: ['Run the actual recommendation and feedback pipeline'],
    adapt: ['Use fictional products and an invented participant profile'],
  } };
}

export async function rankVisualCandidates(...args: Parameters<typeof liveRank>): ReturnType<typeof liveRank> {
  if (!isPublicDemo()) return liveRank(...args);
  return { model: 'synthetic-demo-adapter', matches: args[3].map((candidate, index) => ({
    candidateId: candidate.id, targetSlot: candidate.targetSlot, score: 85 - index,
    reason: 'Simulated visual result for exercising the pipeline; not an image assessment.',
  })) };
}

export async function discoverProducts(...args: Parameters<typeof liveDiscover>): ReturnType<typeof liveDiscover> {
  return isPublicDemo() ? { products: [], status: 'synthetic-demo-no-external-discovery' } : liveDiscover(...args);
}

export function combineProducts(...args: Parameters<typeof liveCombine>): ReturnType<typeof liveCombine> {
  return isPublicDemo() ? catalog.products as CatalogProduct[] : liveCombine(...args);
}

export async function verifySelection(...args: Parameters<typeof liveVerify>): ReturnType<typeof liveVerify> {
  if (!isPublicDemo()) return liveVerify(...args);
  return { accepted: args[0].filter(product => product.id.startsWith('demo-product-')),
    rejected: args[0].filter(product => !product.id.startsWith('demo-product-')).map(product => product.id) };
}

export async function retrieveCatalog(...args: Parameters<typeof liveRetrieve>): ReturnType<typeof liveRetrieve> {
  return isPublicDemo() ? { scores: new Map(), mode: 'synthetic-local-catalog' } : liveRetrieve(...args);
}

export async function discoverMerchantFeeds(...args: Parameters<typeof liveFeeds>): ReturnType<typeof liveFeeds> {
  return isPublicDemo() ? [] : liveFeeds(...args);
}
