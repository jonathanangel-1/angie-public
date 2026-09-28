import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLens, parseShopping } from '@/lib/look/sources/serpapi';
import { CATALOG_ENDPOINT, sameKind, ShopifyCatalogSource, type CatalogProduct } from '@/lib/look/sources/shopify';
import type { Garment } from '@/lib/look/types';

const garment: Garment = { id: 'g1', slot: 'outerwear', attributes: { type: 'leather biker jacket', color: 'black', pattern: 'solid', fabric: 'leather', vibe: 'edgy' }, query: 'black leather biker jacket women', crop: 'data:image/jpeg;base64,AAAA' };
// Fictional products in the documented Global Catalog response shape.
const product = (id: string, title: string, price = 12000): CatalogProduct => ({
  id, title, media: [{ type: 'image', url: `https://cdn.example.com/${id}.jpg` }],
  variants: [{ url: `https://shop.example.com/products/${id}?utm_source=shopify`, price: { amount: price, currency: 'USD' }, seller: { name: 'Fictional Seller' } }],
  options: [{ name: 'Size', values: [{ label: 'S' }, { label: 'M' }] }], rating: { value: 4.5, count: 40 }, metadata: { tech_specs: ['Fabric: 100% lambskin leather'] },
});

test('Shopify source sends a text and an image search, keeps only the same kind of garment', async () => {
  const bodies: Array<{ params: { arguments: { catalog: Record<string, unknown> } } }> = [];
  const transport = (async (url: string, init: RequestInit) => {
    assert.equal(url, CATALOG_ENDPOINT);
    const body = JSON.parse(String(init.body)); bodies.push(body);
    const isImage = 'like' in body.params.arguments.catalog;
    const products = isImage ? [product('p1', 'Moto Leather Jacket'), product('p2', 'Leather Crossbody Bag')] : [product('p3', 'Cropped Biker Jacket', 8900)];
    return Response.json({ result: { structuredContent: { products } } });
  }) as unknown as typeof fetch;
  const results = await new ShopifyCatalogSource(transport).search(garment, { limit: 10, budgetMax: 200 });
  assert.equal(bodies.length, 2);
  const text = bodies.find(b => 'query' in b.params.arguments.catalog)!.params.arguments.catalog as { query: string; filters: { price: { max: number } } };
  assert.equal(text.query, 'black leather biker jacket women');
  assert.equal(text.filters.price.max, 20000, 'budget in minor units');
  assert.deepEqual(results.map(r => r.title), ['Moto Leather Jacket', 'Cropped Biker Jacket']);
  assert.deepEqual([results[0].price, results[0].sizes, results[0].fabric], [120, ['S', 'M'], 'Fabric: 100% lambskin leather']);
  assert.ok(results[0].visual > results[1].visual, 'image-search hits carry the visual signal');
});

test('category guard rejects accessories and kids items', () => {
  assert.ok(sameKind('pants', 'Wide Leg Trousers'));
  assert.ok(!sameKind('outerwear', 'Watch Band for Jacket Lovers'));
  assert.ok(!sameKind('dress', "Girls' party dress"));
});

// Hand-written from SerpApi's documented fields; not a recorded live response.
test('SerpApi Google Lens and Shopping parsers keep priced, in-stock garments', () => {
  const lens = parseLens({ visual_matches: [
    { title: 'Leather biker jacket', link: 'https://shop.example.com/a', source: 'Example Store', thumbnail: 'https://img.example.com/a.jpg', price: { extracted_value: 199, currency: '$' } },
    { title: 'Leather jacket keyring', link: 'https://shop.example.com/b', price: { extracted_value: 9, currency: '$' } },
    { title: 'Sold out jacket', link: 'https://shop.example.com/c', price: { extracted_value: 50 }, in_stock: false },
    { title: 'Moto jacket, no price', link: 'https://shop.example.com/d' },
  ] }, 'outerwear');
  assert.deepEqual(lens.map(l => [l.title, l.price, l.currency]), [['Leather biker jacket', 199, 'USD']]);
  const shopping = parseShopping({ shopping_results: [{ title: 'Black moto jacket', product_link: 'https://shop.example.com/e', source: 'Store', extracted_price: 120 }] }, 'outerwear');
  assert.equal(shopping[0].sources[0], 'google-shopping');
});
