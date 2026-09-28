import { recommendSize, type LearnedFit } from '@/lib/fit/model';
import type { BodySizeChart, Category, FitProfile, Product, SizeRecommendation } from '@/lib/fit/types';
import { colorSimilarity, shapeSimilarity, type ImageFeatures } from '@/lib/match/embedding';

// Resemblance decides what she sees; fit confidence decides order among
// comparable looks. A near-twin she cannot size still shows, flagged.
const VISUAL_WEIGHT = 0.75;
const FIT_WEIGHT = 0.25;
// Below this an item no longer looks like the inspiration; show it only to
// avoid an empty page.
const MIN_SIMILARITY = 0.55;
const MIN_RESULTS = 3;

export type PublicProduct = Omit<Product, 'features'>;
export type RankedResult = {
  product: PublicProduct;
  similarity: { total: number; shape: number; color: number; explanation: string };
  fit: SizeRecommendation;
  score: number;
};

export function visualSimilarity(query: ImageFeatures, features: ImageFeatures) {
  const shape = shapeSimilarity(query, features), color = colorSimilarity(query, features);
  return { shape, color, total: 0.5 * shape + 0.5 * color };
}

export function guessCategory(query: ImageFeatures, products: Product[]): { category: Category | null; confidence: number } {
  const neighbours = products.filter(p => p.features?.version === query.version)
    .map(p => ({ category: p.category, similarity: shapeSimilarity(query, p.features!) }))
    .sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  if (!neighbours.length) return { category: null, confidence: 0 };
  // Near-identical silhouettes must outvote several merely similar ones.
  const weight = (similarity: number) => Math.exp((similarity - neighbours[0].similarity) / 0.03);
  const votes = new Map<Category, number>();
  for (const n of neighbours) votes.set(n.category, (votes.get(n.category) || 0) + weight(n.similarity));
  const [category, total] = [...votes].sort((a, b) => b[1] - a[1])[0];
  return { category, confidence: total / neighbours.reduce((sum, n) => sum + weight(n.similarity), 0) };
}

function explain(shape: number, color: number, query: ImageFeatures, product: Product) {
  const colorText = color >= 0.9 ? `same colour (${query.colorName})` : color >= 0.6 ? 'a close colour' : `a different colour (${product.features?.colorName || product.color})`;
  const shapeText = shape >= 0.93 ? 'a near-identical silhouette' : shape >= 0.85 ? 'a similar silhouette' : 'a different cut';
  return `${colorText[0].toUpperCase()}${colorText.slice(1)} and ${shapeText}.`;
}

export function rankProducts(query: ImageFeatures, category: Category | null, products: Product[], profile: FitProfile, learned: LearnedFit, charts: BodySizeChart[], limit = 8): RankedResult[] {
  const excluded = new Set(learned.excludedProducts);
  return products
    .filter(p => p.features?.version === query.version && (!category || p.category === category) && !excluded.has(p.id))
    .map(product => {
      const { shape, color, total } = visualSimilarity(query, product.features!);
      const fit = recommendSize(product, profile, learned, charts);
      const publicProduct: PublicProduct & { features?: ImageFeatures } = { ...product };
      delete publicProduct.features;
      return {
        product: publicProduct,
        similarity: { total: Math.round(total * 1000) / 1000, shape: Math.round(shape * 1000) / 1000, color: Math.round(color * 1000) / 1000, explanation: explain(shape, color, query, product) },
        fit,
        score: VISUAL_WEIGHT * total + FIT_WEIGHT * fit.score,
      };
    })
    .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
    .filter((result, index) => result.similarity.total >= MIN_SIMILARITY || index < MIN_RESULTS)
    .slice(0, limit);
}
