import { requireRole } from '@/lib/auth';
import catalogData from '@/data/verified-catalog.json';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { database, ensureSchema, SESSION_ID } from '@/lib/persistence';

type EvalRow = {
  recommendation_count: number;
  feedback_count: number;
  love_count: number;
  close_count: number;
  no_count: number;
  utility: number | null;
};

export async function GET(request: Request) {
  if (!requireRole(request, ['admin'])) return Response.json({ error: 'Admin only' }, { status: 401 });
  await ensureSchema();
  const db = database();
  const [recommendations, feedback, models, memory, candidates, outcomes] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count, SUM(json_array_length(edits_json)) AS edits FROM inspiration_recommendations WHERE session_id = ?').bind(SESSION_ID).first<{ count: number; edits: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS feedback_count,
              SUM(CASE WHEN reaction = 'love' THEN 1 ELSE 0 END) AS love_count,
              SUM(CASE WHEN reaction = 'close' THEN 1 ELSE 0 END) AS close_count,
              SUM(CASE WHEN reaction = 'no' THEN 1 ELSE 0 END) AS no_count,
              AVG(CASE WHEN reaction = 'love' THEN 1.0 WHEN reaction = 'close' THEN 0.4 ELSE 0.0 END) AS utility
       FROM inspiration_feedback WHERE session_id = ?`,
    ).bind(SESSION_ID).first<Omit<EvalRow, 'recommendation_count'>>(),
    db.prepare('SELECT model, search_mode, COUNT(*) AS runs FROM inspiration_recommendations WHERE session_id = ? GROUP BY model, search_mode ORDER BY runs DESC').bind(SESSION_ID).all(),
    getInspirationMemory(SESSION_ID),
    db.prepare(
      `SELECT COUNT(*) AS considered,
              SUM(CASE WHEN shown = 1 THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN vetoes_json <> '[]' THEN 1 ELSE 0 END) AS vetoed
       FROM recommendation_candidates WHERE session_id = ?`,
    ).bind(SESSION_ID).first<{ considered: number; shown: number; vetoed: number }>(),
    db.prepare('SELECT event_type, COUNT(*) AS count FROM outcome_events WHERE session_id = ? GROUP BY event_type').bind(SESSION_ID).all<{ event_type: string; count: number }>(),
  ]);
  const recommendationCount = Number(recommendations?.count ?? 0);
  const feedbackCount = Number(feedback?.feedback_count ?? 0);
  return Response.json({
    recommendationCount,
    feedbackCount,
    feedbackCoverage: recommendations?.edits ? Math.round((feedbackCount / recommendations.edits) * 1000) / 10 : 0,
    evidenceLimit: 'Reaction rates describe preference, not proven improvement or physical fit. Compare future reactions by pipeline version using the saved pre-feedback memory.',
    reactionRates: {
      love: feedbackCount ? Number(feedback?.love_count ?? 0) / feedbackCount : 0,
      close: feedbackCount ? Number(feedback?.close_count ?? 0) / feedbackCount : 0,
      no: feedbackCount ? Number(feedback?.no_count ?? 0) / feedbackCount : 0,
    },
    averageUtility: Math.round(Number(feedback?.utility ?? 0) * 100) / 100,
    memory,
    models: models.results,
    catalog: {
      version: catalogData.version,
      generatedAt: catalogData.generatedAt,
      productCount: catalogData.productCount,
      retailer: catalogData.retailer,
      exactProductPages: catalogData.products.every((product) => {
        const url = new URL(product.canonicalUrl);
        return (url.hostname === 'www.aritzia.com' && url.pathname.startsWith('/us/en/product/'))
          || (url.hostname === 'www.massimodutti.com' && /^\/us\/[^/]+-l\d+(?:\.html)?$/.test(url.pathname));
      }),
      localImages: catalogData.products.every((product) => !product.imageUrl || product.imageUrl.startsWith('/catalog/')),
      fresh: Date.now() - Date.parse(catalogData.generatedAt) <= 72 * 60 * 60 * 1000,
      categories: Object.fromEntries(['top', 'bottom', 'dress', 'layer', 'shoes'].map((category) => [category, catalogData.products.filter((product) => product.category === category).length])),
    },
    candidates: {
      considered: Number(candidates?.considered ?? 0),
      shown: Number(candidates?.shown ?? 0),
      vetoed: Number(candidates?.vetoed ?? 0),
    },
    outcomes: Object.fromEntries(outcomes.results.map((row) => [row.event_type, Number(row.count)])),
  });
}
