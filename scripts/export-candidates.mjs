import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(projectDir, '../outputs/angie-trouser-poc-v1/build_angie_trouser_poc.mjs');
const source = await fs.readFile(sourcePath, 'utf8');

const productsText = source.match(/const products = (\[[\s\S]*?\n\]);\n\nconst blindOrder/);
const blindText = source.match(/const blindOrder = (\[[^;]+\]);/);

if (!productsText || !blindText) throw new Error('Could not locate product evidence in source workbook builder.');

const products = Function(`"use strict"; return (${productsText[1]});`)();
const blindOrder = Function(`"use strict"; return (${blindText[1]});`)();

const localImages = {
  T01: '/products/image.jpg', T03: '/products/image2.jpg', T05: '/products/image3.jpg',
  T07: '/products/image4.jpg', T09: '/products/image5.jpg', T11: '/products/image6.jpg',
  T13: '/products/image7.jpg', T16: '/products/image8.jpg', T18: '/products/image9.jpg',
  T20: '/products/image10.jpg', T22: '/products/image11.jpg', T24: '/products/image12.jpg',
  T25: '/products/image13.jpg', T27: '/products/image14.jpg', T29: '/products/image15.jpg',
};

const candidates = blindOrder.map((productIndex, index) => {
  const candidateId = `T${String(index + 1).padStart(2, '0')}`;
  const product = products[productIndex];
  return {
    id: candidateId,
    retailer: product.retailer,
    name: product.name,
    color: product.color,
    price: product.price,
    likelySize: product.likelySize,
    cut: product.cut,
    length: product.length,
    fabric: product.fabric,
    description: product.description,
    url: product.url,
    image: localImages[candidateId] ?? product.imageUrl,
    privateScore: Math.round((product.taste * 0.5 + product.fit * 0.35 + product.material * 0.15) * 20) / 20,
    privateTaste: product.taste,
    privateFit: product.fit,
    privateMaterial: product.material,
    privateConfidence: product.confidence,
    privateWhy: product.why,
    privateRisk: product.risk,
    privateMeasurements: product.measurements,
    privateAnchor: product.anchor,
  };
});

await fs.mkdir(path.join(projectDir, 'data'), { recursive: true });
await fs.writeFile(path.join(projectDir, 'data/candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`);
console.log(`Exported ${candidates.length} candidates.`);
