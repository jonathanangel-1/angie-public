import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CATALOG_PATH = path.join(ROOT, 'data', 'verified-catalog.json');
const MODEL = 'gpt-5.4-mini-2026-03-17';
const BATCH_SIZE = Number(process.env.CATALOG_ENRICH_BATCH || 18);
const key = process.env.OPENAI_API_KEY?.trim();
if (!key) throw new Error('OPENAI_API_KEY is unavailable.');

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
const products = catalog.products || [];
if (!products.length) throw new Error('Refresh the local catalog before enrichment.');
const pending = products.filter((product) => !product.visualEnrichment && (/^https:\/\//.test(product.imageSourceUrl || '') || product.imageUrl));
const enrichedById = new Map();

async function imagePart(product) {
  if (/^https:\/\//.test(product.imageSourceUrl || '')) return { type: 'input_image', image_url: product.imageSourceUrl, detail: 'low' };
  const bytes = await readFile(path.join(ROOT, 'public', product.imageUrl.replace(/^\//, '')));
  const mime = product.imageContentType?.startsWith('image/') ? product.imageContentType : 'image/jpeg';
  return { type: 'input_image', image_url: `data:${mime};base64,${bytes.toString('base64')}`, detail: 'low' };
}

function schemaFor(batch) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['products'],
    properties: {
      products: {
        type: 'array', minItems: batch.length, maxItems: batch.length,
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'color_family', 'silhouette', 'length', 'neckline', 'sleeve', 'formality', 'visual_details', 'visual_risks'],
          properties: {
            id: { type: 'string', enum: batch.map((product) => product.id) },
            color_family: { type: 'string', enum: ['black', 'white', 'navy', 'grey', 'cream', 'camel', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'metallic', 'print', 'unknown'] },
            silhouette: { type: 'string', enum: ['fitted', 'straight', 'flare', 'controlled', 'relaxed', 'fluid', 'structured', 'barrel', 'balloon', 'unknown'] },
            length: { type: 'string', enum: ['cropped', 'waist', 'hip', 'mini', 'knee', 'midi', 'maxi', 'ankle', 'full', 'unknown'] },
            neckline: { type: 'string', enum: ['crew', 'boat', 'square', 'v-neck', 'scoop', 'halter', 'strapless', 'collared', 'high-neck', 'asymmetric', 'unknown'] },
            sleeve: { type: 'string', enum: ['sleeveless', 'short', 'three-quarter', 'long', 'one-shoulder', 'unknown'] },
            formality: { type: 'integer', minimum: 1, maximum: 5 },
            visual_details: { type: 'array', minItems: 0, maxItems: 6, items: { type: 'string' } },
            visual_risks: { type: 'array', minItems: 0, maxItems: 4, items: { type: 'string', enum: ['uncontrolled-volume', 'cropped-top', 'shoulder-volume', 'low-rise', 'fussy-detail', 'sporty', 'sheer-looking', 'none'] } },
          },
        },
      },
    },
  };
}

async function enrich(batch) {
  const content = [{
    type: 'input_text',
    text: 'Classify only visible style properties for these official product images. Each image is preceded by its exact catalog ID, product title, retailer, and category. Do not infer fabric composition, garment measurements, stock, price, quality, or body fit. Use "unknown" when the image does not establish a property. visual_risks is limited to uncontrolled-volume, cropped-top, shoulder-volume, low-rise, fussy-detail, sporty, sheer-looking, or none. Return one record for every ID.',
  }];
  for (const product of batch) {
    content.push({ type: 'input_text', text: `CATALOG_ID: ${product.id}\nTITLE: ${product.name}\nRETAILER: ${product.retailer}\nCATEGORY: ${product.category}` });
    content.push(await imagePart(product));
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, store: false, reasoning: { effort: 'low' }, max_output_tokens: 6500,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'local_catalog_visual_attributes', strict: true, schema: schemaFor(batch) } },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${result.error?.message || 'request failed'}`);
  let outputText = '';
  for (const output of result.output || []) {
    if (output.type !== 'message') continue;
    for (const item of output.content || []) if (item.type === 'output_text') outputText = item.text;
  }
  if (!outputText) throw new Error('The model returned no visual attributes.');
  const parsed = JSON.parse(outputText).products;
  const unique = new Map(parsed.map((product) => [product.id, product]));
  if (unique.size !== batch.length) throw new Error(`Expected ${batch.length} unique enrichments; received ${unique.size}.`);
  return unique;
}

for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batch = pending.slice(offset, offset + BATCH_SIZE);
  const result = await enrich(batch);
  for (const [id, visual] of result) enrichedById.set(id, visual);
  console.log(`Enriched ${Math.min(offset + batch.length, pending.length)}/${pending.length} new catalog products.`);
}

const createdAt = new Date().toISOString();
catalog.products = products.map((product) => {
  const visual = enrichedById.get(product.id);
  if (!visual) return product;
  return {
    ...product,
    attributes: {
      ...product.attributes,
      colorFamily: visual.color_family,
      silhouette: product.attributes.silhouette === 'unknown' ? visual.silhouette : product.attributes.silhouette,
      length: product.attributes.length === 'unknown' ? visual.length : product.attributes.length,
      neckline: visual.neckline,
      sleeve: visual.sleeve,
      formality: visual.formality,
      visualDetails: visual.visual_details,
      visualRisks: visual.visual_risks.filter((value) => value !== 'none'),
    },
    visualEnrichment: { model: MODEL, createdAt, evidence: 'official-primary-image-only' },
  };
});
catalog.enrichedAt = createdAt;
catalog.enrichmentModel = MODEL;
const temporary = `${CATALOG_PATH}.tmp`;
await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`);
await rename(temporary, CATALOG_PATH);
console.log(JSON.stringify({ ok: true, products: products.length, newlyEnriched: pending.length, reused: products.length - pending.length, model: MODEL }, null, 2));
