import type { Candidate, Garment, GarmentProvider, ProductSource } from '@/lib/look/types';
import { rankCandidates, type RankedCandidate } from '@/lib/taste/model';
import type { TasteState } from '@/lib/taste/types';

export type Piece = {
  garment: Omit<Garment, 'embedding'>;
  results: RankedCandidate[];
  // Every merged candidate, so the browser can ask for a re-rank after
  // feedback without the server storing search results.
  candidates: Candidate[];
  excluded: Array<{ title: string; brand: string; reason: string }>;
  searched: string[];
  errors: string[];
};

const key = (c: Candidate) => `${c.brand.toLowerCase()}|${c.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

// Same product found by several searches: keep one, remember every source,
// and keep the strongest visual signal.
export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const c of lists.flat()) {
    const prior = merged.get(key(c));
    if (!prior) merged.set(key(c), { ...c, sources: [...c.sources] });
    else merged.set(key(c), { ...prior, visual: Math.max(prior.visual, c.visual), sources: [...new Set([...prior.sources, ...c.sources])], sizes: prior.sizes.length ? prior.sizes : c.sizes, fabric: prior.fabric || c.fabric });
  }
  return [...merged.values()];
}

// FashionCLIP cosine similarity for product photos sits around 0.3 (unrelated)
// to 0.8 (near twin); map it to 0..1 and blend with the source's own ranking.
export const similarityToVisual = (cosine: number) => Math.max(0, Math.min(1, (cosine - 0.3) / 0.5));

export async function runLook(image: ArrayBuffer, contentType: string, provider: GarmentProvider, sources: ProductSource[], state: TasteState, perPiece = 6) {
  const started = Date.now();
  const garments = await provider.understand(image, contentType);
  const understoodMs = Date.now() - started;
  const pieces: Piece[] = await Promise.all(garments.map(async garment => {
    const errors: string[] = [];
    const lists = await Promise.all(sources.map(s => s.search(garment, { budgetMax: state.quiz.budgetMax, limit: 20 }).catch(error => { errors.push(`${s.name}: ${error instanceof Error ? error.message : 'failed'}`); return [] as Candidate[]; })));
    let candidates = mergeCandidates(lists);
    if (provider.similarity && candidates.length) {
      const top = candidates.slice(0, 30);
      const scores = await provider.similarity(garment, top.map(c => c.image)).catch(() => top.map(() => NaN));
      candidates = top.map((c, i) => Number.isFinite(scores[i]) ? { ...c, visual: 0.7 * similarityToVisual(scores[i]) + 0.3 * c.visual } : c);
    }
    const { ranked, excluded } = rankCandidates(candidates, garment.slot, state, perPiece);
    const publicGarment: Garment = { ...garment };
    delete publicGarment.embedding;
    return { garment: publicGarment, results: ranked, candidates, excluded, searched: sources.map(s => s.name), errors };
  }));
  return { pieces, provider: provider.name, timings: { understandMs: understoodMs, totalMs: Date.now() - started } };
}
