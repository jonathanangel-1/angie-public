import { inspirationScope } from '@/lib/inspiration-scope';
import { generateInspiration } from '@/lib/inspiration-pipeline';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { storeInspirationImage, privateSearchCache } from '@/lib/inspiration-storage';
import { SearchBudget } from '@/lib/search-budget';
import { classifyInspirationFailure } from '@/lib/inspiration-failure';
import type { InspirationRecommendation } from '@/lib/inspiration-types';
import { database, ensureSchema, ensureSession, recordEvent } from '@/lib/persistence';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const imageEntry = form?.get('image');
  const image = imageEntry instanceof File ? imageEntry : null;
  const noteEntry = form?.get('note');
  const note = typeof noteEntry === 'string' ? noteEntry.trim().slice(0, 600) : '';
  if (imageEntry && !image) return Response.json({ error: 'Use a JPG, PNG or WebP picture.' }, { status: 400 });
  if (!image && !note) return Response.json({ error: 'Add a picture or describe what you want.' }, { status: 400 });
  if (image && !ALLOWED_IMAGE_TYPES.has(image.type)) return Response.json({ error: 'Use a JPG, PNG or WebP picture.' }, { status: 400 });
  if (image && (image.size < 1 || image.size > MAX_IMAGE_BYTES)) return Response.json({ error: 'The picture must be smaller than 8 MB.' }, { status: 400 });

  let storageKey = '';
  let stage = 'initialization';
  let diagnostics: Record<string, unknown> = {};
  const searchTrace: Array<{ stage: string; details: Record<string, unknown> }> = [];
  const startedAt = Date.now();
  const budget = new SearchBudget({ cache: privateSearchCache(), onUsage: row => console.info('[search-usage]', row) });
  try {
    await ensureSchema();
    await ensureSession(scope.sessionId, scope.mode === 'test' ? 'Style QA' : 'Angie');
    const imageBytes = image ? await image.arrayBuffer() : null;
    const recommendationId = crypto.randomUUID();
    const createdAt = Date.now();
    const [imageHashBuffer, memory] = await Promise.all([
      crypto.subtle.digest('SHA-256', imageBytes ?? new TextEncoder().encode(note)),
      getInspirationMemory(scope.sessionId),
    ]);
    const { interpreted, discovery, productPool, visual, generated } = await generateInspiration(image?.type ?? '', imageBytes, note, memory, (nextStage, details) => {
      stage = nextStage; diagnostics = details;
      if (searchTrace.length < 64 && nextStage !== 'search-usage') searchTrace.push({ stage: nextStage, details });
      console.info('[inspiration-selection]', { stage, ...diagnostics });
    }, budget, { discovery: 'expanded' });
    const edits = generated.edits;
    stage = 'saving';
    console.info('[inspiration-selection]',{stage:'saving-image',elapsedMs:Date.now()-startedAt});
    if (image && imageBytes) storageKey = await storeInspirationImage(recommendationId, image.type, imageBytes);

    const db = database();
    const statements: D1PreparedStatement[] = [db.prepare(
      `INSERT INTO inspiration_recommendations
       (id, session_id, storage_key, image_type, image_hash, note, style_brief_json, edits_json, sources_json, model, search_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      recommendationId,
      scope.sessionId,
      storageKey,
      image?.type ?? 'text/plain',
      hex(imageHashBuffer),
      note || null,
      JSON.stringify(interpreted.brief),
      JSON.stringify(edits),
      JSON.stringify(generated.sources),
      [interpreted.model, visual.model, generated.model].filter(Boolean).join('+'),
      generated.searchMode,
      createdAt,
    )];
    for (const candidate of generated.audits) {
      statements.push(db.prepare(
        `INSERT INTO recommendation_candidates
         (session_id, recommendation_id, catalog_id, product_snapshot_json, score_breakdown_json, vetoes_json, score, shown, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        scope.sessionId,
        recommendationId,
        candidate.catalogId,
        JSON.stringify({ catalogId: candidate.catalogId, name: candidate.name, category: candidate.category, targetSlot: candidate.targetSlot }),
        JSON.stringify(candidate.breakdown),
        JSON.stringify(candidate.vetoes),
        candidate.score,
        candidate.shown ? 1 : 0,
        createdAt,
      ));
    }
    console.info('[inspiration-selection]',{stage:'saving-recommendation',elapsedMs:Date.now()-startedAt});
    await db.batch(statements);

    console.info('[inspiration-selection]',{stage:'saving-audit',elapsedMs:Date.now()-startedAt});
    await recordEvent('inspiration_recommended', {
      recommendationId,
      inputMode: image ? 'image' : 'text',
      actorRole: scope.actorRole,
      mode: scope.mode,
      editIds: edits.map((edit) => edit.id),
      productCount: edits.reduce((sum, edit) => sum + edit.items.length, 0),
      model: [interpreted.model, visual.model, generated.model].filter(Boolean).join('+'),
      searchMode: generated.searchMode,
      elapsedMs: Date.now() - startedAt,
      intent: interpreted.intent,
      memoryUsed: memory,
      catalogCandidates: productPool.length,
      discoveredProducts: discovery.products.length,
      visualMatches: visual.matches.length,
      usage: budget.snapshot(),
      missingSlots: edits[0]?.missingSlots || [],
      searchTrace,
      pageVerifiedItems: edits.flatMap((edit) => edit.items).filter((item) => item.sourceStatus === 'page-verified').length,
    }, scope.sessionId).catch(() => console.warn('Recommendation saved; secondary event log unavailable.'));

    const response: InspirationRecommendation = {
      id: recommendationId,
      imageUrl: image ? `/api/inspiration/image?id=${encodeURIComponent(recommendationId)}` : '',
      brief: interpreted.brief,
      edits,
      sources: generated.sources,
      model: [interpreted.model, visual.model, generated.model].filter(Boolean).join('+'),
      searchMode: generated.searchMode,
      memory,
      createdAt,
    };
    return Response.json(response);
  } catch (error) {
    if (storageKey) {
      const { inspirationBucket } = await import('@/lib/inspiration-storage');
      await inspirationBucket().delete(storageKey).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    const failure = classifyInspirationFailure(message);
    console.error('Inspiration generation failed:', message, { stage, ...diagnostics });
    await recordEvent('inspiration_failed', { stage, searchTrace, elapsedMs: Date.now() - startedAt, inputMode: image ? 'image' : 'text', reason: failure.code, usage: budget.snapshot() }, scope.sessionId).catch(() => undefined);
    return Response.json({ error: failure.error, code: failure.code }, { status: failure.status });
  }
}
