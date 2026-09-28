import { CATEGORIES, DIMENSIONS, type BodyMeasurements, type BodySizeChart, type Category, type FitArea, type FitProfile, type Outcome, type OutcomeFit, type Product, type ReferenceGarment } from '@/lib/fit/types';
import { EMBEDDER_VERSION, type ImageFeatures } from '@/lib/match/embedding';

export class InputError extends Error {}

const FITS: OutcomeFit[] = ['fits', 'tight', 'loose', 'too-small', 'too-large', 'too-short', 'too-long', 'not-fit'];
const AREAS: FitArea[] = ['bust', 'waist', 'hips', 'length'];
const REASONS = ['style', 'quality', 'other'] as const;
const LIMITS: Record<keyof BodyMeasurements, [number, number]> = { bust: [20, 70], waist: [18, 70], hips: [20, 75], inseam: [20, 40], height: [48, 84] };

const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
export const category = (value: unknown): Category => {
  if (!CATEGORIES.includes(value as Category)) throw new InputError('Choose a category.');
  return value as Category;
};

function measurement(name: string, value: unknown, [low, high]: [number, number]) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < low || number > high) throw new InputError(`${name} must be between ${low} and ${high} inches.`);
  return Math.round(number * 10) / 10;
}

export function parseProfile(input: unknown): FitProfile {
  const body: BodyMeasurements = {};
  const rawBody = record(record(input).body);
  for (const key of Object.keys(LIMITS) as Array<keyof BodyMeasurements>) {
    const value = measurement(key, rawBody[key], LIMITS[key]);
    if (value !== undefined) body[key] = value;
  }
  const rawReferences = record(input).references;
  const references: ReferenceGarment[] = (Array.isArray(rawReferences) ? rawReferences : []).slice(0, 20).map((raw, index) => {
    const ref = record(raw);
    const measurements: ReferenceGarment['measurements'] = {};
    for (const d of DIMENSIONS) {
      const value = measurement(`Garment ${d}`, record(ref.measurements)[d], [20, 90]);
      if (value !== undefined) measurements[d] = value;
    }
    if (!Object.keys(measurements).length) throw new InputError('A reference garment needs at least one measurement.');
    return { id: text(ref.id, 60) || `ref-${index + 1}`, category: category(ref.category), label: text(ref.label, 80) || 'Garment I like', measurements };
  });
  return { body, references };
}

export function parseOutcome(input: unknown, now: number): Omit<Outcome, 'id'> & { searchId: string | null } {
  const raw = record(input);
  const result = raw.result === 'kept' || raw.result === 'returned' ? raw.result : null;
  if (!result) throw new InputError('Choose kept or returned.');
  const fit = FITS.includes(raw.fit as OutcomeFit) ? raw.fit as OutcomeFit : null;
  if (!fit) throw new InputError('Say how it fitted.');
  const size = text(raw.size, 12);
  const brand = text(raw.brand, 60);
  if (!size || !brand) throw new InputError('Brand and size are required.');
  const area = raw.area ? (AREAS.includes(raw.area as FitArea) ? raw.area as FitArea : null) : null;
  const reason = REASONS.includes(raw.reason as typeof REASONS[number]) ? raw.reason as typeof REASONS[number] : null;
  if (fit === 'not-fit' && result === 'returned' && !reason) throw new InputError('Say why it went back.');
  return { brand, category: category(raw.category), size, productId: text(raw.productId, 80) || null, result, fit, area, reason, createdAt: now, searchId: text(raw.searchId, 60) || null };
}

export function parseFeatures(input: unknown): ImageFeatures {
  const raw = record(input);
  if (raw.version !== EMBEDDER_VERSION) throw new InputError('This image descriptor version is not supported. Reload the page.');
  const numbers = (value: unknown, length: number) => {
    if (!Array.isArray(value) || value.length !== length || !value.every(v => typeof v === 'number' && Number.isFinite(v))) throw new InputError('Invalid image descriptor.');
    return value as number[];
  };
  const aspect = Number(raw.aspect);
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect > 20) throw new InputError('Invalid image descriptor.');
  return { version: EMBEDDER_VERSION, shape: numbers(raw.shape, 144), color: numbers(raw.color, 65), aspect, colorName: text(raw.colorName, 20) || 'unknown', foreground: Number(raw.foreground) || 0 };
}

// Imported catalogs are public retailer data plus descriptors computed by
// scripts/import-catalog.ts. Validate shape; never trust URLs to be anything but https.
export function parseCatalog(input: unknown): { products: Product[]; sizeCharts: BodySizeChart[] } {
  const raw = record(input);
  const products = (Array.isArray(raw.products) ? raw.products : []).slice(0, 5000).map(value => {
    const p = record(value);
    const url = text(p.url, 500);
    if (!/^https:\/\//.test(url)) throw new InputError(`Product ${text(p.id, 80)} needs an https buy link.`);
    return { ...(p as unknown as Product), id: text(p.id, 80), brand: text(p.brand, 60), name: text(p.name, 120), category: category(p.category), url, features: parseFeatures(p.features) };
  });
  const sizeCharts = (Array.isArray(raw.sizeCharts) ? raw.sizeCharts : []).slice(0, 500).map(value => {
    const c = record(value);
    return { ...(c as unknown as BodySizeChart), id: text(c.id, 80), brand: text(c.brand, 60), category: category(c.category) };
  });
  if (!products.length) throw new InputError('The catalog has no products.');
  return { products, sizeCharts };
}
