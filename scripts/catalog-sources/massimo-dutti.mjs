import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { inferTaxonomy } from '../catalog-taxonomy.mjs';

const HOME_URL = 'https://www.massimodutti.com/us/';
const CATEGORY_PAGES = [
  { url: 'https://www.massimodutti.com/us/women/shirts-n1439', category: 'top' },
  { url: 'https://www.massimodutti.com/us/women/tops-n1490', category: 'top' },
  { url: 'https://www.massimodutti.com/us/women/t-shirts-n1444', category: 'top' },
  { url: 'https://www.massimodutti.com/us/women/jumpers-n1464', category: 'top' },
  { url: 'https://www.massimodutti.com/us/women/trousers-n1476', category: 'bottom' },
  { url: 'https://www.massimodutti.com/us/women/jeans-n1642', category: 'bottom' },
  { url: 'https://www.massimodutti.com/us/women/skirts-n1457', category: 'bottom' },
  { url: 'https://www.massimodutti.com/us/women/dresses-n1494', category: 'dress' },
  { url: 'https://www.massimodutti.com/us/women/jackets-n1450', category: 'layer' },
  { url: 'https://www.massimodutti.com/us/women/blazers-n1428', category: 'layer' },
  { url: 'https://www.massimodutti.com/us/women/shoes-n1499', category: 'shoes' },
  { url: 'https://www.massimodutti.com/us/women/shoes/sandals-n1651?celement=2225494', category: 'shoes' },
];

const SOFT_RISKS = [
  ['oversized', /oversize|oversized|boyfriend/i],
  ['baggy', /baggy|wide-leg|wideleg|palazzo/i],
  ['barrel', /barrel/i],
  ['cropped', /crop|capri|waist-length/i],
  ['low-rise', /low-rise|lo-rise|low waist/i],
  ['shoulder-volume', /puff|ruched shoulder|shoulder pad/i],
  ['sporty', /technical|legging|jogger|sweat/i],
];

function readableName(value) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean || clean !== clean.toUpperCase()) return clean;
  const lower = clean.toLowerCase();
  return `${lower[0].toUpperCase()}${lower.slice(1)}`;
}

function productId(url) {
  return new URL(url).searchParams.get('pelement') || '';
}

function productCode(url) {
  return new URL(url).pathname.match(/-l(\d+)$/i)?.[1] || '';
}

function titleFromUrl(url) {
  const slug = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/-l\d+$/i, '');
  return slug.split('-').filter(Boolean).join(' ');
}

function initialAttributes(category, searchable) {
  const details = SOFT_RISKS.filter(([, pattern]) => pattern.test(searchable)).map(([name]) => name);
  const silhouette = /straight/i.test(searchable) ? 'straight'
    : /flare/i.test(searchable) ? 'flare'
      : /barrel/i.test(searchable) ? 'barrel'
        : /balloon/i.test(searchable) ? 'balloon'
          : /wide|palazzo|oversize|relaxed/i.test(searchable) ? 'relaxed'
            : /fitted|slim|ribbed|stretch/i.test(searchable) ? 'fitted' : 'unknown';
  const rise = /low.?rise|low waist/i.test(searchable) ? 'low'
    : /mid.?rise|mid waist/i.test(searchable) ? 'mid'
      : /high.?rise|high waist/i.test(searchable) ? 'high' : 'unknown';
  const length = /mini/i.test(searchable) ? 'mini'
    : /maxi|long dress/i.test(searchable) ? 'maxi'
      : /midi/i.test(searchable) ? 'midi'
        : /capri|crop/i.test(searchable) ? 'cropped' : 'unknown';
  return {
    silhouette,
    ...(category === 'bottom' ? { rise } : {}),
    length,
    formality: category === 'dress' ? 4 : category === 'layer' ? 4 : category === 'shoes' ? 3 : 2,
    details,
  };
}

function inferColor(description) {
  const sentences = description.toLowerCase().split(/(?<=[.!?])\s+/);
  const value = sentences.find((sentence) => /\b(?:front|side|back) view\b/.test(sentence)) || sentences[0] || '';
  const tokens = [
    ['black', /\bblack\b/], ['white', /\bwhite\b/], ['navy', /\bnavy\b/],
    ['grey', /\b(?:gray|grey|charcoal)\b/], ['brown', /\b(?:brown|taupe)\b/],
    ['cream', /\b(?:cream|ecru|ivory|beige|sand)\b/], ['blue', /\bblue\b/],
    ['red', /\b(?:red|burgundy|wine)\b/], ['green', /\b(?:green|olive)\b/],
    ['silver', /\b(?:silver|metallic silver)\b/], ['gold', /\b(?:gold|metallic gold)\b/],
  ];
  const matches = tokens.map(([name, pattern]) => ({ name, index: value.search(pattern) })).filter((match) => match.index >= 0).sort((left, right) => left.index - right.index);
  return matches[0]?.name || 'unknown';
}

async function scrapePage(page, source) {
  const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response?.ok() || /access denied/i.test(await page.title())) throw new Error(`${response?.status() || 'no response'} ${source.url}`);
  await page.locator('a[href*="?pelement="]').first().waitFor({ state: 'attached', timeout: 20_000 });
  let prior = -1, stable = 0;
  for (let pass = 0; pass < 65; pass += 1) {
    // Jumping to document bottom skipped the grid's intersection observers,
    // leaving exactly twelve SSR products in every category.
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(450);
    const count = await page.locator('a[href*="?pelement="]').count();
    const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100);
    stable = count === prior && atBottom ? stable + 1 : 0;
    if (stable >= 3) break;
    prior = count;
  }
  return page.locator('a[href*="?pelement="]').evaluateAll((links, sourceInfo) => links.map((link) => {
    const card = link.closest('li');
    const lines = (card?.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const images = [...(card?.querySelectorAll('img') || [])].map((image) => ({ src: image.currentSrc || image.src, alt: image.alt || '' }));
    return {
      category: sourceInfo.category,
      sourcePage: sourceInfo.url,
      href: link.href,
      name: lines.find((line) => !/^\$|^\+\d+|^NEW IN$|^SOLD OUT$/i.test(line)) || '',
      priceText: lines.find((line) => /^\$[\d,.]+$/.test(line)) || '',
      image: images.find((image) => /-o1\//i.test(image.src)) || images[0] || null,
      imageAlts: images.map((image) => image.alt).filter(Boolean),
    };
  }), source);
}

export async function collectMassimoDutti({ imageDir, verifiedAt, limit = Number(process.env.MASSIMO_LIMIT || 2000) }) {
  await mkdir(imageDir, { recursive: true });
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
  const diagnostics = [];
  const scraped = [];
  try {
    const seed = await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1_500);
    if (!seed?.ok() || /access denied/i.test(await page.title())) throw new Error('Massimo Dutti rejected the verification browser.');
    for (const source of CATEGORY_PAGES) {
      try {
        const products = await scrapePage(page, source);
        scraped.push(...products);
        diagnostics.push({ url: source.url, category: source.category, products: products.length, ok: true });
      } catch (error) {
        diagnostics.push({ url: source.url, category: source.category, products: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await browser.close();
  }

  const products = normalizeMassimoRows(scraped, verifiedAt, limit);
  const failures = [];
  if (products.length < 50) throw new Error(`Only ${products.length} Massimo Dutti products passed live-page and image verification.`);
  return { products, diagnostics, failures };
}

// Shared by unattended collection and ordinary-browser DOM captures. Captures
// change the transport, never select products by a particular inspiration.
export function normalizeMassimoRows(scraped, verifiedAt, limit = 2000) {
  const candidates = new Map();
  const variantsPerProduct = new Map();
  for (const item of scraped) {
    if (!item.href.startsWith('https://www.massimodutti.com/us/')) continue;
    const retailerProductId = productId(item.href);
    const masterProductId = productCode(item.href);
    if (!retailerProductId || !masterProductId) continue;
    const variants = variantsPerProduct.get(masterProductId) || new Set();
    if (!variants.has(retailerProductId) && variants.size >= 3) continue;
    variants.add(retailerProductId);
    variantsPerProduct.set(masterProductId, variants);
    const id = `massimo-${retailerProductId}`;
    const priceAmount = Number(item.priceText.replace(/[^\d.]/g, ''));
    const publicDescription = item.imageAlts.join(' ');
    const colorFamily = inferColor(publicDescription);
    const name = readableName(item.name) || titleFromUrl(item.href);
    const taxonomy = inferTaxonomy(name, item.sourcePage);
    if (taxonomy.subtype === 'unknown') continue;
    candidates.set(id, {
      id,
      retailerProductId,
      masterProductId,
      retailer: 'Massimo Dutti',
      market: 'US',
      canonicalUrl: item.href,
      sourcePage: item.sourcePage,
      verifiedAt,
      status: 'active',
      name,
      category: taxonomy.category,
      subtype: taxonomy.subtype,
      imageSourceUrl: item.image?.src || '',
      imageUrl: '',
      price: Number.isFinite(priceAmount) && priceAmount > 0 ? { amount: priceAmount, currency: 'USD' } : null,
      color: colorFamily === 'unknown' ? 'See product page' : colorFamily,
      availableSizes: [],
      attributes: { ...initialAttributes(taxonomy.category, `${item.name} ${publicDescription}`), colorFamily, publicDescription },
      extractionConfidence: 'official-current-category-page-and-image',
    });
  }

  const ordered = [...candidates.values()].sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
  const guaranteed = [];
  const selected = new Set();
  for (const [subtype, quota] of [['heel', 8], ['trouser', 24], ['tee', 10], ['jean', 12], ['skirt', 12]]) {
    for (const product of ordered.filter((candidate) => candidate.subtype === subtype).slice(0, quota)) { guaranteed.push(product); selected.add(product.id); }
  }
  const products = [...guaranteed, ...ordered.filter((product) => !selected.has(product.id))].slice(0, limit);
  return products;
}
