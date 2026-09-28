import type { Adjustment } from '@/lib/fit/model';
import type { BodyMeasurements, Category, Outcome, ReferenceGarment } from '@/lib/fit/types';
import { describeImage, type ImageFeatures } from '@/lib/match/embedding';
import type { RankedResult } from '@/lib/match/rank';

export type ProfileSummary = {
  userId: string;
  demo: boolean;
  body: BodyMeasurements;
  references: ReferenceGarment[];
  adjustments: Array<Adjustment & { text: string }>;
  lengthNotes: Array<{ brand: string; category: Category; fit: string }>;
  outcomes: Array<Outcome & { productName: string | null }>;
  brands: string[];
  productCount: number;
};
export type SearchResponse = {
  searchId: string;
  query: { colorName: string; category: Category | null; guessedCategory: Category | null; guessConfidence: number };
  results: RankedResult[];
};
export type OutcomeResponse = {
  outcome: Outcome;
  changed: Array<{ text: string }>;
  recommendation: { productId: string; before: RankedResult['fit']; after: RankedResult['fit'] } | null;
  profile: ProfileSummary;
};

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || 'Something went wrong.');
  return data as T;
}

// The photo stays in the browser; only this descriptor is sent.
export async function describeFile(file: Blob): Promise<ImageFeatures> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return describeImage({ width: pixels.width, height: pixels.height, data: pixels.data });
}

export const CATEGORY_LABEL: Record<Category, string> = { top: 'Top', dress: 'Dress', bottom: 'Bottom', layer: 'Jacket' };
export const CM_PER_INCH = 2.54;
