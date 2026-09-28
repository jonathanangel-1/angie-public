export type Slot = 'dress' | 'outerwear' | 'top' | 'skirt' | 'pants';
export const SLOTS: Slot[] = ['dress', 'outerwear', 'top', 'skirt', 'pants'];

export type GarmentAttributes = {
  type: string;
  color: string;
  pattern: string;
  fabric: string;
  vibe: string;
  length?: string;
};

// One piece of the look. `crop` is a small JPEG data URL of the masked garment,
// used for image search and shown back to her; it is not stored server-side.
export type Garment = {
  id: string;
  slot: Slot;
  attributes: GarmentAttributes;
  query: string;
  crop: string;
  embedding?: number[];
};

export type Candidate = {
  id: string;
  title: string;
  brand: string;
  url: string;
  image: string;
  price: number;
  currency: string;
  sizes: string[];
  fabric: string;
  rating: number | null;
  reviews: number | null;
  sources: string[];
  // 0..1: image similarity to the garment crop when measured, else a rank-based proxy.
  visual: number;
};

export interface GarmentProvider {
  readonly name: string;
  understand(image: ArrayBuffer, contentType: string): Promise<Garment[]>;
  similarity?(garment: Garment, imageUrls: string[]): Promise<number[]>;
}

export interface ProductSource {
  readonly name: string;
  search(garment: Garment, options: { budgetMax?: number; limit: number }): Promise<Candidate[]>;
}
