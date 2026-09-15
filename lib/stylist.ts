import { angieProfile } from '@/data/angie-profile';
import { stylistCatalog, type ItemCategory, type StylistItem } from '@/data/stylist-catalog';

export type StyleReaction = 'love' | 'close' | 'no';

export type FeedbackSignal = {
  reaction: StyleReaction;
  targetItemIds: string[];
};

type Occasion = 'casual' | 'polished' | 'evening' | 'tailored';
type RecommendationMode = 'best' | 'safe' | 'push';
type RequestedKind = 'jeans' | 'trousers' | 'skirt' | 'dress';

type Intent = {
  occasion: Occasion;
  anchor: ItemCategory | null;
  requestedKind: RequestedKind | null;
  useClosetAnchor: boolean;
  requestedColors: string[];
  wantsNovelty: boolean;
  wantsLowRisk: boolean;
  summary: string;
};

type ItemScore = {
  item: StylistItem;
  score: number;
  fit: number;
  quality: number;
  novelty: number;
  reasons: string[];
};

type CandidateLook = {
  items: ItemScore[];
  signature: string;
  taste: number;
  fit: number;
  quality: number;
  novelty: number;
  coherence: number;
  baseScore: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const round = (value: number) => Math.round(value);

function parseIntent(prompt: string): Intent {
  const normalized = prompt.trim().toLowerCase();
  const includesAny = (words: string[]) => words.some((word) => normalized.includes(word));

  let occasion: Occasion = 'polished';
  if (includesAny(['evening', 'dinner', 'date', 'wedding', 'party', 'night', 'cocktail'])) occasion = 'evening';
  else if (includesAny(['work', 'office', 'meeting', 'interview', 'tailored', 'business'])) occasion = 'tailored';
  else if (includesAny(['casual', 'weekend', 'coffee', 'errand', 'travel', 'easy', 'everyday'])) occasion = 'casual';
  else if (includesAny(['lunch', 'daytime', 'polished', 'event', 'museum'])) occasion = 'polished';

  let anchor: ItemCategory | null = null;
  if (includesAny(['dress'])) anchor = 'dress';
  else if (includesAny(['trouser', 'pants', 'jeans', 'skirt', 'bottom'])) anchor = 'bottom';
  else if (includesAny(['shirt', 'top', 'tank', 'blouse', 'sweater'])) anchor = 'top';
  else if (includesAny(['shoe', 'heel', 'flat', 'boot'])) anchor = 'shoes';
  else if (includesAny(['coat', 'blazer', 'jacket'])) anchor = 'layer';

  let requestedKind: RequestedKind | null = null;
  if (includesAny(['jean', 'denim'])) requestedKind = 'jeans';
  else if (includesAny(['trouser', 'pants'])) requestedKind = 'trousers';
  else if (includesAny(['skirt'])) requestedKind = 'skirt';
  else if (includesAny(['dress'])) requestedKind = 'dress';

  const useClosetAnchor = includesAny(['already own', 'already have', 'in my closet', 'from my closet', 'mine']);

  const requestedColors = [...angieProfile.reliableColors, ...angieProfile.selectiveColors]
    .filter((color) => normalized.includes(color.toLowerCase()));

  const wantsNovelty = includesAny(['new', 'different', 'push', 'interesting', 'trend', 'bolder', 'surprise']);
  const wantsLowRisk = includesAny(['safe', 'easy', 'repeat', 'reliable', 'comfortable', 'low risk']);
  const labels: Record<Occasion, string> = {
    casual: 'an easy, repeatable casual look',
    polished: 'a polished daytime look',
    evening: 'a clean evening look',
    tailored: 'a sharp, feminine tailored look',
  };

  return { occasion, anchor, requestedKind, useClosetAnchor, requestedColors, wantsNovelty, wantsLowRisk, summary: labels[occasion] };
}

function matchesRequestedKind(item: StylistItem, requestedKind: RequestedKind | null) {
  if (!requestedKind) return true;
  const description = `${item.name} ${item.tags.join(' ')}`.toLowerCase();
  if (requestedKind === 'jeans') return description.includes('jean') || description.includes('denim');
  if (requestedKind === 'trousers') return description.includes('trouser') || description.includes('pant');
  if (requestedKind === 'skirt') return description.includes('skirt');
  return item.category === 'dress';
}

function feedbackDelta(itemId: string, feedback: FeedbackSignal[]) {
  return feedback.reduce((total, signal) => {
    if (!signal.targetItemIds.includes(itemId)) return total;
    if (signal.reaction === 'love') return total + 8;
    if (signal.reaction === 'close') return total - 4;
    return total - 12;
  }, 0);
}

function scoreItem(item: StylistItem, intent: Intent, feedback: FeedbackSignal[]): ItemScore | null {
  if (item.hardReject) return null;

  const reasons: string[] = [];
  let score = item.taste * 0.45 + item.fit * 0.23 + item.quality * 0.12;

  if (item.occasions.includes(intent.occasion)) {
    score += 14;
    reasons.push(`belongs in ${intent.occasion} looks`);
  } else {
    score -= 13;
  }

  if (intent.anchor === item.category) {
    score += 6;
    reasons.push('matches the requested anchor');
  }

  if (intent.requestedKind && item.category === intent.anchor) {
    if (matchesRequestedKind(item, intent.requestedKind)) {
      score += 12;
      reasons.push(`is the requested ${intent.requestedKind}`);
    } else {
      score -= 14;
    }
  }

  if (intent.useClosetAnchor && intent.anchor === item.category) {
    score += item.source === 'closet' ? 10 : -18;
    if (item.source === 'closet') reasons.push('uses the requested closet anchor');
  }

  if (intent.requestedColors.some((color) => item.color.toLowerCase().includes(color.toLowerCase()))) {
    score += 7;
    reasons.push('matches the requested color');
  }

  if (angieProfile.reliableColors.some((color) => item.color.toLowerCase().includes(color.toLowerCase()))) {
    score += 3;
  }

  if (item.source === 'closet') {
    score += 6;
    reasons.push('already validated in her closet');
  }

  if (intent.wantsNovelty) score += item.novelty * 0.12;
  if (intent.wantsLowRisk) score += item.fit * 0.08 + item.quality * 0.04;

  const learnedDelta = feedbackDelta(item.id, feedback);
  if (learnedDelta) {
    score += learnedDelta;
    reasons.push(learnedDelta > 0 ? 'moved up from prior reactions' : 'moved down from prior reactions');
  }

  return {
    item,
    score: clamp(score),
    fit: item.fit,
    quality: item.quality,
    novelty: item.novelty,
    reasons: reasons.slice(0, 3),
  };
}

function colorFamily(color: string) {
  const value = color.toLowerCase();
  if (value.includes('black') || value.includes('navy') || value.includes('indigo') || value.includes('charcoal')) return 'dark';
  if (value.includes('white') || value.includes('cream') || value.includes('birch') || value.includes('beige')) return 'light';
  return 'accent';
}

function coherenceScore(items: ItemScore[], occasion: Occasion) {
  const raw = items.map(({ item }) => item);
  let score = 72;
  const formality = raw.map((item) => item.formality);
  const spread = Math.max(...formality) - Math.min(...formality);
  score -= Math.max(0, spread - 1) * 9;

  const top = raw.find((item) => item.category === 'top');
  const bottom = raw.find((item) => item.category === 'bottom');
  if (top && bottom && top.silhouette === 'fitted' && ['straight', 'controlled'].includes(bottom.silhouette)) score += 12;
  if (top && bottom && top.silhouette === 'controlled' && ['straight', 'controlled'].includes(bottom.silhouette)) score += 8;
  if (top && bottom && top.silhouette === 'relaxed' && bottom.silhouette === 'relaxed') score -= 18;

  const colorFamilies = new Set(raw.map((item) => colorFamily(item.color)));
  if (colorFamilies.size <= 2) score += 8;
  if (raw.some((item) => item.source === 'closet')) score += 4;
  if (raw.every((item) => item.occasions.includes(occasion))) score += 5;
  if (occasion === 'evening' && raw.some((item) => item.category === 'shoes' && item.tags.includes('heel'))) score += 6;
  if (occasion === 'tailored' && raw.some((item) => item.category === 'layer' && item.tags.includes('tailored'))) score += 5;
  return clamp(score);
}

function makeCandidate(items: ItemScore[], occasion: Occasion): CandidateLook {
  const coherence = coherenceScore(items, occasion);
  const taste = average(items.map((item) => item.item.taste));
  const fit = average(items.map((item) => item.fit));
  const quality = average(items.map((item) => item.quality));
  const novelty = average(items.map((item) => item.novelty));
  const itemScore = average(items.map((item) => item.score));
  const baseScore = clamp(itemScore * 0.74 + coherence * 0.26);
  return {
    items,
    signature: items.map((item) => item.item.id).sort().join(':'),
    taste,
    fit,
    quality,
    novelty,
    coherence,
    baseScore,
  };
}

function generateCandidates(intent: Intent, feedback: FeedbackSignal[]) {
  const scored = stylistCatalog
    .map((item) => scoreItem(item, intent, feedback))
    .filter((item): item is ItemScore => Boolean(item));

  const pool = (category: ItemCategory, limit: number) => scored
    .filter((item) => item.item.category === category && item.item.occasions.includes(intent.occasion))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  const tops = pool('top', 6);
  const bottoms = pool('bottom', 7);
  const dresses = pool('dress', 4);
  const shoes = pool('shoes', 6);
  const layers = pool('layer', 4);
  const candidates: CandidateLook[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        candidates.push(makeCandidate([top, bottom, shoe], intent.occasion));
        for (const layer of layers.slice(0, 2)) candidates.push(makeCandidate([top, bottom, shoe, layer], intent.occasion));
      }
    }
  }

  if (intent.occasion === 'evening' || intent.anchor === 'dress') {
    for (const dress of dresses) {
      for (const shoe of shoes) {
        candidates.push(makeCandidate([dress, shoe], intent.occasion));
        for (const layer of layers.slice(0, 2)) candidates.push(makeCandidate([dress, shoe, layer], intent.occasion));
      }
    }
  }

  const constrained = candidates.filter((candidate) => {
    const anchor = candidate.items.find(({ item }) => item.category === intent.anchor && matchesRequestedKind(item, intent.requestedKind));
    if (intent.requestedKind && !anchor) return false;
    if (intent.useClosetAnchor && intent.anchor && (!anchor || anchor.item.source !== 'closet')) return false;
    return true;
  });

  return constrained.length ? constrained : candidates;
}

function modeScore(look: CandidateLook, mode: RecommendationMode, intent: Intent) {
  if (mode === 'safe') return look.baseScore * 0.58 + look.fit * 0.27 + look.quality * 0.15;
  if (mode === 'push') return look.baseScore * 0.72 + look.novelty * 0.28;
  const preference = intent.wantsLowRisk ? look.fit * 0.08 : intent.wantsNovelty ? look.novelty * 0.08 : 0;
  return look.baseScore + preference;
}

function finishFor(occasion: Occasion) {
  if (occasion === 'evening') return 'Hair: slick low bun or straight behind the ears. Small black clutch. One pair of earrings. Nothing competing with the line.';
  if (occasion === 'tailored') return 'Hair: smooth low pony or tucked behind the ears. Structured black bag. Minimal watch or studs. Keep the blazer open.';
  if (occasion === 'casual') return 'Hair: clean center part, loose or low pony. Black shoulder bag. Small earrings. No decorative layer unless it has a job.';
  return 'Hair: neat low bun or tucked behind the ears. Structured black bag. Tiny earrings. Keep the finish quiet.';
}

function lookLabel(mode: RecommendationMode) {
  if (mode === 'safe') return { eyebrow: 'LOW-RISK REPEAT', title: 'The proven route' };
  if (mode === 'push') return { eyebrow: 'CONTROLLED STRETCH', title: 'New, without losing Angie' };
  return { eyebrow: 'BEST MATCH', title: 'The strongest complete look' };
}

function displayLook(look: CandidateLook, mode: RecommendationMode, intent: Intent, rank: number) {
  const label = lookLabel(mode);
  const topOrDress = look.items.find(({ item }) => item.category === 'dress') ?? look.items.find(({ item }) => item.category === 'top');
  const bottom = look.items.find(({ item }) => item.category === 'bottom');
  const shoe = look.items.find(({ item }) => item.category === 'shoes');
  const layer = look.items.find(({ item }) => item.category === 'layer');
  const anchorText = bottom
    ? `${topOrDress?.item.name} with ${bottom.item.name}`
    : topOrDress?.item.name ?? 'the strongest available anchor';
  const sourceCount = look.items.filter(({ item }) => item.source === 'closet').length;
  const score = round(clamp(modeScore(look, mode, intent)));
  const fitWatch = (bottom ?? topOrDress)?.item.fitRisk ?? 'Use the try-on as the final physical-fit decision.';
  const explanation = [
    `It starts with ${anchorText}, then uses ${shoe?.item.name ?? 'an elegant shoe'} to keep the formality consistent.`,
    sourceCount ? `${sourceCount} proven closet ${sourceCount === 1 ? 'piece is' : 'pieces are'} doing real work, so this is styling—not a new cart.` : 'Every shoppable item cleared Angie’s confirmed taste and quality gates.',
    layer ? `${layer.item.name} finishes the line without changing the outfit’s story.` : 'No extra layer is needed; the proportion is already complete.',
  ];
  const evidence = [...look.items]
    .sort((left, right) => right.item.taste - left.item.taste)
    .slice(0, 3)
    .map(({ item }) => item.evidence);

  return {
    id: `${intent.occasion}-${mode}-${look.signature}`,
    rank,
    mode,
    eyebrow: label.eyebrow,
    title: label.title,
    score,
    confidence: look.fit >= 88 ? 'High' : look.fit >= 74 ? 'Moderate' : 'Low',
    story: `For ${intent.summary}, this keeps the silhouette controlled and the styling restrained. ${explanation[0]}`,
    explanation,
    evidence,
    fitWatch,
    finish: finishFor(intent.occasion),
    totals: {
      taste: round(look.taste),
      fit: round(look.fit),
      coherence: round(look.coherence),
      quality: round(look.quality),
      novelty: round(look.novelty),
      newSpend: round(look.items.reduce((sum, { item }) => sum + (item.source === 'shop' ? item.price ?? 0 : 0), 0)),
    },
    items: look.items.map(({ item, score: itemScore, reasons }) => ({ ...item, itemScore: round(itemScore), reasons })),
  };
}

export function buildStylistResponse(prompt: string, feedback: FeedbackSignal[] = []) {
  const cleanPrompt = prompt.trim() || 'Build me a polished daytime look I can actually repeat.';
  const intent = parseIntent(cleanPrompt);
  const candidates = generateCandidates(intent, feedback);
  const modes: RecommendationMode[] = ['best', 'safe', 'push'];
  const used = new Set<string>();
  const looks = modes.map((mode, index) => {
    const ranked = [...candidates]
      .filter((look) => !used.has(look.signature))
      .sort((left, right) => modeScore(right, mode, intent) - modeScore(left, mode, intent));
    const selected = ranked[0] ?? candidates[0];
    used.add(selected.signature);
    return displayLook(selected, mode, intent, index + 1);
  });

  const rejected = stylistCatalog
    .filter((item) => item.hardReject && item.occasions.includes(intent.occasion))
    .slice(0, 4)
    .map((item) => ({ id: item.id, name: item.name, image: item.image, reason: item.rejectionReason, evidence: item.evidence }));

  return {
    request: cleanPrompt,
    intent,
    generatedAt: new Date().toISOString(),
    catalogStatus: 'Curated catalog snapshot. Open the retailer link to confirm current stock, size and price before buying.',
    profile: angieProfile,
    looks,
    rejected,
  };
}
