import { login, logoutCookie, viewer } from '@/lib/server/session';

export async function GET(request: Request) {
  const who = await viewer(request);
  return Response.json({ userId: who?.userId ?? null, demo: who?.demo ?? false });
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { code?: unknown };
  const session = await login(String(input.code ?? ''));
  if (!session) return Response.json({ error: 'That code is not right.' }, { status: 401 });
  return Response.json({ userId: session.userId }, { headers: { 'Set-Cookie': session.cookie } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': logoutCookie() } });
}
