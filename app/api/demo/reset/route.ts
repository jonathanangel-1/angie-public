import { deleteUserData } from '@/lib/server/db';
import { handle, tasteSummary, userContext } from '@/lib/server/context';

export function POST(request: Request) {
  return handle(request, async context => {
    if (!context.demo) return Response.json({ error: 'Only the demo profile can be reset.' }, { status: 403 });
    await deleteUserData(context.userId);
    return Response.json(tasteSummary((await userContext(request))!));
  });
}
