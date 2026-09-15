import { env } from 'cloudflare:workers';
import { angieProfile } from '@/data/angie-profile';
import { evidenceSchema, groundedGarment } from '@/lib/garment-evidence';
import type { SearchBudget } from '@/lib/search-budget';
import type { InspirationBrief, InspirationGarment, InspirationIntent, InspirationMemory } from '@/lib/inspiration-types';

// Read the user's photo once with the stronger visual model. A missing sleeve
// or wrong silhouette here sends every subsequent search in the wrong direction.
const MODEL = 'gpt-5.4-2026-03-05';
type AiEnv = { OPENAI_API_KEY?: string };
type OpenAiResult = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
const schema = {
  type: 'object', additionalProperties: false, required: ['brief', 'intent'],
  properties: {
    brief: { type: 'object', additionalProperties: false, required: ['title', 'observed', 'preserve', 'adapt'], properties: {
      title: { type: 'string' }, observed: { type: 'string' },
      preserve: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
      adapt: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
    } },
    intent: { type: 'object', additionalProperties: false, required: ['scope', 'requestedCategory', 'requestedSubtype', 'occasion', 'palette', 'silhouettes', 'avoid', 'keywords', 'garments'], properties: {
      scope: { type: 'string', enum: ['single-item', 'whole-look'] },
      requestedCategory: { type: ['string', 'null'], enum: ['top', 'bottom', 'dress', 'layer', 'shoes', null] },
      requestedSubtype: { type: ['string', 'null'], enum: ['tee', 'shirt', 'cami', 'knit', 'bodysuit', 'trouser', 'jean', 'skirt', 'short', 'dress', 'blazer', 'jacket', 'coat', 'heel', 'flat', 'boot', 'sandal', 'loafer', 'sneaker', 'unknown', null] },
      occasion: { type: 'string', enum: ['casual', 'polished', 'evening', 'tailored'] },
      palette: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string' } },
      silhouettes: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string' } },
      avoid: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string' } },
      keywords: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
      garments: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['slot', 'category', 'subtype', 'colorFamily', 'silhouette', 'length', 'rise', 'neckline', 'sleeve', 'material', 'details', 'importance', 'evidence', 'visibility'], properties: {
        evidence: evidenceSchema,
        visibility: { type: 'object', additionalProperties: false, required: ['hem', 'waist', 'sleeveEnds', 'neckline'], properties: Object.fromEntries(['hem', 'waist', 'sleeveEnds', 'neckline'].map(name => [name, { type: 'string', enum: ['clear', 'hidden'] }])) },
        slot: { type: 'string', enum: ['top', 'bottom', 'dress', 'layer', 'shoes'] },
        category: { type: 'string', enum: ['top', 'bottom', 'dress', 'layer', 'shoes'] },
        subtype: { type: 'string', enum: ['tee', 'shirt', 'cami', 'knit', 'bodysuit', 'trouser', 'jean', 'skirt', 'short', 'dress', 'blazer', 'jacket', 'coat', 'heel', 'flat', 'boot', 'sandal', 'loafer', 'sneaker', 'unknown'] },
        colorFamily: { type: 'string' }, silhouette: { type: 'string' }, length: { type: 'string' },
        rise: { type: ['string', 'null'] }, neckline: { type: ['string', 'null'] }, sleeve: { type: ['string', 'null'] }, material: { type: ['string', 'null'] },
        details: { type: 'array', minItems: 0, maxItems: 6, items: { type: 'string' } }, importance: { type: 'integer', minimum: 1, maximum: 5 },
      } } },
    } },
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
function memoryText(memory: InspirationMemory) {
  const likes = memory.likes.map((item) => `${item.type}=${item.value}`).join(', ') || 'none';
  const avoid = memory.avoidances.map((item) => `${item.type}=${item.value}`).join(', ') || 'none';
  const notes = memory.recentNotes.slice(0, 5).map((item) => `${item.context || 'Whole look'}: ${item.note}`).join(' | ') || 'none';
  return `Confirmed live evidence: likes ${likes}; avoid ${avoid}; comments ${notes}.`;
}
function prompt(note: string, memory: InspirationMemory, hasImage: boolean) {
  return `Extract a shopping intent for Angie. ${hasImage ? 'Read the attached inspiration image.' : 'There is no image; use only the written request.'}
User request: ${note || 'Translate the complete inspiration.'}
${hasImage ? 'Describe the image independently of past preferences. Personalization happens after visual matching.' : `Angie: ${angieProfile.identity}. Direction: ${angieProfile.becoming}.
Known rules: ${angieProfile.rules.map((rule) => rule.rule).join(' ')}
${memoryText(memory)}`}

Return only a visual/style brief and intent. Do not name, search for, or invent any retailer, product, price, size, URL, stock claim, or match score. Distinguish visible facts from inference.

First establish visibility, then fill evidence. A cropped/obscured hem means length=unknown, NOT full length, ankle length, or pooling. A hidden waist means rise=null. A sleeve rolled up only establishes the visible sleeve length, not its original length. Confidence=high requires clear visual evidence; use medium for ambiguity and unknown for anything hidden. Record colour shade: cream/ivory/light beige/stone are pale-neutral, tan/taupe are camel, not one generic neutral. Surface describes visible construction/pattern, not guessed fibre composition. For trousers judge only the visible leg outline; do not imagine a wide hem below the crop. In the brief and details do not restate unknown properties as facts. Do not adapt or redesign the inspiration before searching. Written requests establish only the explicitly requested features.

For an image, decompose the outfit into only the clearly visible purchasable garments: top, bottom, dress, layer and shoes. Describe each garment precisely enough to retrieve a visual twin: exact subtype, color, silhouette, proportions, rise, length, neckline, sleeve, apparent material/drape and distinctive construction details. Never replace the visible style with Angie's usual preferences; her preferences are applied later. Do not add a blazer, shoe or other piece that is not visible.

Each slot must be unique. A sweater worn over another top or tied at the waist belongs to slot=layer but category=top, subtype=knit, because retailers sell it as knitwear. Include it even when tied rather than worn. Distinguish bodycon/clinging, fitted/skimming, and relaxed fabric ease; record visible torso ease, sleeve width and hem proportion in details. A shaped tee is not automatically a tight stretch tee. Ignore social-media UI, text overlays and other people's outfits.

Do not split one under-layer into an invented camisole plus dress. If only small sections are visible under a coat, identify one plausible underlying garment with uncertainty, not extra hidden pieces. Use subtype shirt only for an actual shirt/blouse construction, not as a synonym for every upper-body garment. A plain jersey long-sleeve top is a tee; a top's hidden lower fastening is not evidence of a bodysuit.

If one garment is requested in text, use single-item and its exact subtype: T-shirt/tee is tee, trousers/pants are trouser, jeans are jean, skirt is skirt, heels are heel. Otherwise use whole-look and set requestedSubtype to null. Keep prose short.`;
}
function outputText(result: OpenAiResult) {
  for (const output of result.output || []) if (output.type === 'message') for (const content of output.content || []) if (content.type === 'output_text' && content.text) return content.text;
  throw new Error('The model returned no style brief.');
}

export function normalizeGarmentCategory(garment: InspirationGarment): InspirationGarment {
  const category:InspirationGarment['category'] = ['tee','shirt','cami','knit','bodysuit'].includes(garment.subtype) ? 'top'
    : ['trouser','jean','skirt','short'].includes(garment.subtype) ? 'bottom'
    : ['blazer','jacket','coat'].includes(garment.subtype) ? 'layer'
    : garment.subtype === 'dress' ? 'dress'
    : ['heel','flat','boot','sandal','loafer','sneaker'].includes(garment.subtype) ? 'shoes' : garment.category;
  return {...garment,category};
}

export async function interpretInspiration(imageType: string, imageBytes: ArrayBuffer | null, note: string, memory: InspirationMemory, budget?: SearchBudget): Promise<{ brief: InspirationBrief; intent: InspirationIntent; model: string }> {
  const response = await (budget ? budget.fetch('interpretation') : fetch)('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: MODEL, store: false, reasoning: { effort: 'low' }, max_output_tokens: 5200,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: prompt(note, memory, Boolean(imageBytes)) },
      ...(imageBytes ? [{ type: 'input_image', image_url: `data:${imageType};base64,${base64(imageBytes)}`, detail: 'high' }] : []),
    ] }], text: { format: { type: 'json_schema', name: 'angie_style_intent', strict: true, schema } },
  }), signal: AbortSignal.timeout(45000) });
  const result = await response.json().catch(() => ({})) as OpenAiResult;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${result.error?.message || 'request failed'}`);
  const parsed = JSON.parse(outputText(result)) as { brief: InspirationBrief; intent: InspirationIntent };
  // Outfit role and retailer taxonomy are different: a tied sweater remains
  // knitwear, not a coat. Normalize this known taxonomy ambiguity deterministically.
  parsed.intent.garments = parsed.intent.garments.map(normalizeGarmentCategory).map(garment => groundedGarment(garment, Boolean(imageBytes)));
  return { ...parsed, model: MODEL };
}
