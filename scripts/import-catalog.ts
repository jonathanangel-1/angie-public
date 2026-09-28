// Import a catalog into a running Angie server.
//   ANGIE_URL=http://127.0.0.1:3000 ANGIE_IMPORT_CODE=<your access code> npm run catalog:import -- my-catalog.json
// The file lists products (public retailer data) and brand size charts; see
// README "Add real products". Image descriptors are computed here, locally.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { describeImage } from '../lib/match/embedding';
import type { BodySizeChart, Product } from '../lib/fit/types';

type CatalogFile = { products: Array<Omit<Product, 'features'> & { imageFile?: string }>; sizeCharts?: BodySizeChart[] };

function decode(bytes: Buffer, hint: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) { const png = PNG.sync.read(bytes); return { width: png.width, height: png.height, data: png.data }; }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) { const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 }); return { width: img.width, height: img.height, data: img.data }; }
  if (/\.svg$/i.test(hint) || bytes.subarray(0, 200).toString().includes('<svg')) { const img = new Resvg(bytes.toString()).render(); return { width: img.width, height: img.height, data: img.pixels }; }
  throw new Error(`Unsupported image format for ${hint}. Use PNG, JPEG or SVG.`);
}

async function imageBytes(product: CatalogFile['products'][number], baseDir: string) {
  if (product.imageFile) return { bytes: readFileSync(resolve(baseDir, product.imageFile)), hint: product.imageFile };
  if (/^https:\/\//.test(product.image)) {
    const response = await fetch(product.image, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${product.id}: image ${response.status}`);
    return { bytes: Buffer.from(await response.arrayBuffer()), hint: product.image };
  }
  throw new Error(`${product.id}: give an https image URL or a local imageFile.`);
}

export async function buildCatalog(path: string) {
  const file = JSON.parse(readFileSync(path, 'utf8')) as CatalogFile;
  const products: Product[] = [];
  for (const product of file.products) {
    const { bytes, hint } = await imageBytes(product, dirname(path));
    const entry: Product & { imageFile?: string } = { ...product, features: describeImage(decode(bytes, hint)) };
    delete entry.imageFile;
    products.push(entry);
  }
  return { products, sizeCharts: file.sizeCharts || [] };
}

export async function importCatalog(path: string, url: string, code: string) {
  const catalog = await buildCatalog(path);
  const login = await fetch(`${url}/api/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  if (!login.ok) throw new Error('Access code rejected.');
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const response = await fetch(`${url}/api/catalog`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(catalog) });
  const result = await response.json() as { imported?: number; sizeCharts?: number; error?: string };
  if (!response.ok) throw new Error(result.error || `Import failed (${response.status}).`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  const url = process.env.ANGIE_URL || 'http://127.0.0.1:3000';
  const code = process.env.ANGIE_IMPORT_CODE || '';
  if (!path || !code) { console.error('Usage: ANGIE_IMPORT_CODE=<access code> [ANGIE_URL=...] npm run catalog:import -- <catalog.json>'); process.exit(1); }
  importCatalog(path, url, code).then(result => console.log(`Imported ${result.imported} products and ${result.sizeCharts} size charts into ${url}.`))
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
