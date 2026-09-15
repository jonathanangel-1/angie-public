import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAritzia } from './catalog-sources/aritzia.mjs';
import { collectMassimoDutti } from './catalog-sources/massimo-dutti.mjs';
import { inheritStableVisualEvidence } from './catalog-evidence.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUTPUT = path.join(ROOT, 'data', 'verified-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'catalog');

async function currentCatalog() {
  try { return JSON.parse(await readFile(OUTPUT, 'utf8')); }
  catch { return { products: [] }; }
}

async function main() {
  const generatedAt = new Date().toISOString();
  await mkdir(IMAGE_DIR, { recursive: true });
  const previous = await currentCatalog();
  const previousById = new Map((previous.products || []).map((product) => [product.id, product]));

  const aritzia = await collectAritzia({ root: ROOT, imageDir: IMAGE_DIR, verifiedAt: generatedAt });
  const massimo = await collectMassimoDutti({ imageDir: IMAGE_DIR, verifiedAt: generatedAt });
  const products = [...aritzia.products, ...massimo.products]
    .map((product) => inheritStableVisualEvidence(product, previousById));
  if (products.length < 180) throw new Error(`Only ${products.length} products passed two-store verification.`);

  const retailers = [...new Set(products.map((product) => product.retailer))].sort();
  const catalog = {
    version: `aritzia-massimo-us-${generatedAt.slice(0, 10)}`,
    generatedAt,
    source: ['Aritzia US product sitemap + current category pages', 'Massimo Dutti US current category pages'],
    retailer: retailers.join(' + '),
    productCount: products.length,
    products,
    diagnostics: {
      previousVersion: previous.version || null,
      retailers: Object.fromEntries(retailers.map((retailer) => [retailer, products.filter((product) => product.retailer === retailer).length])),
      categories: Object.fromEntries(['top', 'bottom', 'dress', 'layer', 'shoes'].map((category) => [category, products.filter((product) => product.category === category).length])),
      aritzia: { pages: aritzia.diagnostics, imageFailures: aritzia.failures.slice(0, 30) },
      massimoDutti: { pages: massimo.diagnostics, imageFailures: massimo.failures.slice(0, 30) },
    },
  };
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`);
  await rename(temporary, OUTPUT);
  await import('./normalize-local-catalog.mjs');
  console.log(JSON.stringify({ ok: true, version: catalog.version, products: catalog.productCount, retailers: catalog.diagnostics.retailers, categories: catalog.diagnostics.categories }, null, 2));
}

await main();
