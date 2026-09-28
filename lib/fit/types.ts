export type Category = 'top' | 'dress' | 'bottom' | 'layer';
export const CATEGORIES: Category[] = ['top', 'dress', 'bottom', 'layer'];

// Circumference dimensions, in inches. Inseam is a length and is checked separately.
export type Dimension = 'bust' | 'waist' | 'hips';
export const DIMENSIONS: Dimension[] = ['bust', 'waist', 'hips'];
export const DIMENSIONS_BY_CATEGORY: Record<Category, Dimension[]> = {
  // Tops hang from the bust; a tee's waist measurement rarely decides its size.
  top: ['bust'],
  dress: ['bust', 'waist', 'hips'],
  bottom: ['waist', 'hips'],
  layer: ['bust'],
};
export type FitArea = Dimension | 'length';

export type BodyMeasurements = Partial<Record<Dimension | 'inseam' | 'height', number>>;

export type FitIntent = 'fitted' | 'regular' | 'relaxed';

export type Range = [number, number];

// A brand's published body-measurement chart ("size M fits hips 38–40 in").
export type BodySizeChart = {
  id: string;
  brand: string;
  category: Category;
  sizes: Array<{ size: string; body: Partial<Record<Dimension, Range>> }>;
};

// Actual garment measurements for one product ("size M hips measure 42 in").
export type GarmentSizes = Array<{ size: string; garment: Partial<Record<Dimension, number>> }>;

export type Product = {
  id: string;
  brand: string;
  name: string;
  category: Category;
  subtype: string;
  color: string;
  price: number | null;
  currency: string;
  url: string;
  image: string;
  sizes: string[];
  fitIntent: FitIntent;
  sizeChartId?: string;
  garmentSizes?: GarmentSizes;
  inseam?: number;
  features?: import('@/lib/match/embedding').ImageFeatures;
};

// A garment she owns and likes the fit of, measured flat and doubled.
export type ReferenceGarment = {
  id: string;
  category: Category;
  label: string;
  measurements: Partial<Record<Dimension, number>>;
};

export type OutcomeFit =
  | 'fits'
  | 'tight'
  | 'loose'
  | 'too-small'
  | 'too-large'
  | 'too-short'
  | 'too-long'
  | 'not-fit';

export type Outcome = {
  id: string;
  brand: string;
  category: Category;
  size: string;
  productId?: string | null;
  result: 'kept' | 'returned';
  fit: OutcomeFit;
  area?: FitArea | null;
  reason?: 'style' | 'quality' | 'other' | null;
  createdAt: number;
};

export type FitProfile = {
  body: BodyMeasurements;
  references: ReferenceGarment[];
};

export type Confidence = 'high' | 'medium' | 'low';

export type DimensionCheck = {
  dimension: Dimension;
  yours: number;
  adjustment: number;
  range: Range;
  source: 'body-chart' | 'garment';
  status: 'inside' | 'tight' | 'loose';
  spare: number;
};

export type SizeRecommendation = {
  size: string | null;
  confidence: Confidence;
  score: number;
  note: string;
  runnerUp: string | null;
  checks: DimensionCheck[];
};
