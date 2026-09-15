import { clearAccessCookie, cookieForRole, getAccessRole, isValidParticipantInvite, roleForCode } from '@/lib/auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const invite = url.searchParams.get('invite') ?? '';
  if (invite) {
    if (!isValidParticipantInvite(invite)) return new Response('This invitation is not valid.', { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Set-Cookie': cookieForRole('participant'), 'Referrer-Policy': 'no-referrer' },
    });
  }
  return Response.json({ role: getAccessRole(request) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const role = roleForCode(String(body.code ?? ''));
  if (!role) return Response.json({ error: 'That access word is not right.' }, { status: 401 });

  return Response.json({ role }, { headers: { 'Set-Cookie': cookieForRole(role) } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearAccessCookie() } });
}
