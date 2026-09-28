import { learnFit } from '@/lib/fit/model';
import { saveProfile } from '@/lib/server/db';
import { body, handle, profileSummary } from '@/lib/server/context';
import { parseProfile } from '@/lib/server/validate';

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

export function GET(request: Request) {
  return handle(request, async context => Response.json(profileSummary(context), noStore));
}

export function PUT(request: Request) {
  return handle(request, async context => {
    const profile = parseProfile(await body(request));
    await saveProfile(context.userId, profile);
    const learned = learnFit(profile, context.outcomes, context.charts, context.products);
    return Response.json(profileSummary({ ...context, profile, learned }), noStore);
  });
}
