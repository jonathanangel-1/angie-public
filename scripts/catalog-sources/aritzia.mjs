import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { inferTaxonomy } from '../catalog-taxonomy.mjs';

const PRODUCT_SITEMAP = 'https://www.aritzia.com/us/en/sitemap_0-product.xml';
const CATEGORY_PAGES = [
  { url: 'https://www.aritzia.com/intl/en/clothing/tshirts', category: 'top' },
  { url: 'https://www.aritzia.com/intl/en/clothing/tops', category: 'top' },
  { url: 'https://www.aritzia.com/intl/en/clothing/pants', category: 'bottom' },
  { url: 'https://www.aritzia.com/intl/en/clothing/jeans', category: 'bottom' },
  { url: 'https://www.aritzia.com/intl/en/clothing/skirts', category: 'bottom' },
  { url: 'https://www.aritzia.com/intl/en/clothing/dresses', category: 'dress' },
  { url: 'https://www.aritzia.com/intl/en/clothing/blazers', category: 'layer' },
  { url: 'https://www.aritzia.com/intl/en/clothing/coats-jackets', category: 'layer' },
];

const HARD_EXCLUDES = /gift-card|blanket|scarf|sweatpant|jogger|\bshorts\b|cargo|parachute|puffer|hoodie|swimsuit|bikini|bralette/i;
const SOFT_RISKS = [
  ['oversized', /oversize|oversized|boyfriend/i],
  ['baggy', /baggy|wide-leg|wideleg/i],
  ['barrel', /barrel/i],
  ['cropped', /crop|capri|waist-length/i],
  ['low-rise', /low-rise|lo-rise|low waist/i],
  ['shoulder-volume', /puff|ruched shoulder|shoulder pad/i],
  ['sporty', /technical|legging|jogger|sweat/i],
];

const PROVEN_ANCHORS = [
  {
    id: 'aritzia-128959', retailerProductId: '128959', name: 'Original Contour Presence Cami', category: 'top', color: 'Black', price: 42,
    canonicalUrl: 'https://www.aritzia.com/us/en/product/original-contour-presence-waist-cami-tank/128959.html?color=1274',
    imageSourceUrl: '/stylist/aritzia-black-contour.jpg',
    attributes: { silhouette: 'fitted', length: 'waist', neckline: 'square', sleeve: 'sleeveless', colorFamily: 'black', formality: 3, details: ['approved-look', 'regular-waist-length'] },
  },
  {
    id: 'aritzia-129475', retailerProductId: '129475', name: 'The ’90s Snatched Hi-Rise Straight Jean', category: 'bottom', color: 'Dark indigo', price: 110,
    canonicalUrl: 'https://www.aritzia.com/us/en/product/the-%E2%80%9890s-snatched-hi-rise-straight-jean/129475.html?color=33551',
    imageSourceUrl: '/stylist/aritzia-dark-jeans.jpg',
    attributes: { silhouette: 'straight', rise: 'high', length: 'full', colorFamily: 'blue', formality: 2, details: ['approved-look', 'dark-denim'] },
  },
  {
    id: 'aritzia-118306', retailerProductId: '118306', name: 'Original Contour Summon Maxi Dress', category: 'dress', color: 'Black', price: 98,
    canonicalUrl: 'https://www.aritzia.com/us/en/product/original-contour-summon-maxi-cami-dress/118306.html?color=1274',
    imageSourceUrl: '/stylist/aritzia-black-maxi.jpg',
    attributes: { silhouette: 'fitted', length: 'maxi', neckline: 'scoop', sleeve: 'sleeveless', colorFamily: 'black', formality: 5, details: ['approved-look', 'black-column'] },
  },
];

function decode(value) {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

function tags(block, name) {
  return [...block.matchAll(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'gi'))].map((match) => decode(match[1]));
}

function productId(url) {
  return new URL(url).pathname.split('/').pop()?.replace(/\.html$/i, '') || '';
}

function titleFromSlug(url) {
  const slug = decodeURIComponent(new URL(url).pathname.split('/').at(-2) || '');
  return slug.replace(/[™®]/g, '').split('-').filter(Boolean).map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function initialAttributes(category, searchable) {
  const details = SOFT_RISKS.filter(([, pattern]) => pattern.test(searchable)).map(([name]) => name);
  const silhouette = /straight/i.test(searchable) ? 'straight'
    : /flare/i.test(searchable) ? 'flare'
      : /barrel/i.test(searchable) ? 'barrel'
        : /balloon/i.test(searchable) ? 'balloon'
          : /wide|oversize|relaxed/i.test(searchable) ? 'relaxed'
            : /contour|fitted|slim|ribbed|snatched/i.test(searchable) ? 'fitted' : 'unknown';
  const rise = /low.?rise/i.test(searchable) ? 'low' : /mid.?rise/i.test(searchable) ? 'mid' : /high.?rise/i.test(searchable) ? 'high' : 'unknown';
  const length = /mini/i.test(searchable) ? 'mini' : /maxi/i.test(searchable) ? 'maxi' : /midi/i.test(searchable) ? 'midi' : /capri|crop/i.test(searchable) ? 'cropped' : 'unknown';
  return { silhouette, ...(category === 'bottom' ? { rise } : {}), length, formality: category === 'dress' ? 4 : category === 'layer' ? 4 : 2, details };
}

function colorFamily(color) {
  const value = color.toLowerCase();
  if (/black/.test(value)) return 'black';
  if (/white/.test(value)) return 'white';
  if (/navy/.test(value)) return 'navy';
  if (/grey|gray|charcoal/.test(value)) return 'grey';
  if (/cream|ecru|ivory|beige|sand/.test(value)) return 'cream';
  if (/brown|taupe|cacao|cello/.test(value)) return 'brown';
  if (/blue|denim/.test(value)) return 'blue';
  if (/red|burgundy|wine/.test(value)) return 'red';
  if (/green|olive/.test(value)) return 'green';
  return 'unknown';
}

async function fetchProductPages() {
  const response = await fetch(PRODUCT_SITEMAP, { headers: { 'User-Agent': 'AngieStyleLocalCatalog/2.0' } });
  if (!response.ok) throw new Error(`${response.status} ${PRODUCT_SITEMAP}`);
  const xml = await response.text();
  if (!/<urlset\b/i.test(xml)) throw new Error('Aritzia product sitemap did not return XML.');
  return new Map(tags(xml, 'loc').map((url) => {
    const canonical = url.split('?')[0];
    return [productId(canonical), canonical];
  }).filter(([id]) => Boolean(id)));
}

async function scrapePage(page, source) {
  const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response?.ok() || /just a moment|access denied/i.test(await page.title())) throw new Error(`${response?.status() || 'no response'} ${source.url}`);
  const tiles = page.locator('[data-testid^="plp-product-tile-"]');
  await tiles.first().waitFor({ state: 'attached', timeout: 20_000 });
  const captured = new Map();
  let unchanged = 0;
  let priorCount = 0;
  for (let pass = 0; pass < 25; pass += 1) {
    const visible = await tiles.evaluateAll((cards) => cards.flatMap((card) => {
      const link = card.querySelector('a[href*="/product/"]');
      const images = [...card.querySelectorAll('img')];
      const alt = images.map((candidate) => candidate.getAttribute('alt') || '').find(Boolean) || '';
      const poster = card.querySelector('video[poster]')?.getAttribute('poster') || '';
      const imageSourceUrl = [poster, ...images.map((candidate) => candidate.currentSrc || candidate.src || '')]
        .find((value) => /^https:\/\//.test(value) && !/\/f7f7f7(?:$|[/?])/.test(value)) || '';
      const name = card.querySelector('[data-testid="plp-product-name"]')?.textContent?.trim() || '';
      const swatchTitle = card.querySelector('a[title*="| Aritzia |"]')?.getAttribute('title') || '';
      const color = swatchTitle.split('|').at(-1)?.trim() || '';
      const variants = [...card.querySelectorAll('a[href*="/product/"]')].filter((a) => new URL(a.href).searchParams.has('color'));
      return (variants.length ? variants : link ? [link] : []).map((a) => {
        const variantColor = (a.getAttribute('title') || '').split('|').at(-1)?.trim() || color;
        const colorId = new URL(a.href).searchParams.get('color');
        return { href: a.href, name, color: variantColor, description: alt, imageSourceUrl: colorId && imageSourceUrl.includes(`_${colorId}_`) && !/_sw(?:$|[.?/_-])/.test(imageSourceUrl) ? imageSourceUrl : '' };
      });
    }));
    for (const item of visible) captured.set(item.href, item);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(700);
    const count = await tiles.count();
    unchanged = count === priorCount ? unchanged + 1 : 0;
    priorCount = count;
    if (unchanged >= 3) break;
  }
  return [...captured.values()].map((item) => ({ ...item, category: source.category, sourcePage: source.url }));
}

function internationalUrl(url) {
  return url.replace('/us/en/', '/intl/en/');
}

export async function enrichPrivateImages(products, diagnostics, limit = Number(process.env.ARITZIA_IMAGE_LIMIT || 240)) {
  const targets = products.filter((product) => !product.privateImageEvidence).slice(0, limit);
  if (!targets.length) return;
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  let cursor = 0; let enriched = 0; let failed = 0; let cachedBytes = 0; const failureSamples = [];
  try {
    const worker = async () => {
      while (cursor < targets.length) {
        const product = targets[cursor++];
        const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, locale: 'en-US' });
        const imageResponses = new Map();
        page.on('response', (response) => {
          if (response.url().includes(`_${product.masterProductId}_`) && !/_sw(?:$|[.?/_-])/.test(response.url()) && response.ok()) imageResponses.set(response.url(), response);
        });
        try {
            // The US product URL geo-redirects and repeated requests trigger the bot wall.
            // The international product page is the same official catalog and reliably
            // exposes the current product imagery while the customer link remains US.
            const response = await page.goto(internationalUrl(product.canonicalUrl), { waitUntil: 'domcontentloaded', timeout: 35_000 });
            if (!response?.ok()) throw new Error(`HTTP ${response?.status() || 'unknown'}`);
            await page.waitForTimeout(500);
            const currentUrl = new URL(page.url());
            const colorId = currentUrl.searchParams.get('color') || new URL(product.canonicalUrl).searchParams.get('color') || 'default';
            const requestedColor = new URL(product.canonicalUrl).searchParams.get('color');
            if (requestedColor && requestedColor !== 'default' && requestedColor !== colorId) throw new Error('redirect changed color variant');
            const imageSourceUrl = await page.locator(`img[src*="_${product.masterProductId}_${colorId}_"]`).evaluateAll((images) => images.map((image) => image.currentSrc || image.src).find((url) => /_on_a(?:$|[.?/_-])/i.test(url)) || images.map((image) => image.currentSrc || image.src)[0] || '');
            if (!imageSourceUrl) throw new Error('no product-specific image');
            product.imageSourceUrl = imageSourceUrl;
            product.visualEvidenceColorId = colorId;
            // Request a bounded JPEG through the browser that loaded the PDP.
            // Server-side requests to this CDN are frequently blocked.
            const compactUrl = new URL(imageSourceUrl);
            compactUrl.searchParams.set('w', '400');
            compactUrl.searchParams.set('q', '65');
            compactUrl.searchParams.set('fm', 'jpg');
            await page.evaluate(async (url) => {
              await new Promise((resolve) => { const image = new Image(); image.onload = resolve; image.onerror = resolve; image.src = url; setTimeout(resolve, 6000); });
            }, compactUrl.href);
            const imageResponse = imageResponses.get(compactUrl.href) || imageResponses.get(imageSourceUrl);
            if (imageResponse && cachedBytes < 1_500_000) {
              const contentType = (await imageResponse.headerValue('content-type') || '').split(';')[0];
              if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
                const bytes = await imageResponse.body().catch(() => null);
                if (bytes?.length && bytes.length <= 100_000 && cachedBytes + bytes.length <= 1_500_000) {
                  product.privateImageEvidence = { sourceUrl: imageSourceUrl, dataUrl: `data:${contentType};base64,${bytes.toString('base64')}` };
                  cachedBytes += bytes.length;
                }
              }
            }
            if (!product.privateImageEvidence && cachedBytes < 1_500_000) {
              const images = page.locator(`img[src*="_${product.masterProductId}_${colorId}_"]`);
              for (let index = 0; index < await images.count(); index++) {
                const image = images.nth(index);
                if (!await image.isVisible()) continue;
                const source = await image.evaluate((el) => el.currentSrc || el.src);
                if (source !== imageSourceUrl) continue;
                await image.scrollIntoViewIfNeeded();
                await page.evaluate(() => window.scrollBy(0, -150));
                await page.waitForFunction((src) => [...document.images].some((el) => (el.currentSrc || el.src) === src && el.complete && el.naturalWidth >= 200 && el.naturalHeight >= 200), source, { timeout: 8000 });
                const clear = await image.evaluate((el) => {
                  const r = el.getBoundingClientRect();
                  if (r.width < 200 || r.height < 200) return false;
                  return [0.03, 0.5, 0.97].every((y) => [0.1, 0.5, 0.9].every((x) => document.elementFromPoint(r.left + r.width * x, r.top + r.height * y) === el));
                });
                if (!clear) throw new Error('garment image obstructed by overlay');
                const bytes = await image.screenshot({ type: 'jpeg', quality: 50, scale: 'css', timeout: 8000 });
                if (bytes.length > 100_000 || cachedBytes + bytes.length > 1_500_000) throw new Error('capture exceeds private evidence budget');
                product.privateImageEvidence = { sourceUrl: source, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, method: 'browser-element-screenshot', capturedAt: new Date().toISOString(), productPage: page.url(), colorId };
                cachedBytes += bytes.length;
                break;
              }
              if (!product.privateImageEvidence) throw new Error('no loaded unobstructed garment capture');
            }
            enriched += 1;
        } catch (error) {
          failed += 1;
          if (failureSamples.length < 10) failureSamples.push(`${product.id}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await page.close();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => worker()));
  } finally {
    await browser.close();
  }
  diagnostics.push({ stage: 'product-image-enrichment', attempted: targets.length, enriched, failed, cachedBytes, failureSamples, ok: enriched >= Math.ceil(targets.length * 0.7) });
}

export async function collectAritzia({ imageDir, verifiedAt, limit = Number(process.env.ARITZIA_LIMIT || 260), sources = CATEGORY_PAGES, minimum = 120, minimumImages = 70 }) {
  await mkdir(imageDir, { recursive: true });
  const liveProductPages = await fetchProductPages();
  const diagnostics = [];
  const scraped = [];
  for (const source of sources) {
    const scrapeBrowser = await chromium.launch({ headless: false, channel: 'chrome' });
    const page = await scrapeBrowser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
    try {
      try {
        const products = await scrapePage(page, source);
        scraped.push(...products);
        diagnostics.push({ url: source.url, category: source.category, products: products.length, ok: true });
      } catch (error) {
        diagnostics.push({ url: source.url, category: source.category, products: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      await scrapeBrowser.close();
    }
  }

  const candidates = new Map();
  const colorsPerProduct = new Map();
  const colorPriority = (item) => /^(white|black|navy|dark night navy)$/i.test(item.color) ? 0 : 1;
  for (const item of scraped.sort((a, b) => colorPriority(a) - colorPriority(b))) {
    const sourceUrl = new URL(item.href);
    const scrapedBase = `${sourceUrl.origin}${sourceUrl.pathname}`.replace('/intl/en/', '/us/en/');
    const masterId = productId(scrapedBase);
    const canonicalBase = liveProductPages.get(masterId);
    if (!canonicalBase) continue;
    const colorId = sourceUrl.searchParams.get('color') || 'default';
    const colorKey = `${masterId}:${colorId}`;
    const existingColors = colorsPerProduct.get(masterId) || new Set();
    if (!existingColors.has(colorKey) && existingColors.size >= 3) continue;
    existingColors.add(colorKey);
    colorsPerProduct.set(masterId, existingColors);
    const canonicalUrl = `${canonicalBase}?color=${encodeURIComponent(colorId)}`;
    const name = item.name || titleFromSlug(canonicalBase);
    if (HARD_EXCLUDES.test(name)) continue;
    const id = `aritzia-${masterId}-${colorId}`;
    const taxonomy = inferTaxonomy(name, item.sourcePage);
    candidates.set(id, {
      id,
      retailerProductId: `${masterId}-${colorId}`,
      masterProductId: masterId,
      retailer: 'Aritzia',
      market: 'US',
      canonicalUrl,
      sourceSitemap: PRODUCT_SITEMAP,
      sourcePage: item.sourcePage,
      verifiedAt,
      status: 'active',
      name,
      category: taxonomy.category,
      subtype: taxonomy.subtype,
      imageSourceUrl: item.imageSourceUrl,
      imageUrl: '',
      price: null,
      color: item.color || 'See product page',
      availableSizes: [],
      attributes: { ...initialAttributes(taxonomy.category, `${name} ${item.description}`), colorFamily: colorFamily(item.color || ''), publicDescription: item.description || '' },
      extractionConfidence: 'official-current-category-page-plus-us-product-sitemap',
    });
  }

  const riskCount = (product) => product.attributes.details.length;
  const ordered = [...candidates.values()].filter((p) => !/\bmen['’]?s\b/i.test(p.name)).sort((left, right) => riskCount(left) - riskCount(right) || left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
  // Round-robin garment families; alphabetic truncation previously crowded out tees.
  const groups = [...new Set(ordered.map((p) => p.subtype))].map((subtype) => ordered.filter((p) => p.subtype === subtype));
  const products = [];
  for (let index = 0; products.length < limit && groups.some((group) => group[index]); index++) {
    for (const group of groups) if (group[index] && products.length < limit) products.push(group[index]);
  }
  const failures = [];

  for (const anchor of PROVEN_ANCHORS) {
    if (!liveProductPages.has(anchor.retailerProductId)) continue;
    const existingIndex = products.findIndex((product) => product.canonicalUrl === anchor.canonicalUrl);
    const record = {
      id: anchor.id,
      retailerProductId: anchor.retailerProductId,
      masterProductId: anchor.retailerProductId,
      retailer: 'Aritzia', market: 'US', canonicalUrl: anchor.canonicalUrl, sourceSitemap: PRODUCT_SITEMAP,
      sourcePage: 'direct-angie-evidence', verifiedAt, status: 'active', name: anchor.name, category: anchor.category,
      imageSourceUrl: '', imageUrl: '',
      price: { amount: anchor.price, currency: 'USD' }, color: anchor.color, availableSizes: [],
      attributes: anchor.attributes, extractionConfidence: 'official-us-sitemap-plus-direct-angie-evidence',
      visualEnrichment: { model: 'direct-angie-evidence', createdAt: verifiedAt, evidence: 'approved-look-and-reviewed-history' },
    };
    if (existingIndex >= 0) products.splice(existingIndex, 1, record); else products.unshift(record);
  }
  await enrichPrivateImages(products, diagnostics);
  const visualProducts = products.filter((product) => /^https:\/\//.test(product.imageSourceUrl || '') && !/\/f7f7f7(?:$|[/?])/.test(product.imageSourceUrl || ''));
  if (visualProducts.length < minimumImages) throw new Error(`Only ${visualProducts.length} Aritzia products have usable private visual evidence.`);
  if (products.length < minimum) throw new Error(`Only ${products.length} Aritzia products passed category, US sitemap, and image verification. Scraped ${scraped.length}; candidates ${candidates.size}; first failures ${failures.slice(0, 3).join(' | ')}; pages ${JSON.stringify(diagnostics)}`);
  return { products: products.slice(0, limit), diagnostics, failures };
}
