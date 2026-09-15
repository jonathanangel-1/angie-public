import type { InspirationGarment } from '@/lib/inspiration-types';

type ProductLike = {
  category: string;
  subtype?: string;
  name: string;
  color: string;
  attributes: Record<string, unknown>;
};

type Vector = Map<string, number>;

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();
const canonical = (value: unknown) => norm(value)
  .replace(/t-?shirt/g, 'tee')
  .replace(/pants?/g, 'trouser')
  .replace(/gray/g, 'grey')
  .replace(/full[- ]length/g, 'full')
  .replace(/body[- ]hugging|second[- ]skin/g, 'bodycon')
  .replace(/slim/g, 'fitted')
  .replace(/wide[- ]leg|oversized?/g, 'relaxed');

function add(vector: Vector, field: string, value: unknown, weight: number) {
  const clean = canonical(value);
  if (!clean || clean === 'unknown') return;
  vector.set(`${field}:${clean}`, Math.max(vector.get(`${field}:${clean}`) || 0, weight));
}

function details(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function productVector(product: ProductLike): Vector {
  const vector = new Map<string, number>();
  const attrs = product.attributes || {};
  add(vector, 'category', product.category, 10);
  add(vector, 'subtype', product.subtype, 14);
  add(vector, 'color', attrs.colorFamily || product.color, 5);
  add(vector, 'silhouette', attrs.silhouette, 9);
  add(vector, 'length', attrs.length, 6);
  add(vector, 'rise', attrs.rise, 6);
  add(vector, 'neckline', attrs.neckline, 5);
  add(vector, 'sleeve', attrs.sleeve, 4);
  add(vector, 'material', attrs.composition, 3);
  for (const value of [...details(attrs.details), ...details(attrs.visualDetails)]) add(vector, 'detail', value, 3);
  for (const token of canonical(`${product.name} ${attrs.publicDescription || ''}`).split(/[^a-z0-9]+/).filter((token) => token.length > 2)) add(vector, 'word', token, 1);
  return vector;
}

function garmentVector(garment: InspirationGarment): Vector {
  const vector = new Map<string, number>();
  add(vector, 'category', garment.category, 10);
  add(vector, 'subtype', garment.subtype, 14);
  add(vector, 'color', garment.colorFamily, 5);
  add(vector, 'silhouette', garment.silhouette, 9);
  add(vector, 'length', garment.length, 6);
  add(vector, 'rise', garment.rise, 6);
  add(vector, 'neckline', garment.neckline, 5);
  add(vector, 'sleeve', garment.sleeve, 4);
  add(vector, 'material', garment.material, 3);
  for (const value of garment.details || []) add(vector, 'detail', value, 3);
  return vector;
}

function cosine(left: Vector, right: Vector) {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const [key, value] of right) {
    rightNorm += value * value;
    dot += value * (left.get(key) || 0);
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function styleSimilarity(product: ProductLike, garment: InspirationGarment) {
  return Math.round(cosine(productVector(product), garmentVector(garment)) * 1000) / 10;
}
