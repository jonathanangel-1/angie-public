import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inferTaxonomy } from './catalog-taxonomy.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(path.join(ROOT, 'data', 'verified-catalog.json'), 'utf8'));
const errors = [];
const ids = new Set();
const urls = new Set();
const now = Date.now();

for (const product of catalog.products || []) {
  if (!product.id || ids.has(product.id)) errors.push(`duplicate/missing id: ${product.id}`);
  ids.add(product.id);
  if (!product.canonicalUrl || urls.has(product.canonicalUrl)) errors.push(`duplicate/missing URL: ${product.id}`);
  urls.add(product.canonicalUrl);
  let url;
  try { url = new URL(product.canonicalUrl); } catch { errors.push(`invalid URL: ${product.id}`); }
  if (url) {
    const aritzia = url.hostname === 'www.aritzia.com' && url.pathname.startsWith('/us/en/product/');
    const massimo = url.hostname === 'www.massimodutti.com' && url.pathname.startsWith('/us/') && (url.searchParams.has('pelement') || /-l\d+$/i.test(url.pathname));
    if (!aritzia && !massimo) errors.push(`wrong market/page: ${product.id}`);
  }
  if (product.status !== 'active') errors.push(`inactive: ${product.id}`);
  if (product.imageUrl && !product.imageUrl.startsWith('/catalog/')) errors.push(`non-local image: ${product.id}`);
  if (product.imageUrl) errors.push(`product photo must stay out of the Angie UI catalog: ${product.id}`);
  if (product.imageSourceUrl && (!/^https:\/\//.test(product.imageSourceUrl) || /\/f7f7f7(?:$|[/?])/.test(product.imageSourceUrl))) errors.push(`unusable private image evidence: ${product.id}`);
  if (!product.verifiedAt || now - Date.parse(product.verifiedAt) > 72 * 60 * 60 * 1000) errors.push(`stale: ${product.id}`);
  if (!['top', 'bottom', 'dress', 'layer', 'shoes'].includes(product.category)) errors.push(`bad category: ${product.id}`);
  const taxonomy = inferTaxonomy(product.name, product.sourcePage || '');
  if (!product.subtype || product.subtype === 'unknown') errors.push(`missing subtype: ${product.id}`);
  if (taxonomy.subtype !== 'unknown' && (taxonomy.category !== product.category || taxonomy.subtype !== product.subtype)) errors.push(`taxonomy mismatch: ${product.id}`);
}

const products = catalog.products || [];
if (products.length < 180) errors.push('catalog has fewer than 180 verified products');
for (const [retailer, minimum] of [['Aritzia', 100], ['Massimo Dutti', 50]]) {
  if (products.filter((product) => product.retailer === retailer).length < minimum) errors.push(`${retailer} has fewer than ${minimum} verified products`);
}
for (const [category, minimum] of [['top', 35], ['bottom', 35], ['dress', 15], ['layer', 12], ['shoes', 5]]) {
  if (products.filter((product) => product.category === category).length < minimum) errors.push(`${category} has fewer than ${minimum} verified products`);
}
for (const [subtype, minimum] of [['tee', 5], ['trouser', 20], ['jean', 10], ['skirt', 10], ['heel', 2]]) {
  if (products.filter((product) => product.subtype === subtype).length < minimum) errors.push(`${subtype} has fewer than ${minimum} verified products`);
}
const visualProducts = products.filter((product) => /^https:\/\//.test(product.imageSourceUrl || '') && !/\/f7f7f7(?:$|[/?])/.test(product.imageSourceUrl || ''));
if (visualProducts.length < 100) errors.push('catalog has fewer than 100 products with private visual evidence');
if (visualProducts.filter((product) => product.retailer === 'Aritzia').length < 70) errors.push('Aritzia has fewer than 70 products with private visual evidence');
if (visualProducts.filter((product) => product.retailer === 'Massimo Dutti').length < 80) errors.push('Massimo Dutti has fewer than 80 products with private visual evidence');
for (const [category, minimum] of [['top', 20], ['bottom', 25], ['dress', 8], ['layer', 15], ['shoes', 8]]) {
  if (visualProducts.filter((product) => product.category === category).length < minimum) errors.push(`${category} has fewer than ${minimum} products with private visual evidence`);
}
for (const [subtype, minimum] of [['tee', 3], ['trouser', 3], ['jean', 3], ['skirt', 3], ['dress', 3], ['blazer', 3], ['heel', 2]]) {
  if (visualProducts.filter((product) => product.subtype === subtype).length < minimum) errors.push(`${subtype} has fewer than ${minimum} products with private visual evidence`);
}
if (!products.some((product) => product.subtype === 'trouser' && product.attributes?.colorFamily === 'navy' && !/barrel|balloon|baggy|technical/i.test(`${product.name} ${(product.attributes?.details || []).join(' ')}`))) errors.push('no usable navy trouser coverage');
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, version: catalog.version, products: catalog.products.length }, null, 2));
}
