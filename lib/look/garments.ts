import demo from '@/data/demo/looks.json';
import type { Candidate, Garment, GarmentProvider, ProductSource } from '@/lib/look/types';

// Open-weight pipeline served by spike/server.py (SegFormer-clothes +
// Grounding-DINO + FashionCLIP). Keyless; runs on any CPU box.
export class SidecarGarments implements GarmentProvider {
  readonly name = 'open-models-sidecar';
  constructor(private baseUrl: string, private transport: typeof fetch = (input, init) => fetch(input, init)) {}

  async understand(image: ArrayBuffer, contentType: string) {
    const response = await this.transport(`${this.baseUrl}/understand`, { method: 'POST', headers: { 'Content-Type': contentType }, body: image, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Garment service ${response.status}`);
    return (await response.json() as { garments: Garment[] }).garments;
  }

  async similarity(garment: Garment, imageUrls: string[]) {
    if (!garment.embedding || !imageUrls.length) return imageUrls.map(() => NaN);
    const response = await this.transport(`${this.baseUrl}/similarity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embedding: garment.embedding, urls: imageUrls }), signal: AbortSignal.timeout(60000) });
    if (!response.ok) return imageUrls.map(() => NaN);
    return (await response.json() as { scores: number[] }).scores;
  }
}

type DemoLook = { id: string; hash: string; garments: Array<Garment & { candidates: Candidate[] }> };
const looks = demo.looks as unknown as DemoLook[];

async function sha256(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Demo mode: recognises the fictional sample looks and returns their
// pre-written pieces. It does not look at pixels. Clearly a mock.
export class DemoGarments implements GarmentProvider {
  readonly name = 'demo-fixtures (mock)';
  async understand(image: ArrayBuffer) {
    const hash = await sha256(image);
    const look = looks.find(l => l.hash === hash);
    if (!look) throw new Error('Demo mode only reads the fictional sample looks. Run the garment service to analyse your own photos (see README).');
    return look.garments.map(g => {
      const garment: Garment & { candidates?: Candidate[] } = { ...g };
      delete garment.candidates;
      return garment;
    });
  }
}

export class DemoSource implements ProductSource {
  readonly name = 'demo-fixtures (mock)';
  async search(garment: Garment) {
    return looks.flatMap(l => l.garments).find(g => g.id === garment.id)?.candidates || [];
  }
}
