import { importCandidates } from '@/lib/taste/email';
import { body, handle } from '@/lib/server/context';
import { InputError } from '@/lib/server/validate';

// Parses pasted/uploaded .eml text. Nothing is saved until she confirms.
export function POST(request: Request) {
  return handle(request, async () => {
    const input = await body(request) as { emails?: unknown };
    const emails = Array.isArray(input.emails) ? input.emails.filter((e): e is string => typeof e === 'string').slice(0, 200).map(e => e.slice(0, 200_000)) : [];
    if (!emails.length) throw new InputError('Add at least one email.');
    return Response.json(importCandidates(emails, Date.now()));
  });
}
