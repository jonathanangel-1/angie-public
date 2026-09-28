import { deleteUserData } from '@/lib/server/db';
import { handle, profileSummary, seedDemoUser, userContext } from '@/lib/server/context';

export function POST(request: Request) {
  return handle(request, async context => {
    if (!context.demo) return Response.json({ error: 'Only the demo profile can be reset.' }, { status: 403 });
    await deleteUserData(context.userId);
    await seedDemoUser(context.userId);
    return Response.json(profileSummary((await userContext(request))!));
  });
}
