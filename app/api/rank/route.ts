import { rankCandidates } from '@/lib/taste/model';
import { body, handle } from '@/lib/server/context';
import { parseCandidate, parseGarment } from '@/lib/server/validate';

// Re-rank candidates the browser already holds, with her latest taste state.
export function POST(request: Request) {
  return handle(request, async context => {
    const input = await body(request) as { pieces?: Array<{ garment?: unknown; candidates?: unknown[] }> };
    const pieces = (input.pieces || []).slice(0, 6).map(piece => {
      const garment = parseGarment(piece.garment);
      const candidates = (piece.candidates || []).slice(0, 60).map(parseCandidate);
      return { garmentId: garment.id, ...rankCandidates(candidates, garment.slot, context.state) };
    });
    return Response.json({ pieces });
  });
}
