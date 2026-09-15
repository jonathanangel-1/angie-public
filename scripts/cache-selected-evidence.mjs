import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { enrichPrivateImages } from './catalog-sources/aritzia.mjs';
const file = new URL('../data/verified-catalog.json', import.meta.url);
const catalog = JSON.parse(await readFile(file, 'utf8'));
catalog.products = catalog.products.filter((p) => !/\bmen['’]?s\b/i.test(p.name));
// Explicitly regenerate only machine-created evidence, never user photos.
if (process.env.ANGIE_RECAPTURE === '1') for (const product of catalog.products) delete product.privateImageEvidence;
const aritzia = catalog.products.filter((p) => p.retailer === 'Aritzia' && !p.privateImageEvidence && p.imageSourceUrl);
const selected = [];
for (const subtype of ['tee', 'shirt', 'trouser', 'cami', 'skirt', 'dress', 'jacket', 'coat']) {
  selected.push(...aritzia.filter((p) => p.subtype === subtype).sort((a,b) => Number(!/white|black|navy/i.test(a.color)) - Number(!/white|black|navy/i.test(b.color))).slice(0, 6));
}
const diagnostics = [];
await enrichPrivateImages(selected, diagnostics, Number(process.env.ANGIE_CAPTURE_LIMIT || 48));
catalog.diagnostics.privateEvidenceCache = diagnostics;
await writeFile(file, JSON.stringify(catalog, null, 2) + '\n');
const previewDir = new URL('../outputs/capture-review/', import.meta.url);
await mkdir(previewDir, { recursive: true });
for (const product of catalog.products.filter((p) => p.privateImageEvidence)) {
  await writeFile(new URL(`${product.id}.jpg`, previewDir), Buffer.from(product.privateImageEvidence.dataUrl.split(',')[1], 'base64'));
}
console.log(JSON.stringify({ cached: catalog.products.filter((p) => p.privateImageEvidence).length, diagnostics }));
