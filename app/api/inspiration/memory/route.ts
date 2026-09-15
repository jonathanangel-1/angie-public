import { inspirationScope } from '@/lib/inspiration-scope';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { ensureSchema, ensureSession } from '@/lib/persistence';

export async function GET(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  await ensureSchema();
  await ensureSession(scope.sessionId, scope.mode === 'test' ? 'Style QA' : 'Angie');
  return Response.json(await getInspirationMemory(scope.sessionId));
}
