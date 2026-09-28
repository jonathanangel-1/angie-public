import { deleteRecord } from '@/lib/server/db';
import { handle, tasteSummary, userContext } from '@/lib/server/context';

export function DELETE(request: Request) {
  return handle(request, async context => {
    const url = new URL(request.url);
    const table = url.searchParams.get('type') === 'reaction' ? 'reactions' : 'purchases';
    if (!(await deleteRecord(context.userId, table, url.searchParams.get('id') || ''))) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json(tasteSummary((await userContext(request))!));
  });
}
