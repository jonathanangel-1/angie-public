import { runLook } from '@/lib/look/pipeline';
import { handle } from '@/lib/server/context';
import { providers } from '@/lib/server/providers';
import { InputError } from '@/lib/server/validate';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Look photo in, pieces with ranked matches out. Nothing about the photo or
// the results is stored.
export function POST(request: Request) {
  return handle(request, async context => {
    const form = await request.formData().catch(() => null);
    const file = form?.get('image');
    if (!(file instanceof File) || !TYPES.has(file.type)) throw new InputError('Upload a JPG, PNG or WebP photo.');
    if (file.size > 8 * 1024 * 1024) throw new InputError('Photos must be under 8 MB.');
    const { garments, sources } = providers(context.demo);
    const look = await runLook(await file.arrayBuffer(), file.type, garments, sources, context.state);
    return Response.json(look, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}
