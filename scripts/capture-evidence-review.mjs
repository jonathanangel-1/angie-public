import fs from 'node:fs';
import path from 'node:path';
import { enrichPrivateImages } from './catalog-sources/aritzia.mjs';

// Evidence collection only: do not mutate the running benchmark's catalog.
const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/verified-catalog.json'), 'utf8'));
const groups = new Map();
for (const product of catalog.products.filter(p => p.retailer === 'Aritzia' && !p.privateImageEvidence && p.masterProductId)) {
  const key = product.subtype || product.category;
  groups.set(key, [...(groups.get(key) || []), product]);
}
const selected = [];
while ([...groups.values()].some(group => group.length) && selected.length < 40) {
  for (const group of groups.values()) if (group.length && selected.length < 40) selected.push(group.shift());
}
const diagnostics = [];
await enrichPrivateImages(selected, diagnostics, 40);
const captured = selected.filter(p => p.privateImageEvidence);
const out = path.join(root, '../outputs/live-image-suite/browser-evidence.json');
fs.writeFileSync(out, JSON.stringify({ diagnostics, products: captured }, null, 2));
console.log(JSON.stringify({ captured: captured.length, diagnostics, output: out }));
