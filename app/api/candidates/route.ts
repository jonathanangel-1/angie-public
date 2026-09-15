import candidates from '@/data/candidates.json';
import { requireRole } from '@/lib/auth';

export async function GET(request: Request) {
  if (!requireRole(request, ['participant', 'admin'])) return Response.json({ error: 'Locked' }, { status: 401 });

  return Response.json({
    candidates: candidates.map(({ id, retailer, name, color, price, likelySize, cut, length, fabric, description, url, image }) => ({
      id, retailer, name, color, price, likelySize, cut, length, fabric, description, url, image,
    })),
  });
}
