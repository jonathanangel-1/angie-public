import { saveQuiz } from '@/lib/server/db';
import { body, handle, tasteSummary, userContext } from '@/lib/server/context';
import { parseQuiz } from '@/lib/server/validate';

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

export function GET(request: Request) {
  return handle(request, async context => Response.json(tasteSummary(context), noStore));
}

export function PUT(request: Request) {
  return handle(request, async context => {
    await saveQuiz(context.userId, parseQuiz(await body(request)));
    return Response.json(tasteSummary((await userContext(request))!), noStore);
  });
}
