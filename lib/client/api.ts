import type { Piece } from '@/lib/look/pipeline';
import type { Slot } from '@/lib/look/types';
import type { ImportCandidate } from '@/lib/taste/email';
import type { RankedCandidate } from '@/lib/taste/model';
import type { Purchase, Quiz, Reaction } from '@/lib/taste/types';

export type TasteSummary = {
  userId: string; demo: boolean; hasQuiz: boolean; quiz: Quiz;
  purchases: Purchase[]; reactions: Reaction[];
  likes: Array<{ feature: string; weight: number }>; dislikes: Array<{ feature: string; weight: number }>;
  brands: Array<{ brand: string; kept: number; returned: number }>;
};
export type LookResponse = { pieces: Piece[]; provider: string; timings: { understandMs: number; totalMs: number } };
export type RankResponse = { pieces: Array<{ garmentId: string; ranked: RankedCandidate[]; excluded: Piece['excluded'] }> };
export type EmailPreview = { candidates: ImportCandidate[]; skipped: Array<{ subject: string; why: string }> };

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || 'Something went wrong.');
  return data as T;
}

export const SLOT_LABEL: Record<Slot, string> = { dress: 'Dress', outerwear: 'Jacket', top: 'Top', skirt: 'Skirt', pants: 'Pants' };
export const DEMO_LOOKS = [
  { file: '/demo/looks/look-01-city.png', label: 'Weekend city look' },
  { file: '/demo/looks/look-02-dinner.png', label: 'Dinner look' },
  { file: '/demo/looks/look-03-office.png', label: 'Office to drinks' },
];
export const DEMO_EMAILS = ['01-northfield-order', '02-juniper-order', '03-marlow-order', '04-northfield-return', '05-juniper-return-label', '06-coastline-return-only', '07-newsletter'].map(n => `/demo/emails/${n}.eml`);
