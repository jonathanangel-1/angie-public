import type { InspirationGarment } from '@/lib/inspiration-types';

// Shared vocabulary: comparable observations, not free-form overall scores.
export const featureValues = {
  silhouette: ['bodycon', 'fitted', 'relaxed', 'oversized', 'slim', 'straight', 'wide', 'flare', 'a-line', 'unknown'],
  sleeve: ['sleeveless', 'short', 'elbow', 'three-quarter', 'long', 'unknown'],
  neckline: ['v', 'crew', 'scoop', 'boat', 'square', 'high', 'collared', 'asymmetric', 'strapless', 'unknown'],
  colorFamily: ['white', 'pale-neutral', 'camel', 'brown', 'black', 'navy', 'grey', 'blue', 'red', 'pink', 'green', 'yellow', 'purple', 'orange', 'unknown'],
  length: ['cropped', 'waist', 'hip', 'longline', 'mini', 'knee', 'midi', 'maxi', 'ankle', 'full', 'unknown'],
  surface: ['plain', 'lace', 'sheer', 'floral', 'striped', 'checked', 'textured-knit', 'other-pattern', 'unknown'],
} as const;
export type Feature = keyof typeof featureValues;
export type Observation = { value: string; confidence: 'high' | 'medium' | 'unknown' };
export type GarmentEvidence = Record<Feature, Observation>;
export const evidenceSchema = {
  type: 'object', additionalProperties: false, required: Object.keys(featureValues),
  properties: Object.fromEntries(Object.entries(featureValues).map(([name, values]) => [name, {
    type: 'object', additionalProperties: false, required: ['value', 'confidence'], properties: {
      value: { type: 'string', enum: values }, confidence: { type: 'string', enum: ['high', 'medium', 'unknown'] },
    },
  }])),
};

export function normalizeFeature(feature: Feature, value: unknown): string {
  const v = String(value || '').toLowerCase().replace(/[–_]/g, '-').trim();
  if ((featureValues[feature] as readonly string[]).includes(v)) return v;
  if (!v || /unknown|not visible|unclear/.test(v)) return 'unknown';
  const patterns: Record<Feature, Array<[RegExp, string]>> = {
    silhouette: [[/bodycon|cling|body.hug|compression/, 'bodycon'], [/oversized|baggy/, 'oversized'], [/wide|palazzo/, 'wide'], [/flare|bootcut/, 'flare'], [/slim|skinny/, 'slim'], [/a.line/, 'a-line'], [/fitted|skimming|shaped/, 'fitted'], [/relaxed|loose|flowy|flowing/, 'relaxed'], [/straight|controlled/, 'straight']],
    sleeve: [[/sleeveless|no sleeves/, 'sleeveless'], [/three.quarter|3.?4/, 'three-quarter'], [/elbow/, 'elbow'], [/short|cap sleeve/, 'short'], [/long/, 'long']],
    neckline: [[/v.neck|v neck|plung/, 'v'], [/crew/, 'crew'], [/scoop/, 'scoop'], [/boat|bateau/, 'boat'], [/square/, 'square'], [/turtle|mock|high neck/, 'high'], [/collar/, 'collared'], [/asymmetr|one.shoulder|off.shoulder/, 'asymmetric'], [/strapless/, 'strapless']],
    colorFamily: [[/off.white|ivory|cream|ecru|stone|light beige|pale|ice/, 'pale-neutral'], [/white/, 'white'], [/camel|tan|taupe/, 'camel'], [/brown|chocolate/, 'brown'], [/navy/, 'navy'], [/black/, 'black'], [/gr[ae]y|charcoal/, 'grey'], [/blue|denim/, 'blue']],
    length: [[/crop/, 'cropped'], [/waist/, 'waist'], [/hip/, 'hip'], [/longline/, 'longline'], [/mini/, 'mini'], [/knee/, 'knee'], [/midi/, 'midi'], [/maxi|floor/, 'maxi'], [/ankle/, 'ankle'], [/full/, 'full']],
    surface: [[/lace/, 'lace'], [/sheer|mesh/, 'sheer'], [/floral/, 'floral'], [/strip/, 'striped'], [/check|plaid|gingham/, 'checked'], [/cable|chunky|ribbed/, 'textured-knit'], [/plain|smooth|solid/, 'plain']],
  };
  return patterns[feature].find(([pattern]) => pattern.test(v))?.[1] || 'unknown';
}

export function cleanEvidence(input: Partial<GarmentEvidence> | undefined): GarmentEvidence {
  return Object.fromEntries((Object.keys(featureValues) as Feature[]).map(feature => {
    const observation = input?.[feature];
    const value = normalizeFeature(feature, observation?.value);
    return [feature, { value, confidence: value === 'unknown' ? 'unknown' : observation?.confidence === 'high' ? 'high' : 'medium' }];
  })) as GarmentEvidence;
}

// Small differences remain alternatives; defining contradictions cannot be
// rescued by a high overall score or by personal taste/size bonuses.
export function contradicts(feature: Feature, wanted: string, actual: string, category: string): boolean {
  if (wanted === 'unknown' || actual === 'unknown' || wanted === actual) return false;
  if (feature === 'sleeve') {
    if (wanted === 'sleeveless' || actual === 'sleeveless') return true;
    return ['long', 'three-quarter'].includes(wanted) !== ['long', 'three-quarter'].includes(actual)
      && wanted !== 'elbow' && actual !== 'elbow';
  }
  if (feature === 'colorFamily') return !([['white', 'pale-neutral'], ['black', 'navy']].some(group => group.includes(wanted) && group.includes(actual)));
  if (feature === 'silhouette') {
    if (['top', 'layer', 'dress'].includes(category)) {
      if (wanted === 'bodycon' || actual === 'bodycon') return true;
      return ['fitted', 'slim'].includes(wanted) !== ['fitted', 'slim'].includes(actual)
        || (wanted === 'oversized') !== (actual === 'oversized');
    }
    return (['slim', 'fitted'].includes(wanted) && ['wide', 'oversized'].includes(actual))
      || (['wide', 'oversized'].includes(wanted) && ['slim', 'fitted'].includes(actual))
      || (wanted === 'flare') !== (actual === 'flare');
  }
  if (feature === 'length') {
    if (['top', 'layer'].includes(category)) return (wanted === 'cropped' && ['hip', 'longline'].includes(actual)) || (actual === 'cropped' && ['hip', 'longline'].includes(wanted));
    return ['mini', 'knee'].includes(wanted) && ['midi', 'maxi', 'full'].includes(actual)
      || ['mini', 'knee'].includes(actual) && ['midi', 'maxi', 'full'].includes(wanted);
  }
  return true; // Clearly different neckline or plain/pattern/construction.
}

export function compareEvidence(target: InspirationGarment, actual: GarmentEvidence) {
  const expected = cleanEvidence(target.evidence);
  const conflicts: string[] = [], differences: string[] = [], unverified: string[] = [];
  for (const feature of Object.keys(featureValues) as Feature[]) {
    const wanted = expected[feature], found = actual[feature];
    if (wanted.confidence !== 'high' || wanted.value === 'unknown') continue;
    if (found.value === 'unknown' || found.confidence === 'unknown') { unverified.push(feature); continue; }
    // An uncertain observation on the product cannot become a definite veto.
    // Keep it an alternative; independent major-shape and construction checks
    // still reject body-hugging, wrong-function and visibly incompatible items.
    if (found.confidence !== 'high') { differences.push(feature); unverified.push(feature); continue; }
    if (contradicts(feature, wanted.value, found.value, target.category)) conflicts.push(`${feature}: ${wanted.value} → ${found.value}`);
    else if (wanted.value !== found.value || found.confidence !== 'high') differences.push(feature);
  }
  return { conflicts, differences, unverified };
}

export function groundedGarment(garment: InspirationGarment, hasImage = true): InspirationGarment {
  if (!garment.evidence) return garment; // Legacy saved records stay readable.
  const evidence = cleanEvidence(garment.evidence);
  const visibility = garment.visibility;
  if (hasImage && visibility?.hem !== 'clear') evidence.length = { value: 'unknown', confidence: 'unknown' };
  if (hasImage && visibility?.sleeveEnds !== 'clear') evidence.sleeve = { value: 'unknown', confidence: 'unknown' };
  if (hasImage && visibility?.neckline !== 'clear') evidence.neckline = { value: 'unknown', confidence: 'unknown' };
  // Scalar fields feed lexical/embedding search and legacy constraints. Never
  // turn an uncertain visual hypothesis into a definite search requirement.
  const definite = (feature: Feature) => evidence[feature].confidence === 'high' || !hasImage && evidence[feature].confidence === 'medium' ? evidence[feature].value : 'unknown';
  return { ...garment, evidence, silhouette: definite('silhouette'), colorFamily: definite('colorFamily'),
    length: definite('length'), sleeve: definite('sleeve'), neckline: definite('neckline'),
    rise: !hasImage || visibility?.waist === 'clear' ? garment.rise : null,
    details: garment.details.filter(detail => !/\b(implied|inferred|assumed|suggested|probably|likely)\b/i.test(detail)
      && !(hasImage && visibility?.hem !== 'clear' && /hem|pooling|full.length|ankle.length|floor.length/i.test(detail))
      && !(hasImage && visibility?.waist !== 'clear' && /rise|waistband|fly|waist closure/i.test(detail))),
  };
}
