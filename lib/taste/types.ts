import type { Slot } from '@/lib/look/types';

export const NEVER_OPTIONS = ['crop tops', 'bodycon', 'low rise', 'mini length', 'sheer', 'polyester', 'animal print', 'ruffles', 'strapless'] as const;
export type Never = typeof NEVER_OPTIONS[number];

// Day-one onboarding. Everything is optional except that sizes make the
// suggested size useful from the first look.
export type Quiz = {
  sizes: { top?: string; bottom?: string; dress?: string; jeans?: string };
  measurements?: { bust?: number; waist?: number; hips?: number };
  fit: { top?: 'fitted' | 'relaxed' | 'oversized'; bottom?: 'fitted' | 'straight' | 'wide' };
  neverWear: Never[];
  budgetMax?: number;
  brandsLove: string[];
  brandsAvoid: string[];
  imageReactions: Record<string, 'love' | 'no'>;
};

export type ReturnReason = 'too-small' | 'too-large' | 'too-long' | 'too-short' | 'quality' | 'style' | 'color' | 'other';
export const FIT_REASONS: ReturnReason[] = ['too-small', 'too-large', 'too-long', 'too-short'];

// An order she placed: from the email import, from feedback on a result, or typed in.
export type Purchase = {
  id: string;
  brand: string;
  title: string;
  slot: Slot | null;
  size: string;
  status: 'ordered' | 'kept' | 'returned';
  returnReason?: ReturnReason | null;
  price?: number | null;
  source: 'email' | 'feedback' | 'manual';
  // How sure we are this record is right: email parsing is noisy.
  confidence: number;
  createdAt: number;
};

export type Reaction = {
  id: string;
  brand: string;
  title: string;
  features: string[];
  reaction: 'love' | 'no';
  reason?: 'style' | 'color' | 'price' | 'fabric' | 'fit' | null;
  createdAt: number;
};

export type TasteState = { quiz: Quiz; purchases: Purchase[]; reactions: Reaction[] };

export const emptyQuiz = (): Quiz => ({ sizes: {}, fit: {}, neverWear: [], brandsLove: [], brandsAvoid: [], imageReactions: {} });
