import { env } from 'cloudflare:workers';
import indexData from '@/data/catalog-index.json';
import { styleSimilarity } from '@/lib/style-embedding';
import type { CatalogProduct } from '@/lib/inspiration-engine';
import type { InspirationGarment, InspirationIntent } from '@/lib/inspiration-types';
import type { SearchBudget } from '@/lib/search-budget';

type Entry = { id: string; canonicalUrl: string; sourceUrl: string; caption: string; visual: boolean; attributes: Record<string,string>; imageDataUrl?: string; vector?: number[] };
const entries = new Map((indexData.products as Entry[]).map(entry => [entry.id,entry]));
export type RetrievalScores = Map<string, number>;
export const retrievalKey = (slot: string, id: string) => `${slot}:${id}`;

export function preparedCatalog(products: CatalogProduct[]): CatalogProduct[] {
  return products.map(product => {
    const entry = entries.get(product.id);
    if (!entry || entry.canonicalUrl !== product.canonicalUrl || entry.sourceUrl !== product.imageSourceUrl) return product;
    const known = Object.fromEntries(Object.entries(entry.attributes).filter(([,v]) => v && v !== 'unknown'));
    return { ...product, attributes: { ...product.attributes, ...(entry.visual ? known : {}), visualCaption: entry.visual ? entry.caption : undefined },
      privateImageEvidence: entry.imageDataUrl ? {sourceUrl:entry.sourceUrl,dataUrl:entry.imageDataUrl} : product.privateImageEvidence };
  });
}
export function garmentQuery(g: InspirationGarment) {
  return `${g.subtype === 'unknown' ? g.category : g.subtype}. ${g.colorFamily}. ${g.silhouette} silhouette. ${g.length} length. ${g.rise || ''} rise. ${g.neckline || ''} neckline. ${g.sleeve || ''} sleeves. ${g.material || ''}. ${g.details.join('. ')}`;
}
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot=0,left=0,right=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];left+=a[i]*a[i];right+=b[i]*b[i];}
  return left&&right?dot/Math.sqrt(left*right):0;
}
// Visual captions and retailer descriptions are embedded text, not image vectors.
// Direct image comparison still decides eligibility after this inexpensive recall stage.
export async function retrieveCatalog(intent: InspirationIntent, products: CatalogProduct[], budget?: SearchBudget): Promise<{ scores: RetrievalScores; mode: string }> {
  const scores: RetrievalScores = new Map();
  const vectors: number[][]=[];
  if(entries.size) try {
    const key=(env as unknown as {OPENAI_API_KEY?:string}).OPENAI_API_KEY||process.env.OPENAI_API_KEY;
    const response=await (budget ? budget.fetch('retrieval') : fetch)('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({model:'text-embedding-3-small',dimensions:256,encoding_format:'float',input:intent.garments.map(garmentQuery)})});
    if(response.ok){const result=await response.json() as {data:Array<{index:number;embedding:number[]}>}; for(const row of result.data||[]) vectors[row.index]=row.embedding;}
  } catch { /* Lexical/attribute retrieval remains available if embedding service fails. */ }
  intent.garments.forEach((garment, index)=>{
    const pool=products.filter(p=>p.category===garment.category);
    const lexical=[...pool].sort((a,b)=>styleSimilarity(b,garment)-styleSimilarity(a,garment));
    const semantic=vectors[index] ? pool.filter(p=>entries.get(p.id)?.vector?.length===256 && entries.get(p.id)?.sourceUrl===p.imageSourceUrl && entries.get(p.id)?.canonicalUrl===p.canonicalUrl).sort((a,b)=>cosine(entries.get(b.id)!.vector!,vectors[index])-cosine(entries.get(a.id)!.vector!,vectors[index])) : [];
    lexical.forEach((p,i)=>scores.set(retrievalKey(garment.slot,p.id),1/(15+i)));
    semantic.forEach((p,i)=>{const k=retrievalKey(garment.slot,p.id);scores.set(k,(scores.get(k)||0)+1/(15+i));});
  });
  return {scores,mode:vectors.length?'hybrid-visual-caption-index-v1':'attribute-index-fallback'};
}
