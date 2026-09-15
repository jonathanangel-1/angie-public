import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inferAttributes, inferTaxonomy } from './catalog-taxonomy.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const file = path.join(ROOT, 'data', 'verified-catalog.json');
const catalog = JSON.parse(await readFile(file, 'utf8'));
const now = new Date().toISOString();

function nameFromUrl(url) {
  const slug = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    .replace(/-l\d+$/i, '').replace(/\.html$/i, '');
  return slug.split('-').filter(Boolean).join(' ');
}

const anchors = [
  {
    id: 'aritzia-124059-1539', retailerProductId: '124059-1539', masterProductId: '124059', retailer: 'Aritzia', market: 'US',
    canonicalUrl: 'https://www.aritzia.com/us/en/product/interlock-cotton-function-t-shirt/124059.html?color=1539', sourcePage: 'official-direct-verification',
    name: 'InterLock Cotton Function T-Shirt', category: 'top', subtype: 'tee', price: { amount: 40, currency: 'USD' }, color: 'White',
    attributes: { silhouette: 'controlled', length: 'hip', neckline: 'crew', sleeve: 'short', colorFamily: 'white', formality: 2, composition: '100% cotton', sizeEvidence: 'Aritzia shows a classic fit and hip-grazing hem; start with XS–S and compare the garment chart.' },
  },
  {
    id: 'massimo-06215757-white', retailerProductId: '06215757-white', masterProductId: '06215757', retailer: 'Massimo Dutti', market: 'US',
    canonicalUrl: 'https://www.massimodutti.com/us/100-cotton-short-sleeve-tshirt-l06215757', sourcePage: 'official-direct-verification',
    name: '100% cotton short sleeve T-shirt', category: 'top', subtype: 'tee', price: null, color: 'White',
    attributes: { silhouette: 'controlled', length: 'regular', neckline: 'round', sleeve: 'short', colorFamily: 'white', formality: 2, composition: '100% cotton', sizeEvidence: 'Massimo shows the model in S and provides a measurement table; start with XS–S and compare bust and shoulder measurements.' },
  },
  {
    id: 'massimo-11613750-black', retailerProductId: '11613750-black', masterProductId: '11613750', retailer: 'Massimo Dutti', market: 'US',
    canonicalUrl: 'https://www.massimodutti.com/us/strappy-midheel-sandals-l11613750', sourcePage: 'official-direct-verification',
    name: 'Strappy mid-heel sandals', category: 'shoes', subtype: 'heel', price: null, color: 'Black',
    attributes: { silhouette: 'elegant', length: '5 cm heel', colorFamily: 'black', formality: 4, details: ['small-heel'], sizeEvidence: 'Start with EU 39 / US 8 and verify the retailer size chart.' },
  },
  {
    id: 'massimo-11401750-black', retailerProductId: '11401750-black', masterProductId: '11401750', retailer: 'Massimo Dutti', market: 'US',
    canonicalUrl: 'https://www.massimodutti.com/us/highheel-slingback-shoes-l11401750', sourcePage: 'official-direct-verification',
    name: 'Slingback shoes with 3 cm heel', category: 'shoes', subtype: 'heel', price: null, color: 'Black',
    attributes: { silhouette: 'elegant', length: '3 cm heel', colorFamily: 'black', formality: 4, details: ['small-heel'], sizeEvidence: 'Start with EU 39 / US 8 and verify the retailer size chart.' },
  },
  {
    id: 'massimo-58886808', retailerProductId: '58886808', masterProductId: '11604750', retailer: 'Massimo Dutti', market: 'US',
    canonicalUrl: 'https://www.massimodutti.com/us/midheel-sandals-with-toe-divider-l11604750?pelement=58886808', sourcePage: 'official-direct-verification',
    name: 'Mid-heel sandals with toe divider', category: 'shoes', subtype: 'heel', price: null, color: 'Black',
    attributes: { silhouette: 'elegant', length: '3 cm heel', colorFamily: 'black', formality: 4, details: ['small-heel'], sizeEvidence: 'Start with EU 39 / US 8 and verify the retailer size chart.' },
  },
  {
    id: 'massimo-02885383-navy', retailerProductId: '02885383-navy', masterProductId: '02885383', retailer: 'Massimo Dutti', market: 'US',
    canonicalUrl: 'https://www.massimodutti.com/us/lightweight-100-linen-trousers-l02885383', sourcePage: 'official-direct-verification',
    name: 'Lightweight 100% linen trousers', category: 'bottom', subtype: 'trouser', price: null, color: 'Navy',
    attributes: { silhouette: 'controlled', rise: 'unknown', length: 'full', colorFamily: 'navy', formality: 3, composition: '100% linen', sizeEvidence: 'Start with US 4, then use the retailer measurement table to check hip ease and finished length.' },
  },
];

const normalized = catalog.products.map((product) => {
  const name = product.name || nameFromUrl(product.canonicalUrl);
  const taxonomy = inferTaxonomy(name, product.sourcePage || '');
  const corrected = { ...product, name, ...taxonomy, imageUrl: '' };
  if (corrected.retailer === 'Aritzia' && corrected.imageSourceUrl) {
    const color = new URL(corrected.canonicalUrl).searchParams.get('color');
    if (color && color !== 'default' && !corrected.imageSourceUrl.includes(`_${corrected.masterProductId}_${color}_`) || /_sw(?:$|[.?/_-])/.test(corrected.imageSourceUrl)) corrected.imageSourceUrl = '';
  }
  corrected.attributes = inferAttributes(corrected);
  return corrected;
}).filter((product) => product.subtype !== 'unknown');
for (const anchor of anchors) {
  const index = normalized.findIndex((product) => product.id === anchor.id || product.canonicalUrl === anchor.canonicalUrl);
  // Curated interpretation cannot create a current product or refresh a check date.
  // Only attach the old attributes when the current collector found the exact URL.
  if (index >= 0 && normalized[index].canonicalUrl === anchor.canonicalUrl) {
    normalized[index].attributes = { ...anchor.attributes, ...normalized[index].attributes };
  }
}
catalog.version = `angie-two-store-taxonomy-v3-${now.slice(0, 10)}`;
catalog.productCount = normalized.length;
catalog.products = normalized;
catalog.diagnostics = { ...(catalog.diagnostics || {}), normalization: { taxonomy: 'v3', freshChecksAdded: 0, productPhotosInUi: 0 } };
await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, products: normalized.length, anchors: anchors.length }, null, 2));
