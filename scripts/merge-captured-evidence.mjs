import fs from 'node:fs';
const target = new URL('../data/verified-catalog.json', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(target, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(new URL('../../outputs/live-image-suite/browser-evidence.json', import.meta.url), 'utf8'));
const byId = new Map(evidence.products.map(product => [product.id, product]));
let updated = 0;
for (const product of catalog.products) {
  const fresh = byId.get(product.id);
  if (!fresh?.privateImageEvidence || product.privateImageEvidence || fresh.canonicalUrl !== product.canonicalUrl || fresh.privateImageEvidence.sourceUrl !== fresh.imageSourceUrl) continue;
  product.imageSourceUrl = fresh.imageSourceUrl;
  product.privateImageEvidence = fresh.privateImageEvidence;
  product.visualEvidenceColorId = fresh.visualEvidenceColorId;
  updated++;
}
fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ updated, products: catalog.products.length }));
