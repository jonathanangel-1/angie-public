export type SizeConfidence = 'High' | 'Moderate' | 'Low';
export type EditLabel = 'BEST MATCH' | 'LOW-RISK' | 'CONTROLLED STRETCH';
export type InspirationReaction = 'love' | 'close' | 'no';
export type ProductSubtype = 'tee' | 'shirt' | 'cami' | 'knit' | 'bodysuit' | 'trouser' | 'jean' | 'skirt' | 'short' | 'dress' | 'blazer' | 'jacket' | 'coat' | 'heel' | 'flat' | 'boot' | 'sandal' | 'loafer' | 'sneaker' | 'unknown';

export type InspirationGarment = {
  evidence?: import('./garment-evidence').GarmentEvidence;
  visibility?: { hem: 'clear' | 'hidden'; waist: 'clear' | 'hidden'; sleeveEnds: 'clear' | 'hidden'; neckline: 'clear' | 'hidden' };
  slot: 'top' | 'bottom' | 'dress' | 'layer' | 'shoes';
  category: 'top' | 'bottom' | 'dress' | 'layer' | 'shoes';
  subtype: ProductSubtype;
  colorFamily: string;
  silhouette: string;
  length: string;
  rise: string | null;
  neckline: string | null;
  sleeve: string | null;
  material: string | null;
  details: string[];
  importance: number;
};

export type StyleAttribute = {
  type: string;
  value: string;
};

export type RecommendationItem = {
  fitEvidence?: { masterProductId?: string; bodySizeChart?: import('./inspiration-engine').CatalogProduct['bodySizeChart'] };
  matchQuality?: 'close' | 'alternative';
  matchDifferences?: string[];
  id: string;
  catalogId?: string;
  variantId?: string;
  slot: string;
  name: string;
  brand: string;
  officialUrl: string;
  imageUrl: string;
  color: string;
  price: string;
  recommendedSize: string;
  sizeConfidence: SizeConfidence;
  why: string;
  fitWatch: string;
  attributes: StyleAttribute[];
  sourceStatus: 'catalog-verified' | 'page-verified' | 'official-link';
  checkedAt: string;
  scoreBreakdown?: { request: number; taste: number; fit: number; learning: number; total: number };
  vetoEvidence?: string[];
};

export type InspirationIntent = {
  scope: 'single-item' | 'whole-look';
  requestedCategory: 'top' | 'bottom' | 'dress' | 'layer' | 'shoes' | null;
  requestedSubtype: ProductSubtype | null;
  occasion: 'casual' | 'polished' | 'evening' | 'tailored';
  palette: string[];
  silhouettes: string[];
  avoid: string[];
  keywords: string[];
  garments: InspirationGarment[];
};

export type InspirationEdit = {
  id: string;
  label: EditLabel;
  title: string;
  story: string;
  matchScore: number;
  baseMatchScore: number;
  learningAdjustment: number;
  confidence: SizeConfidence;
  finish: string;
  missingSlots?: string[];
  searchIncomplete?: boolean;
  items: RecommendationItem[];
};

export type InspirationBrief = {
  title: string;
  observed: string;
  preserve: string[];
  adapt: string[];
};

export type LearnedPreference = {
  type: string;
  value: string;
  weight: number;
};

export type InspirationMemory = {
  purchasePreferences?: Array<{ catalogId: string; weight: number; reason: string }>;
  fitOutcomes?: Array<{ catalogId: string; size: string; fit: 'fits' | 'too-small' | 'too-large' | 'too-short' | 'too-long' | 'unknown'; createdAt: number }>;
  mode?: 'personal' | 'test';
  feedbackCount: number;
  signalCount: number;
  likes: LearnedPreference[];
  avoidances: LearnedPreference[];
  recentNotes: Array<{ reaction: InspirationReaction; note: string; context?: string }>;
};

export type InspirationRecommendation = {
  confirmedFeedback?: Record<string,{reaction:InspirationReaction;note:string;targetItemIds:string[]}>;
  id: string;
  imageUrl: string;
  brief: InspirationBrief;
  edits: InspirationEdit[];
  sources: string[];
  model: string;
  searchMode: string;
  memory: InspirationMemory;
  createdAt: number;
};
