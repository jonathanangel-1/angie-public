import type { AnswerMap } from '@/data/questions';

export const RANKING_VERSION = 'questionnaire-ranker-v1';

export type CandidateEvidence = {
  id: string;
  retailer: string;
  name: string;
  color: string;
  price: number;
  likelySize: string;
  cut: string;
  length: string;
  fabric: string;
  description: string;
  privateScore: number;
  privateTaste: number;
  privateFit: number;
  privateMaterial: number;
  privateConfidence: string;
  privateWhy: string;
  privateRisk: string;
  privateMeasurements: string;
  privateAnchor: string;
};

export type ScoreAdjustment = {
  questionId: string;
  delta: number;
  reason: string;
};

export type FrozenRankItem = {
  id: string;
  name: string;
  retailer: string;
  baselineRank: number;
  adjustedRank: number;
  rankChange: number;
  baselineScore: number;
  adjustedScore: number;
  adjustments: ScoreAdjustment[];
};

export type QuestionAudit = {
  questionId: string;
  answer: string;
  status: 'ranking_input' | 'profile_only' | 'not_answered';
  rationale: string;
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const normalize = (value: string) => value.toLowerCase().replace(/[™–—]/g, ' ');
const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

function add(adjustments: ScoreAdjustment[], questionId: string, delta: number, reason: string) {
  if (!delta) return;
  adjustments.push({ questionId, delta: round(delta), reason });
}

function suggestedNumericSize(likelySize: string) {
  const match = likelySize.match(/\b(2|4|6)\b/);
  return match ? Number(match[1]) : null;
}

function hipForSuggestedSize(candidate: CandidateEvidence) {
  const size = suggestedNumericSize(candidate.likelySize);
  if (!size) return null;
  const expression = new RegExp(`S${size}[^;]*?H(\\d+(?:\\.\\d+)?)`, 'i');
  const match = candidate.privateMeasurements.match(expression);
  return match ? Number(match[1]) : null;
}

function candidateText(candidate: CandidateEvidence) {
  return normalize([
    candidate.name,
    candidate.color,
    candidate.cut,
    candidate.length,
    candidate.fabric,
    candidate.description,
    candidate.privateWhy,
    candidate.privateRisk,
    candidate.privateAnchor,
  ].join(' '));
}

function adjustedCandidate(candidate: CandidateEvidence, answers: AnswerMap) {
  const text = candidateText(candidate);
  const adjustments: ScoreAdjustment[] = [];

  if (answers.kept_behavior?.answer === 'varies' && answers.kept_ghost_reason?.answer === 'fit') {
    const reweighted = candidate.privateTaste * 0.45 + candidate.privateFit * 0.4 + candidate.privateMaterial * 0.15;
    add(adjustments, 'kept_ghost_reason', reweighted - candidate.privateScore, 'Fit receives more weight because kept items can still fail through fit.');
  }

  if (answers.coupe_calibration?.answer === 'both' && normalize(candidate.privateAnchor).includes('coupe')) {
    add(adjustments, 'coupe_calibration', 0.15, 'The demo participant reconfirmed both repeated styles as positive examples.');
  }

  if (answers.navy_linen_calibration?.answer === 'yes') {
    const navy = includesAny(text, ['navy', 'deep blue']);
    const linen = text.includes('linen');
    add(adjustments, 'navy_linen_calibration', navy && linen ? 0.3 : navy ? 0.08 : linen ? 0.1 : 0, navy && linen
      ? 'Directly repeats a reconfirmed navy-linen anchor.'
      : navy ? 'Shares the reconfirmed navy color anchor.' : 'Shares the reconfirmed linen material anchor.');
  }

  if (answers.silhouette_instinct?.answer === 'straight') {
    if (text.includes('straight')) add(adjustments, 'silhouette_instinct', 0.35, 'Matches Angie’s first-choice straight silhouette.');
    else if (includesAny(text, ['tailored', 'suit trouser'])) add(adjustments, 'silhouette_instinct', 0.1, 'Shares the clean tailored character of her preferred silhouette.');
    if (includesAny(text, ['barrel', 'balloon', 'drop crotch', 'low-slung'])) add(adjustments, 'silhouette_instinct', -0.25, 'Conflicts with the preferred clean straight silhouette.');
  }

  if (answers.trouser_failure?.answer === 'tight' && answers.failure_detail?.answer === 'hips') {
    const hip = hipForSuggestedSize(candidate);
    const stretch = text.includes('stretch');
    if (hip !== null) {
      const ease = hip - 94;
      if (ease <= 0) add(adjustments, 'failure_detail', stretch ? -0.18 : -0.35, `${hip} cm garment hip leaves ${ease} cm ease at Angie’s 94 cm hip${stretch ? ', partially offset by stretch' : ''}.`);
      else if (ease <= 3) add(adjustments, 'failure_detail', stretch ? 0.12 : -0.05, `${ease} cm hip ease is ${stretch ? 'plausible with stretch' : 'tight without disclosed stretch'}.`);
      else if (ease <= 10) add(adjustments, 'failure_detail', 0.2, `${ease} cm hip ease addresses her stated tightness failure without extreme volume.`);
    }
  }

  if (answers.material_tradeoff?.answer === 'natural') {
    const materialDelta = text.includes('linen') ? 0.22
      : text.includes('wool') ? 0.18
        : text.includes('cotton') ? 0.15
          : includesAny(text, ['technical', 'polyester', 'satin', 'composition not surfaced']) ? -0.12 : 0;
    add(adjustments, 'material_tradeoff', materialDelta, materialDelta > 0
      ? 'Matches Angie’s stated preference for linen, cotton or wool.'
      : 'Material is synthetic, technical, high-sheen or undisclosed.');
  }

  if (answers.becoming?.answer === 'refined') {
    if (includesAny(text, ['tailored', 'straight', 'suit trouser', 'clean', 'classic'])) add(adjustments, 'becoming', 0.18, 'Supports Angie’s desired more refined direction.');
    if (includesAny(text, ['drop crotch', 'low-slung', 'tied hems', 'scarf detail', 'side-tie', 'balloon'])) add(adjustments, 'becoming', -0.18, 'Reads more experimental than the refined direction she requested.');
  }

  if (answers.color_risk?.answer === 'open') {
    const neutral = includesAny(normalize(candidate.color), ['black', 'navy', 'white', 'beige', 'sand', 'ice', 'off white']);
    add(adjustments, 'color_risk', neutral ? 0 : 0.05, 'Angie is open to color when the underlying piece is right.');
  }

  if (answers.recommendation_tradeoff?.answer === 'strict') {
    const confidence = normalize(candidate.privateConfidence);
    if (confidence.includes('low')) add(adjustments, 'recommendation_tradeoff', confidence.includes('moderate') ? -0.15 : -0.2, 'Strict counsel penalizes low-confidence recommendations.');
    if (normalize(candidate.privateMeasurements).includes('no garment')) add(adjustments, 'recommendation_tradeoff', -0.08, 'Strict counsel penalizes missing garment measurements.');
    if (normalize(candidate.length).includes('not disclosed')) add(adjustments, 'recommendation_tradeoff', -0.07, 'Strict counsel penalizes undisclosed length.');
    if (confidence === 'high') add(adjustments, 'recommendation_tradeoff', 0.05, 'High-confidence evidence survives the strict filter.');
  }

  const adjustedScore = Math.min(5, Math.max(1, candidate.privateScore + adjustments.reduce((sum, item) => sum + item.delta, 0)));
  return { candidate, baselineScore: candidate.privateScore, adjustedScore: round(adjustedScore), adjustments };
}

export function buildQuestionnaireRanking(candidates: CandidateEvidence[], answers: AnswerMap) {
  const baseline = [...candidates].sort((a, b) => b.privateScore - a.privateScore || b.privateFit - a.privateFit || a.id.localeCompare(b.id));
  const baselineRanks = new Map(baseline.map((candidate, index) => [candidate.id, index + 1]));
  const scored = candidates.map((candidate) => adjustedCandidate(candidate, answers));
  const adjusted = [...scored].sort((a, b) => b.adjustedScore - a.adjustedScore || b.candidate.privateFit - a.candidate.privateFit || a.candidate.id.localeCompare(b.candidate.id));

  const adjustedItems: FrozenRankItem[] = adjusted.map((item, index) => {
    const adjustedRank = index + 1;
    const baselineRank = baselineRanks.get(item.candidate.id) ?? adjustedRank;
    return {
      id: item.candidate.id,
      name: item.candidate.name,
      retailer: item.candidate.retailer,
      baselineRank,
      adjustedRank,
      rankChange: baselineRank - adjustedRank,
      baselineScore: round(item.baselineScore),
      adjustedScore: item.adjustedScore,
      adjustments: item.adjustments,
    };
  });

  const questionAudit: QuestionAudit[] = [
    { questionId: 'kept_behavior', answer: answers.kept_behavior?.answer ?? '', status: answers.kept_behavior ? 'ranking_input' : 'not_answered', rationale: 'Controls whether kept history can be treated as success.' },
    { questionId: 'kept_ghost_reason', answer: answers.kept_ghost_reason?.answer ?? '', status: answers.kept_ghost_reason ? 'ranking_input' : 'not_answered', rationale: 'Reweights fit when closet ghosts are caused by fit.' },
    { questionId: 'coupe_calibration', answer: answers.coupe_calibration?.answer ?? '', status: answers.coupe_calibration ? 'ranking_input' : 'not_answered', rationale: 'Validates or weakens a repeated historical anchor.' },
    { questionId: 'navy_linen_calibration', answer: answers.navy_linen_calibration?.answer ?? '', status: answers.navy_linen_calibration ? 'ranking_input' : 'not_answered', rationale: 'Validates the navy-linen anchor.' },
    { questionId: 'silhouette_instinct', answer: answers.silhouette_instinct?.answer ?? '', status: answers.silhouette_instinct ? 'ranking_input' : 'not_answered', rationale: 'Changes silhouette preference scores.' },
    { questionId: 'trouser_failure', answer: answers.trouser_failure?.answer ?? '', status: answers.trouser_failure ? 'ranking_input' : 'not_answered', rationale: 'Selects the dominant fit-risk rule.' },
    { questionId: 'failure_detail', answer: answers.failure_detail?.answer ?? '', status: answers.failure_detail ? 'ranking_input' : 'not_answered', rationale: 'Applies body-area-specific garment-measurement checks.' },
    { questionId: 'material_tradeoff', answer: answers.material_tradeoff?.answer ?? '', status: answers.material_tradeoff ? 'ranking_input' : 'not_answered', rationale: 'Changes material preference scores.' },
    { questionId: 'becoming', answer: answers.becoming?.answer ?? '', status: answers.becoming ? 'ranking_input' : 'not_answered', rationale: 'Moves recommendations toward the desired style direction.' },
    { questionId: 'color_risk', answer: answers.color_risk?.answer ?? '', status: answers.color_risk ? 'ranking_input' : 'not_answered', rationale: 'Controls penalties for less-proven colors.' },
    { questionId: 'recommendation_tradeoff', answer: answers.recommendation_tradeoff?.answer ?? '', status: answers.recommendation_tradeoff ? 'ranking_input' : 'not_answered', rationale: 'Controls uncertainty penalties.' },
    { questionId: 'shopping_mission', answer: answers.shopping_mission?.answer ?? '', status: answers.shopping_mission ? 'profile_only' : 'not_answered', rationale: 'Guides future product behavior but does not honestly distinguish this fixed trouser set.' },
  ];

  return {
    version: RANKING_VERSION,
    baseline: baseline.map((candidate, index) => ({ id: candidate.id, name: candidate.name, retailer: candidate.retailer, rank: index + 1, score: round(candidate.privateScore) })),
    adjusted: adjustedItems,
    questionAudit,
  };
}

export type BlindRating = 'would' | 'maybe' | 'no';

export function evaluateRanking(order: string[], labels: Record<string, BlindRating>) {
  const utility: Record<BlindRating, number> = { would: 2, maybe: 1, no: 0 };
  const labeled = order.filter((id) => labels[id]);
  const top = order.slice(0, 10);
  const bottom = order.slice(-10);
  const topWould = top.filter((id) => labels[id] === 'would').length;
  const bottomWould = bottom.filter((id) => labels[id] === 'would').length;
  const dcg = top.reduce((sum, id, index) => sum + (labels[id] ? utility[labels[id]] / Math.log2(index + 2) : 0), 0);
  const idealUtilities = Object.values(labels).map((label) => utility[label]).sort((a, b) => b - a).slice(0, 10);
  const idealDcg = idealUtilities.reduce((sum, value, index) => sum + value / Math.log2(index + 2), 0);

  let correctPairs = 0;
  let comparablePairs = 0;
  for (let left = 0; left < order.length; left += 1) {
    for (let right = left + 1; right < order.length; right += 1) {
      const leftLabel = labels[order[left]];
      const rightLabel = labels[order[right]];
      if (!leftLabel || !rightLabel || utility[leftLabel] === utility[rightLabel]) continue;
      comparablePairs += 1;
      if (utility[leftLabel] > utility[rightLabel]) correctPairs += 1;
    }
  }

  return {
    labeledCount: labeled.length,
    complete: labeled.length === order.length,
    topWould,
    bottomWould,
    ndcgAt10: idealDcg ? round(dcg / idealDcg) : null,
    pairwiseAccuracy: comparablePairs ? round(correctPairs / comparablePairs) : null,
    pass: labeled.length === order.length && topWould >= 7 && bottomWould <= 3,
  };
}
