import type { InspirationEdit, InspirationMemory, InspirationReaction, RecommendationItem } from '@/lib/inspiration-types';
import { database, SESSION_ID } from '@/lib/persistence';

type PreferenceRow = {
  type: string;
  value: string;
  weight: number;
};

type CountRow = { count: number };
type NoteRow = { reaction: InspirationReaction; note: string; edit_id: string; target_item_ids_json: string; edits_json: string };

export function feedbackSignals(item: RecommendationItem, reaction: InspirationReaction, note: string, wholeLook: boolean) {
  const signals: Array<{ type: string; value: string; delta: number }> = [];
  const subtype = item.attributes.find((a) => a.type === 'subtype')?.value;
  const category = item.attributes.find((a) => a.type === 'category')?.value;
  if (item.catalogId && (reaction === 'love' || !wholeLook)) signals.push({ type: 'product', value: item.catalogId, delta: reaction === 'love' ? 0.25 : -0.35 });
  if (!category || !subtype || subtype === 'unknown' || wholeLook && reaction !== 'love') return signals;
  const explanation = note.toLowerCase();
  const negativeClauses = explanation.split(/\bbut\b|\bhowever\b|[.;]/).filter((clause) => /\b(too|wrong|dislike|hate|not|avoid|unflattering|baggy)\b|don.t|doesn.t/.test(clause));
  // A disliked hem does not mean she dislikes black, the brand, or all trousers.
  const mentions: Record<string, RegExp> = {
    silhouette: /\b(loose|tight|baggy|wide|slim|fitted|shape|cut|volume)\b/,
    length: /\b(long|short|length|cropped|crop|hem|pooling)\b/,
    rise: /\b(rise|waistline|low.waist|high.waist)\b/,
    neckline: /\b(neck|neckline|v.neck|crew|scoop|halter)\b/,
    sleeve: /\b(sleeve|sleeveless|shoulder)\b/,
    color_family: /\b(colou?r|black|white|navy|brown|grey|gray|pink|red|blue|cream|green)\b/,
  };
  const seen = new Set<string>();
  for (const attr of item.attributes) {
    if (!attr.value || attr.value === 'unknown' || !mentions[attr.type] || seen.has(attr.type)) continue;
    seen.add(attr.type);
    const directional = /\btoo (short|long|small|big|tight|loose)\b/.test(explanation);
    // A size/length complaint is not a dislike of every item tagged "full" or "fitted".
    if (directional && ['length', 'silhouette'].includes(attr.type)) continue;
    if (/\bnot too (short|long|tight|loose)\b/.test(explanation) && ['length', 'silhouette'].includes(attr.type)) continue;
    const explicitNegative = negativeClauses.some((clause) => mentions[attr.type].test(clause));
    if (reaction === 'love' && !explicitNegative || reaction !== 'love' && explicitNegative) {
      signals.push({ type: `${category}:${subtype}:${attr.type}`, value: attr.value, delta: reaction === 'love' ? 0.2 : -0.35 });
    }
  }
  return signals;
}

function cleanWeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

export async function getInspirationMemory(sessionId: string): Promise<InspirationMemory> {
  const db = database();
  const [feedbackResult, signalResult, preferenceResult, noteResult, outcomeResult, purchaseResult] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM inspiration_feedback WHERE session_id = ?').bind(sessionId).first<CountRow>(),
    db.prepare('SELECT COUNT(*) AS count FROM preference_signals WHERE session_id = ?').bind(sessionId).first<CountRow>(),
    db.prepare(
      `SELECT feature_type AS type, feature_value AS value, SUM(weight_delta) AS weight
       FROM preference_signals
       WHERE session_id = ? AND (feature_type = 'product' OR feature_type LIKE '%:%:%')
       GROUP BY feature_type, feature_value
       HAVING ABS(SUM(weight_delta)) >= 0.15
       ORDER BY ABS(SUM(weight_delta)) DESC, feature_type ASC, feature_value ASC
       LIMIT 30`,
    ).bind(sessionId).all<PreferenceRow>(),
    db.prepare(
      `SELECT f.reaction, f.note, f.edit_id, f.target_item_ids_json, r.edits_json
       FROM inspiration_feedback f
       JOIN inspiration_recommendations r ON r.id = f.recommendation_id AND r.session_id = f.session_id
       WHERE f.session_id = ? AND f.note IS NOT NULL AND TRIM(f.note) <> ''
       ORDER BY f.created_at DESC, f.id DESC LIMIT 12`,
    ).bind(sessionId).all<NoteRow>(),
    db.prepare(`SELECT catalog_id, reason, created_at FROM (
      SELECT catalog_id, reason, created_at, id,
        ROW_NUMBER() OVER (PARTITION BY catalog_id, json_extract(reason,'$.size') ORDER BY created_at DESC,id DESC) AS rank
      FROM outcome_events WHERE session_id = ? AND json_valid(reason)
        AND json_extract(reason,'$.version') = 1 AND json_extract(reason,'$.fit') IN ('fits','too-small','too-large','too-short','too-long')
        AND LENGTH(json_extract(reason,'$.size')) > 0
    ) WHERE rank = 1 ORDER BY created_at DESC,id DESC`)
      .bind(sessionId).all<{ catalog_id: string; reason: string | null; created_at: number }>(),
    db.prepare(`SELECT catalog_id, reason FROM (
      SELECT catalog_id, reason, ROW_NUMBER() OVER (PARTITION BY catalog_id ORDER BY created_at DESC, id DESC) AS rank
      FROM outcome_events WHERE session_id = ? AND event_type IN ('kept','returned','tried','worn') AND json_valid(reason)
      AND json_extract(reason,'$.note') IN ('Loved the style','Not my style','Fabric or quality','Different from the photo')
    ) WHERE rank = 1`).bind(sessionId).all<{catalog_id: string; reason: string}>(),
  ]);

  const preferences = preferenceResult.results.map((row) => ({
    type: String(row.type),
    value: String(row.value),
    weight: cleanWeight(row.weight),
  }));

  return {
    purchasePreferences: purchaseResult.results.map(row => {
      const reason = String(JSON.parse(row.reason).note);
      return { catalogId: row.catalog_id, weight: reason === 'Loved the style' ? 3 : -6, reason };
    }),
    fitOutcomes: outcomeResult.results.flatMap(row => {
      try {
        const detail = JSON.parse(row.reason || '{}');
        if (detail.version !== 1 || !detail.size || !['fits','too-small','too-large','too-short','too-long'].includes(detail.fit)) return [];
        return [{ catalogId: row.catalog_id, size: String(detail.size).slice(0,20), fit: detail.fit, createdAt: row.created_at }];
      } catch { return []; }
    }).reverse(),
    mode: sessionId === SESSION_ID ? 'personal' : 'test',
    feedbackCount: Number(feedbackResult?.count ?? 0),
    signalCount: Number(signalResult?.count ?? 0),
    likes: preferences.filter((preference) => preference.weight > 0).slice(0, 8),
    avoidances: preferences.filter((preference) => preference.weight < 0).slice(0, 8),
    recentNotes: noteResult.results.map((row) => {
      let context = '';
      try {
        const edit = (JSON.parse(row.edits_json) as InspirationEdit[]).find((candidate) => candidate.id === row.edit_id);
        const targets = new Set(JSON.parse(row.target_item_ids_json) as string[]);
        context = edit?.items.filter((item) => targets.has(item.id)).map((item) =>
          `${item.name} (${item.attributes.map((attribute) => `${attribute.type}=${attribute.value}`).join(', ')})`,
        ).join('; ').slice(0, 1600) ?? '';
      } catch { /* Keep the original comment even if an older record lacks item context. */ }
      return { reaction: row.reaction, note: String(row.note).slice(0, 800), context };
    }),
  };
}

function featureKey(type: string, value: string) {
  return `${type.trim().toLowerCase()}::${value.trim().toLowerCase()}`;
}

function itemFeatureScore(item: RecommendationItem, weights: Map<string, number>) {
  const unique = new Set(item.attributes.map((attribute) => featureKey(attribute.type, attribute.value)));
  let score = 0;
  for (const key of unique) score += weights.get(key) ?? 0;
  return score;
}

export function applyLearnedPreferences(edits: InspirationEdit[], memory: InspirationMemory) {
  const weights = new Map<string, number>();
  for (const preference of [...memory.likes, ...memory.avoidances]) {
    weights.set(featureKey(preference.type, preference.value), preference.weight);
  }

  return edits.map((edit) => {
    const averageSignal = edit.items.length
      ? edit.items.reduce((sum, item) => sum + Math.max(-3, Math.min(3, itemFeatureScore(item, weights))), 0) / edit.items.length
      : 0;
    const evidenceFactor = Math.min(1, memory.feedbackCount / 8);
    const learningAdjustment = Math.max(-8, Math.min(8, Math.round(averageSignal * 2 * evidenceFactor)));
    return {
      ...edit,
      learningAdjustment,
      matchScore: Math.max(1, Math.min(99, edit.baseMatchScore + learningAdjustment)),
    };
  });
}
