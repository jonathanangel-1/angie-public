import { env } from 'cloudflare:workers';
import type { InspirationIntent } from '@/lib/inspiration-types';
import { MIN_VISUAL_SCORE, type VisualCandidate, type VisualMatch } from '@/lib/inspiration-engine';
import { cleanEvidence, evidenceSchema } from '@/lib/garment-evidence';
import type { SearchBudget } from '@/lib/search-budget';

const MODEL = 'gpt-5.4-mini-2026-03-17';
const FINAL_MODEL = 'gpt-5.4-2026-03-05';
type AiEnv = { OPENAI_API_KEY?: string };
type OpenAiResult = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
type EvidenceCandidate = VisualCandidate & { imageEvidenceUrl: string };

const schema = {
  type: 'object', additionalProperties: false, required: ['matches'],
  properties: {
    matches: {
      type: 'array', minItems: 1, maxItems: 30,
      items: {
        type: 'object', additionalProperties: false, required: ['candidateId', 'targetSlot', 'score', 'reason', 'hardConflict', 'majorProportionMismatch', 'observedSilhouette', 'observedLength', 'observedColorFamily', 'evidence', 'quality'],
        properties: {
          candidateId: { type: 'string' }, targetSlot: { type: 'string', enum: ['top', 'bottom', 'dress', 'layer', 'shoes'] },
          score: { type: 'number', minimum: 0, maximum: 100 }, reason: { type: 'string' }, hardConflict: { type: 'boolean' },
          majorProportionMismatch: { type: 'boolean' },
          evidence: evidenceSchema,
          quality: { type: 'object', additionalProperties: false, required: ['status','confidence','evidence'], properties: { status: {type:'string',enum:['concern','no-visible-concern','unknown']}, confidence:{type:'string',enum:['high','medium','low']}, evidence:{type:'string'} } },
          observedSilhouette: { type: 'string' }, observedLength: { type: 'string' }, observedColorFamily: { type: 'string' },
        },
      },
    },
  },
} as const;

function apiKey() {
  const key = ((env as unknown as AiEnv).OPENAI_API_KEY || process.env.OPENAI_API_KEY)?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is unavailable.');
  return key;
}

function base64(bytes: ArrayBuffer) {
  const array = new Uint8Array(bytes); let binary = '';
  for (let offset = 0; offset < array.length; offset += 0x8000) binary += String.fromCharCode(...array.subarray(offset, Math.min(offset + 0x8000, array.length)));
  return btoa(binary);
}

function outputText(result: OpenAiResult) {
  for (const output of result.output || []) if (output.type === 'message') for (const content of output.content || []) if (content.type === 'output_text' && content.text) return content.text;
  throw new Error('The visual matcher returned no ranking.');
}

function fetchableImageUrl(candidate: VisualCandidate) {
  if (candidate.retailer !== 'Aritzia') {
    const url = new URL(candidate.imageSourceUrl);
    if (url.hostname === 'static.massimodutti.net') { url.searchParams.set('w', '400'); url.searchParams.set('f', 'auto'); }
    if (['cottoncitizen.com', 'cdn.shopify.com', 'www.threedots.com'].includes(url.hostname)) url.searchParams.set('width', '480');
    return url.href;
  }
  return candidate.imageSourceUrl.replace('q_auto,f_auto', 'q_70,f_jpg').replace('w_1920', 'w_500').replace('w_900', 'w_500');
}

async function imageEvidence(candidate: VisualCandidate): Promise<EvidenceCandidate | null> {
  if (candidate.imageDataUrl && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(candidate.imageDataUrl) && candidate.imageDataUrl.length <= 150_000) return { ...candidate, imageEvidenceUrl: candidate.imageDataUrl };
  try {
    const response = await fetch(fetchableImageUrl(candidate), {
      headers: {
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
        Referer: candidate.retailer === 'Aritzia' ? 'https://www.aritzia.com/intl/en/' : candidate.retailer === 'Massimo Dutti' ? 'https://www.massimodutti.com/us/' : new URL(candidate.imageSourceUrl).origin + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) throw new Error(`unsupported ${contentType || 'content type'}`);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 600 * 1024) throw new Error(`invalid size ${bytes.byteLength}`);
    return { ...candidate, imageEvidenceUrl: `data:${contentType};base64,${base64(bytes)}` };
  } catch (error) {
    console.warn('[visual-matcher] image evidence unavailable', { candidateId: candidate.id, retailer: candidate.retailer, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function judge(imageType: string, imageBytes: ArrayBuffer, intent: InspirationIntent, usable: EvidenceCandidate[], stage: 'screen' | 'final', budget?: SearchBudget) {
  const allowed = new Map(usable.map((candidate) => [candidate.id, candidate]));
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: `You are a visual retrieval judge running the ${stage} stage. Compare every retailer candidate to the corresponding garment visible in the FIRST inspiration image.

Score visual fidelity only: garment type, silhouette, proportions, rise, length, neckline, sleeves, construction, fabric drape, color and distinctive details. Ignore the wearer, pose, face, background, brand prestige and Angie's general taste. A merely fashionable item is not a match. Penalize a wrong subtype or visibly different cut heavily.

Fill evidence for EACH PRODUCT independently before judging its similarity. Evidence must describe the target product in its photograph, not copy the inspiration or the retailer's whole styled outfit. Use the canonical feature values and confidence. High confidence requires that the feature is plainly visible. Unknown is mandatory for cropped hems, obscured sleeves, hidden necklines or uncertain construction. Do not award credit for guessing that hidden properties match. Cream/light beige/stone are pale-neutral; camel/taupe are darker camel. Distinguish plain jersey from lace or sheer fabric. A rolled sleeve establishes its visible length only. The application will enforce feature contradictions independently of your score; do not soften observations to make a candidate pass.

Compare garment ease explicitly before color: torso cling versus fabric standing off the body, waist suppression, sleeve opening, shoulder seam, hem width and drape. A close-fitting stretch tee is NOT equivalent to a lightly skimming cotton tee just because both are white crewnecks. Do not infer an oversized fit solely from a larger model, or assume sizing up fixes the cut. Set majorProportionMismatch=true when these defining proportions visibly contradict the inspiration (bodycon versus skimming, wide versus slim leg, floor-length versus knee-length). Minor differences are not major mismatches. Unknown ease is not proof of similarity. A major mismatch must score below 55. Use observedSilhouette='bodycon' for visible cling, 'fitted' for shaped but non-clinging, 'relaxed' for visible ease; do not collapse them into one label.

Set hardConflict=true only for a different garment function or fundamentally incompatible shape (for example skirt versus trousers). Different color shades, modest length differences, retailer subtype labels, styling on the model, or missing exact details are scoring differences, NOT automatic conflicts. Compare only the TARGET garment in each retailer photo; ignore other clothes worn alongside it. Describe only what the product image visibly establishes; use "unknown" when unclear.

Functional construction is essential: a sleeveless knit cannot recreate a sweater tied by its sleeves; score below 55 and hardConflict=true. A short-sleeve crewneck cannot be a close match for a long-sleeve V-neck merely because both are white. Contradicting both neckline and sleeve, or both color family and cut, must score below 55. Black trousers are not a close visual match for light beige trousers. Preserve the outfit's light/dark contrast, not just the broad garment category. Never describe a strap or buttons as absent when visibly present. Retailer names are contextual evidence, not proof that the pictured garment has the claimed cut.

The extracted observations below include confidence. Only high-confidence properties are requirements. Medium means a tentative interpretation, not a feature to insist on or reward matching. Unknown means genuinely unobserved: a hidden trouser hem provides no evidence of wide, cropped, full-length or pooling legs. Evaluate the visible hip/thigh ease independently. Do not let an uncertain V-neck interpretation reject a similar shallow neckline. If the original image contradicts an extraction hypothesis, the image wins. Do not silently infer a definite silhouette from the prose brief.

Garments extracted from the inspiration: ${JSON.stringify(intent.garments)}

Separately assess visible finish and construction in quality, without changing the visual-fidelity score. Angie rejects visibly flimsy fabric and poor construction. A concern requires a concrete visible defect such as distorted seams, uneven finish, or unwanted transparency relative to this inspiration. Do not treat intentional lace, sheer eveningwear, normal wrinkles, synthetic fibers, low price or brand as evidence of poor quality. High confidence requires a plainly visible defect and a specific evidence explanation. Use unknown when photos or material information cannot establish this. No-visible-concern is not proof of durability or premium quality. Never invent weave, fabric weight or composition.

Return every supplied candidate ID exactly once. The reason is internal evaluation evidence, not customer copy. Use the SAME absolute rubric across batches: 90–100 near twin; 75–89 very similar cut and proportions; 65–74 close style with differences; 55–64 recognizably similar core shape/function with a larger detail or color difference; below 55 not a useful similar-style result. Similarity is graded, not an exact-match checklist. Do not reward the best of an unrelated batch. Unknown evidence cannot earn a high score. In the final stage compare the requested garment's shape first, then its place in the outfit.` },
    { type: 'input_image', image_url: `data:${imageType};base64,${base64(imageBytes)}`, detail: 'high' },
  ];
  for (const candidate of usable) {
    content.push({ type: 'input_text', text: `Candidate ${candidate.id}; target=${candidate.targetSlot}; retrieval=${candidate.retrievalScore}; ${candidate.retailer}; ${candidate.name}; ${candidate.color}; ${candidate.metadata}` });
    content.push({ type: 'input_image', image_url: candidate.imageEvidenceUrl, detail: stage === 'final' ? 'high' : 'low' });
  }
  const response = await (budget ? budget.fetch(`visual-${stage}`) : fetch)('https://api.openai.com/v1/responses', {
    signal: AbortSignal.timeout(45000),
    method: 'POST', headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: stage === 'final' ? FINAL_MODEL : MODEL, store: false, reasoning: { effort: 'low' }, max_output_tokens: 6500,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'visual_product_matches', strict: true, schema } },
    }),
  });
  const result = await response.json().catch(() => ({})) as OpenAiResult;
  if (!response.ok) throw new Error(`OpenAI visual match ${response.status}: ${result.error?.message || 'request failed'}`);
  const parsed = JSON.parse(outputText(result)) as { matches: VisualMatch[] };
  const seen = new Set<string>();
  const matches = parsed.matches.filter((match) => {
    const candidate = allowed.get(match.candidateId);
    if (!candidate || seen.has(match.candidateId) || candidate.targetSlot !== match.targetSlot) return false;
    seen.add(match.candidateId); return true;
  }).map((match) => ({ ...match, evidence: cleanEvidence(match.evidence), score: Math.max(0, Math.min(100, Number(match.score) || 0)), reason: String(match.reason).slice(0, 180), hardConflict: Boolean(match.hardConflict), observedSilhouette: String(match.observedSilhouette || 'unknown').slice(0, 40), observedLength: String(match.observedLength || 'unknown').slice(0, 40), observedColorFamily: String(match.observedColorFamily || 'unknown').slice(0, 40) }));
  if (!matches.length) throw new Error('The visual matcher returned no usable ranking.');
  return matches;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function pool<T, R>(values: T[], concurrency: number, task: (value: T) => Promise<R>) {
  const results: R[] = new Array(values.length); let cursor = 0;
  let failure: unknown;
  let failed = false;
  const worker = async () => { while (cursor < values.length && !failed) {
    const index = cursor++;
    try { results[index] = await task(values[index]); }
    catch (error) { failed = true; failure ??= error; }
  } };
  // Finish already-paid siblings before surfacing an error so the usage audit
  // includes them. Stop starting new work once any sibling fails.
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  if (failed) throw failure;
  return results;
}

export async function rankVisualCandidates(imageType: string, imageBytes: ArrayBuffer, intent: InspirationIntent, candidates: VisualCandidate[], budget?: SearchBudget): Promise<{ matches: VisualMatch[]; model: string }> {
  const external = candidates.filter((candidate) => /^https:\/\//.test(candidate.imageSourceUrl) && !/\/f7f7f7(?:$|[/?])/.test(candidate.imageSourceUrl));
  if (!external.length) return { matches: [], model: MODEL };
  // Pre-indexed retrieval sends a small shortlist per garment. Evaluate every
  // slot concurrently with the final judge, not a screen -> re-download -> judge
  // cascade. Missing images for one slot must not erase the other garments.
  const indexedSlots = [...new Set(external.map(candidate => candidate.targetSlot))];
  if (indexedSlots.every(slot => external.filter(candidate => candidate.targetSlot === slot).length <= 10)) {
    const matches = (await pool(indexedSlots, 3, async slot => {
      const shortlist = external.filter(candidate => candidate.targetSlot === slot);
      const usable = (await pool(shortlist, 4, imageEvidence)).filter((candidate): candidate is EvidenceCandidate => Boolean(candidate));
      if (!usable.length) return [];
      try {
        return await judge(imageType, imageBytes, { ...intent, garments: intent.garments.filter(garment => garment.slot === slot) }, usable, 'final', budget);
      } catch (error) {
        if (/Search budget|OpenAI.*(?:401|403|429)/.test(String(error))) throw error;
        console.warn('[visual-slot-unavailable]', { slot, error: error instanceof Error ? error.message : 'unavailable' });
        return [];
      }
    })).flat();
    return { matches, model: FINAL_MODEL };
  }
  let usableCount = 0; let failedBatches = 0;
  // Fetch and release each batch: holding up to 180 encoded images together can
  // exceed the Worker's 128 MB heap before the model request is even sent.
  const screened = (await pool(chunks(external, 12), 2, async (batch) => {
    const usable = (await pool(batch, 4, imageEvidence)).filter((candidate): candidate is EvidenceCandidate => Boolean(candidate));
    usableCount += usable.length;
    if (!usable.length) return [];
    try { return await judge(imageType, imageBytes, intent, usable, external.length <= 12 ? 'final' : 'screen', budget); }
    catch (error) { if (/Search budget|OpenAI.*(?:401|403|429)/.test(String(error))) throw error; failedBatches++; return []; }
  })).flat();
  console.info('[visual-retrieval]', { candidates: external.length, usableImages: usableCount, judged: screened.length, failedBatches });
  if (!usableCount) throw new Error('Retailer images are temporarily unavailable. Please try again later.');
  if (!screened.length) throw new Error('Visual comparison is temporarily unavailable.');
  if (external.length <= 12) return { matches: screened, model: FINAL_MODEL };
  const bySlot = new Map<string, VisualMatch[]>();
  for (const match of screened) bySlot.set(match.targetSlot, [...(bySlot.get(match.targetSlot) || []), match]);
  const finalists = [...bySlot.values()].flatMap((matches) => matches.filter((match) => !match.hardConflict && !match.majorProportionMismatch && match.score >= MIN_VISUAL_SCORE).sort((left, right) => right.score - left.score).slice(0, 6));
  const finalistIds = new Set(finalists.map((match) => match.candidateId));
  const finalistCandidates = (await pool(external.filter((candidate) => finalistIds.has(candidate.id)), 4, imageEvidence)).filter((candidate): candidate is EvidenceCandidate => Boolean(candidate));
  if (!finalistCandidates.length) return { matches: screened.filter(match => match.score < MIN_VISUAL_SCORE || match.hardConflict || match.majorProportionMismatch), model: MODEL };
  // Final quality review is per garment, never a mixed pile of tops, shoes and
  // trousers. Unreviewed screening scores must not outrank reviewed candidates.
  const slots = [...new Set(finalistCandidates.map(candidate => candidate.targetSlot))];
  const final = (await pool(slots, 2, async slot => {
    const targetIntent = { ...intent, garments: intent.garments.filter(garment => garment.slot === slot) };
    return judge(imageType, imageBytes, targetIntent, finalistCandidates.filter(candidate => candidate.targetSlot === slot), 'final', budget);
  })).flat();
  return { matches: final, model: `${MODEL}+${FINAL_MODEL}` };
}
