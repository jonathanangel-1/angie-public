import { inspirationScope } from '@/lib/inspiration-scope';
import { inspirationBucket } from '@/lib/inspiration-storage';
import { database, ensureSchema } from '@/lib/persistence';

type ImageRow = { storage_key: string };

export async function GET(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return new Response('Locked', { status: 401 });
  const id = new URL(request.url).searchParams.get('id')?.slice(0, 80) ?? '';
  if (!id) return new Response('Missing image.', { status: 400 });
  await ensureSchema();
  const row = await database().prepare(
    'SELECT storage_key FROM inspiration_recommendations WHERE id = ? AND session_id = ?',
  ).bind(id, scope.sessionId).first<ImageRow>();
  if (!row?.storage_key) return new Response('Not found.', { status: 404 });
  const object = await inspirationBucket().get(row.storage_key);
  if (!object) return new Response('Not found.', { status: 404 });
  const headers = new Headers({ 'Cache-Control': 'private, max-age=31536000, immutable' });
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
}
