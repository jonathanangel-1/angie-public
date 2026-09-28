import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import catalog from '../data/demo/catalog.json';
import { emptyLearnedFit, learnFit } from '@/lib/fit/model';
import type { BodySizeChart, FitProfile, Product } from '@/lib/fit/types';
import { describeImage, EMBEDDER_VERSION } from '@/lib/match/embedding';
import { guessCategory, rankProducts } from '@/lib/match/rank';

const products = catalog.products as unknown as Product[];
const charts = catalog.sizeCharts as unknown as BodySizeChart[];
const profile: FitProfile = { body: { bust: 36, waist: 29, hips: 40.5, inseam: 31 }, references: [] };
const inspiration = (file: string) => {
  const png = PNG.sync.read(readFileSync(new URL(`../public/demo/inspiration/${file}`, import.meta.url)));
  return describeImage({ width: png.width, height: png.height, data: png.data });
};

const cases = [
  { file: 'inspiration-01-navy-wide-leg.png', category: 'bottom', color: 'navy', expected: ['nf-navy-wide-leg', 'jv-navy-wide-leg'] },
  { file: 'inspiration-02-camel-wrap-dress.png', category: 'dress', color: 'camel', expected: ['nf-camel-wrap-dress'] },
  { file: 'inspiration-03-white-tee.png', category: 'top', color: 'white', expected: ['da-white-crew-tee', 'mb-white-vneck-tee'] },
  { file: 'inspiration-04-black-blazer.png', category: 'layer', color: 'black', expected: ['nf-black-blazer'] },
] as const;

test('the catalog was indexed with the current image descriptor', () => {
  assert.equal(catalog.embedderVersion, EMBEDDER_VERSION);
  assert.ok(products.every(p => p.features?.version === EMBEDDER_VERSION));
});

for (const c of cases) {
  test(`${c.file}: guesses ${c.category}, names ${c.color}, and ranks the look-alike first`, () => {
    const query = inspiration(c.file);
    assert.equal(query.colorName, c.color);
    assert.equal(guessCategory(query, products).category, c.category);
    const results = rankProducts(query, c.category, products, profile, emptyLearnedFit(), charts);
    assert.ok((c.expected as readonly string[]).includes(results[0].product.id), `top result was ${results[0].product.id}`);
    assert.ok(results[0].similarity.total > 0.9);
    assert.ok(results.every(r => r.product.category === c.category));
    assert.ok(results.every(r => !('features' in r.product)), 'descriptors are not sent to the browser');
  });
}

test('a same-silhouette item in another colour ranks below a same-colour item', () => {
  const results = rankProducts(inspiration('inspiration-02-camel-wrap-dress.png'), 'dress', products, profile, emptyLearnedFit(), charts);
  const camel = results.findIndex(r => r.product.id === 'nf-camel-wrap-dress');
  const green = results.findIndex(r => r.product.id === 'da-green-wrap-dress');
  assert.ok(camel < green);
  assert.match(results[green].similarity.explanation, /different colour/);
});

test('equal look-alikes are ordered by fit confidence', () => {
  const learned = learnFit(profile, [{ id: 'o1', brand: 'Juniper & Vale', category: 'bottom', size: 'M', result: 'kept', fit: 'fits', createdAt: 1 }], charts, products);
  const results = rankProducts(inspiration('inspiration-01-navy-wide-leg.png'), 'bottom', products, profile, learned, charts);
  assert.equal(results[0].product.id, 'jv-navy-wide-leg');
  assert.equal(results[0].fit.confidence, 'high');
});

test('a product returned for style is not shown again', () => {
  const learned = learnFit(profile, [{ id: 'o1', brand: 'Northfield Studio', category: 'dress', size: 'M', productId: 'nf-camel-wrap-dress', result: 'returned', fit: 'not-fit', reason: 'style', createdAt: 1 }], charts, products);
  const results = rankProducts(inspiration('inspiration-02-camel-wrap-dress.png'), 'dress', products, profile, learned, charts);
  assert.ok(!results.some(r => r.product.id === 'nf-camel-wrap-dress'));
});

test('the descriptor ignores background gradients, scale and slight rotation', () => {
  const query = inspiration('inspiration-03-white-tee.png');
  assert.ok(query.foreground > 0.1 && query.foreground < 0.5, `foreground ${query.foreground}`);
});
