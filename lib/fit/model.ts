import {
  DIMENSIONS_BY_CATEGORY,
  type BodySizeChart,
  type Category,
  type Confidence,
  type Dimension,
  type DimensionCheck,
  type FitIntent,
  type FitProfile,
  type Outcome,
  type Product,
  type Range,
  type SizeRecommendation,
} from '@/lib/fit/types';

// How far past a size boundary a "too small"/"too big" return pushes her
// effective measurement, so the same size is not recommended again.
export const RETURN_MARGIN = 0.5;
const GARMENT_TOLERANCE = 1;
const BETWEEN_SIZES_EDGE = 0.3;
// Slightly loose can be belted or tailored; slightly tight gets returned.
const LOOSE_WEIGHT = 0.5;

// Garment circumference minus body circumference, in inches, when she has not
// measured a garment she likes in this category.
const DEFAULT_EASE: Record<Category, Record<FitIntent, Partial<Record<Dimension, number>>>> = {
  top: { fitted: { bust: 1.5, waist: 2 }, regular: { bust: 3, waist: 4 }, relaxed: { bust: 5, waist: 7 } },
  dress: { fitted: { bust: 1.5, waist: 1, hips: 2 }, regular: { bust: 3, waist: 2, hips: 3 }, relaxed: { bust: 5, waist: 4, hips: 6 } },
  bottom: { fitted: { waist: 0.5, hips: 1.5 }, regular: { waist: 1, hips: 2.5 }, relaxed: { waist: 2, hips: 5 } },
  layer: { fitted: { bust: 3 }, regular: { bust: 4 }, relaxed: { bust: 6 } },
};

type AdjustmentArea = Dimension | 'inseam';
export type Adjustment = { brand: string; category: Category; area: AdjustmentArea; offset: number; observations: number };
export type LearnedFit = {
  adjustments: Adjustment[];
  evidence: Array<{ brand: string; category: Category; size: string; result: Outcome['result']; fit: Outcome['fit']; productId?: string | null }>;
  lengthNotes: Array<{ brand: string; category: Category; fit: 'too-short' | 'too-long' }>;
  excludedProducts: string[];
};

export const emptyLearnedFit = (): LearnedFit => ({ adjustments: [], evidence: [], lengthNotes: [], excludedProducts: [] });

const round = (value: number) => Math.round(value * 10) / 10;
export const inches = (value: number) => `${round(value)} in`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${round(Math.abs(value))} in`;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function offsetFor(learned: LearnedFit, brand: string, category: Category, area: AdjustmentArea) {
  const exact = learned.adjustments.find(a => a.brand === brand && a.category === category && a.area === area);
  if (exact) return { value: exact.offset, source: 'brand-category' as const };
  // A brand that runs small in dresses probably runs small in skirts too, and a
  // general preference for room carries over to brands she has never ordered.
  const sameBrand = learned.adjustments.filter(a => a.brand === brand && a.area === area);
  if (sameBrand.length) return { value: 0.75 * mean(sameBrand.map(a => a.offset)), source: 'brand' as const };
  const general = learned.adjustments.filter(a => a.area === area);
  if (general.length) return { value: 0.5 * mean(general.map(a => a.offset)), source: 'general' as const };
  return { value: 0, source: null };
}

function preferredEase(profile: FitProfile, category: Category, dimension: Dimension, intent: FitIntent) {
  const body = profile.body[dimension];
  const references = profile.references.filter(r => r.category === category && r.measurements[dimension] != null);
  if (body != null && references.length) return { ease: mean(references.map(r => r.measurements[dimension]! - body)), fromReference: true };
  return { ease: DEFAULT_EASE[category][intent][dimension] ?? 2, fromReference: false };
}

type Interval = { range: Range; source: DimensionCheck['source']; fromReference?: boolean };

export function intervalsFor(brand: string, category: Category, size: string, product: Product | undefined, profile: FitProfile, charts: BodySizeChart[]) {
  const intervals: Partial<Record<Dimension, Interval>> = {};
  const garmentRow = product?.garmentSizes?.find(row => row.size === size);
  if (garmentRow) {
    for (const [dimension, value] of Object.entries(garmentRow.garment) as Array<[Dimension, number]>) {
      const { ease, fromReference } = preferredEase(profile, category, dimension, product?.fitIntent || 'regular');
      intervals[dimension] = { range: [value - ease - GARMENT_TOLERANCE, value - ease + GARMENT_TOLERANCE], source: 'garment', fromReference };
    }
    return intervals;
  }
  const chart = charts.find(c => (product?.sizeChartId ? c.id === product.sizeChartId : c.brand === brand && c.category === category));
  const row = chart?.sizes.find(entry => entry.size === size);
  for (const [dimension, range] of Object.entries(row?.body || {}) as Array<[Dimension, Range]>) intervals[dimension] = { range, source: 'body-chart' };
  return intervals;
}

// Replays every keep/return in order. The learned state is a pure function of
// the outcome log, so changing this algorithm never needs a data migration.
export function learnFit(profile: FitProfile, outcomes: Outcome[], charts: BodySizeChart[], products: Product[]): LearnedFit {
  const learned = emptyLearnedFit();
  const byId = new Map(products.map(p => [p.id, p]));
  const set = (brand: string, category: Category, area: AdjustmentArea, offset: number) => {
    const existing = learned.adjustments.find(a => a.brand === brand && a.category === category && a.area === area);
    if (existing) { existing.offset = offset; existing.observations += 1; }
    else learned.adjustments.push({ brand, category, area, offset, observations: 1 });
  };
  for (const outcome of [...outcomes].sort((a, b) => a.createdAt - b.createdAt)) {
    const product = outcome.productId ? byId.get(outcome.productId) : undefined;
    learned.evidence.push({ brand: outcome.brand, category: outcome.category, size: outcome.size, result: outcome.result, fit: outcome.fit, productId: outcome.productId });
    if (outcome.result === 'returned' && outcome.productId && ['style', 'quality'].includes(outcome.reason || '')) learned.excludedProducts.push(outcome.productId);
    if (outcome.fit === 'not-fit') continue;

    if (outcome.fit === 'too-long' || outcome.fit === 'too-short') {
      const preferred = profile.body.inseam;
      if (outcome.category === 'bottom' && product?.inseam && preferred != null) {
        const current = preferred + offsetFor(learned, outcome.brand, outcome.category, 'inseam').value;
        const target = outcome.fit === 'too-long' ? product.inseam - 2 * RETURN_MARGIN : product.inseam + 2 * RETURN_MARGIN;
        const delta = outcome.fit === 'too-long' ? Math.min(0, target - current) : Math.max(0, target - current);
        set(outcome.brand, outcome.category, 'inseam', current - preferred + delta);
      } else learned.lengthNotes.push({ brand: outcome.brand, category: outcome.category, fit: outcome.fit });
      continue;
    }

    const intervals = intervalsFor(outcome.brand, outcome.category, outcome.size, product, profile, charts);
    const dimensions = DIMENSIONS_BY_CATEGORY[outcome.category].filter(d => profile.body[d] != null && intervals[d]);
    if (!dimensions.length) continue;
    const effective = (d: Dimension) => profile.body[d]! + offsetFor(learned, outcome.brand, outcome.category, d).value;
    const move = (d: Dimension, delta: number) => set(outcome.brand, outcome.category, d, effective(d) - profile.body[d]! + delta);

    // Where in the size's range she sits: 0 at its lower limit, 1 at its upper.
    const position = (d: Dimension) => {
      const [low, high] = intervals[d]!.range;
      return (effective(d) - low) / Math.max(0.5, high - low);
    };
    if (['too-small', 'tight'].includes(outcome.fit)) {
      // Without a stated area, blame the dimension that was already closest to
      // the size's upper limit.
      const area = outcome.area && dimensions.includes(outcome.area as Dimension) ? outcome.area as Dimension
        : dimensions.reduce((a, b) => position(a) >= position(b) ? a : b);
      const target = intervals[area]!.range[1] + (outcome.fit === 'too-small' ? RETURN_MARGIN : 0);
      move(area, Math.max(0, target - effective(area)));
    } else if (['too-large', 'loose'].includes(outcome.fit)) {
      const area = outcome.area && dimensions.includes(outcome.area as Dimension) ? outcome.area as Dimension
        : dimensions.reduce((a, b) => position(a) <= position(b) ? a : b);
      const target = intervals[area]!.range[0] - (outcome.fit === 'too-large' ? RETURN_MARGIN : 0);
      move(area, Math.min(0, target - effective(area)));
    } else {
      for (const d of dimensions) {
        const [low, high] = intervals[d]!.range; const value = effective(d);
        move(d, value > high ? high - value : value < low ? low - value : 0);
      }
    }
  }
  return learned;
}

const categoryWord: Record<Category, string> = { top: 'tops', dress: 'dresses', bottom: 'bottoms', layer: 'jackets' };

export function describeAdjustments(learned: LearnedFit) {
  return learned.adjustments.filter(a => Math.abs(a.offset) >= 0.05).map(a => ({
    ...a,
    text: a.area === 'inseam'
      ? `${a.brand} ${categoryWord[a.category]}: prefers ${signed(a.offset)} inseam vs. your measurement`
      : `${a.brand} ${categoryWord[a.category]}: treat your ${a.area} as ${signed(a.offset)} (${a.offset > 0 ? 'size up' : 'size down'})`,
  }));
}

const confidenceScore: Record<Confidence, number> = { high: 0.9, medium: 0.65, low: 0.35 };
const lower = (value: Confidence): Confidence => value === 'high' ? 'medium' : 'low';

export function recommendSize(product: Product, profile: FitProfile, learned: LearnedFit, charts: BodySizeChart[]): SizeRecommendation {
  const relevant = DIMENSIONS_BY_CATEGORY[product.category];
  const rows = product.sizes.map(size => ({ size, intervals: intervalsFor(product.brand, product.category, size, product, profile, charts) }));
  const charted = relevant.filter(d => rows.some(r => r.intervals[d]));
  const dimensions = charted.filter(d => profile.body[d] != null);
  const history = learned.evidence.filter(e => e.brand === product.brand && e.category === product.category);
  const keptFitting = history.filter(e => e.result === 'kept' && e.fit === 'fits' && product.sizes.includes(e.size));

  if (!dimensions.length) {
    const last = keptFitting.at(-1);
    if (last) return { size: last.size, confidence: 'medium', score: confidenceScore.medium, runnerUp: null, checks: [],
      note: `${last.size}: you kept ${product.brand} ${categoryWord[product.category]} in ${last.size} and said they fit. ${charted.length ? 'Add your measurements to check this cut.' : 'This brand publishes no size chart here.'}` };
    return { size: null, confidence: 'low', score: 0.15, runnerUp: null, checks: [],
      note: charted.length ? `Add your ${charted.join(', ')} measurements to get a size.` : `No size chart for ${product.brand} yet. Use the brand's guide, then log what you keep or return so I learn this brand.` };
  }

  const evaluated = rows.filter(r => dimensions.some(d => r.intervals[d])).map(row => {
    const checks: DimensionCheck[] = dimensions.filter(d => row.intervals[d]).map(d => {
      const adjustment = offsetFor(learned, product.brand, product.category, d).value;
      const yours = profile.body[d]! + adjustment;
      const [low, high] = row.intervals[d]!.range;
      return { dimension: d, yours, adjustment, range: [low, high], source: row.intervals[d]!.source,
        status: yours > high ? 'tight' : yours < low ? 'loose' : 'inside', spare: high - yours };
    });
    const loss = checks.reduce((sum, c) => sum + (c.status === 'tight' ? c.yours - c.range[1] : c.status === 'loose' ? LOOSE_WEIGHT * (c.range[0] - c.yours) : 0), 0);
    const centering = checks.reduce((sum, c) => sum + Math.abs(c.yours - (c.range[0] + c.range[1]) / 2) / Math.max(0.5, c.range[1] - c.range[0]), 0);
    const edge = Math.min(...checks.map(c => Math.min(c.yours - c.range[0], c.range[1] - c.yours)));
    return { size: row.size, checks, loss, centering, edge };
  }).sort((a, b) => a.loss - b.loss || a.centering - b.centering);

  const best = evaluated[0];
  if (!best) return { size: null, confidence: 'low', score: 0.15, runnerUp: null, checks: [], note: 'No listed size has chart data.' };
  const runnerUp = evaluated[1] && evaluated[1].loss - best.loss < 1 ? evaluated[1].size : null;
  const parts: string[] = [];
  let confidence: Confidence;
  const tightest = [...best.checks].sort((a, b) => a.spare - b.spare)[0];

  if (best.loss > 0) {
    const onlySlightlyLoose = best.checks.every(c => c.status !== 'tight') && best.loss <= 0.5;
    confidence = onlySlightlyLoose ? 'medium' : 'low';
    const off = best.checks.filter(c => c.status !== 'inside').map(c => `${c.dimension} ${inches(c.status === 'tight' ? c.yours - c.range[1] : c.range[0] - c.yours)} ${c.status === 'tight' ? 'tight' : 'loose'}`);
    const fitting = best.checks.filter(c => c.status === 'inside').map(c => c.dimension);
    parts.push(`Closest size: ${fitting.length ? `${fitting.join(' and ')} ${fitting.length > 1 ? 'fit' : 'fits'}, but ` : ''}${off.join(' and ')}.`);
    const tight = best.checks.filter(c => c.status === 'tight').map(c => c.dimension);
    const alternative = evaluated.slice(1).find(e => tight.every(d => e.checks.find(c => c.dimension === d)?.status === 'inside'));
    if (tight.length && alternative) parts.push(`${alternative.size} gives the ${tight.join(' and ')} room but runs loose elsewhere.`);
  } else {
    confidence = charted.length === dimensions.length ? 'medium' : 'low';
    parts.push(`Your ${best.checks.map(c => `${c.dimension} (${inches(c.yours)})`).join(' and ')} ${best.checks.length > 1 ? 'fall' : 'falls'} inside ${best.size}.`);
    if (best.edge < BETWEEN_SIZES_EDGE && runnerUp) {
      parts.push(`Between ${best.size} and ${runnerUp} at the ${tightest.dimension}; pick ${runnerUp} if you like room.`);
      confidence = 'low';
    }
    if (charted.length > dimensions.length) parts.push(`Add your ${charted.filter(d => !dimensions.includes(d)).join(', ')} to check the rest.`);
  }

  const adjusted = best.checks.filter(c => Math.abs(c.adjustment) >= 0.05);
  if (adjusted.length) parts.push(`Adjusted from your keeps/returns: ${adjusted.map(c => `${c.dimension} ${signed(c.adjustment)}`).join(', ')}.`);
  const brandLearned = dimensions.every(d => offsetFor(learned, product.brand, product.category, d).source === 'brand-category');
  const keptSame = keptFitting.some(e => e.size === best.size);
  if (best.loss === 0 && (keptSame || (brandLearned && best.edge >= 0.5))) confidence = 'high';
  if (keptSame) parts.push(`You kept ${product.brand} ${categoryWord[product.category]} in ${best.size}.`);
  if (!history.length && best.loss === 0) parts.push(`First order from ${product.brand} in this category.`);

  if (product.category === 'bottom' && product.inseam && profile.body.inseam != null) {
    const preferred = profile.body.inseam + offsetFor(learned, product.brand, product.category, 'inseam').value;
    const difference = product.inseam - preferred;
    if (Math.abs(difference) >= 1) {
      parts.push(`Inseam ${inches(product.inseam)} is ${inches(Math.abs(difference))} ${difference > 0 ? 'longer' : 'shorter'} than you like.`);
      if (Math.abs(difference) > 2) confidence = lower(confidence);
    }
  }
  const lengthIssues = learned.lengthNotes.filter(n => n.brand === product.brand && n.category === product.category);
  if (lengthIssues.length) parts.push(`You returned ${product.brand} ${categoryWord[product.category]} as ${lengthIssues.at(-1)!.fit.replace('-', ' ')}; check the length.`);
  if (best.checks.some(c => c.source === 'garment')) parts.push(`From garment measurements and the ease ${profile.references.some(r => r.category === product.category) ? 'of the garment you like' : 'typical for this cut'}.`);
  else parts.push('From the brand chart, not garment measurements.');

  return { size: best.size, confidence, runnerUp, checks: best.checks, note: parts.join(' '),
    score: Math.max(0.15, confidenceScore[confidence] - Math.min(0.2, best.loss * 0.1)) };
}
