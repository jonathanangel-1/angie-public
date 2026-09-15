import { env } from 'cloudflare:workers';
const demoEnabled = () => (env as unknown as { PUBLIC_DEMO?: string }).PUBLIC_DEMO === '1' || process.env.PUBLIC_DEMO === '1';

export type AccessRole = 'participant' | 'admin';

const COOKIE_NAME = 'angie_style_access';
type PrivateEnv = { ANGIE_ACCESS_CODE?: string; DEMO_ADMIN_ACCESS_CODE?: string };

function privateEnv() {
  return env as unknown as PrivateEnv;
}

function roleToken(role: AccessRole) {
  const config = privateEnv();
  if (role === 'participant') return config.ANGIE_ACCESS_CODE || (demoEnabled() ? 'demo-participant' : '');
  return config.DEMO_ADMIN_ACCESS_CODE || (demoEnabled() ? 'demo-admin' : '');
}

function expectedCode(role: AccessRole) {
  const config = privateEnv();
  if (role === 'participant') return config.ANGIE_ACCESS_CODE || (demoEnabled() ? 'demo-participant' : '');
  return config.DEMO_ADMIN_ACCESS_CODE || (demoEnabled() ? 'demo-admin' : '');
}

function constantTimeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function roleForCode(code: string): AccessRole | null {
  const normalized = code.trim();
  if (constantTimeEqual(normalized.toUpperCase(), expectedCode('participant').toUpperCase())) return 'participant';
  if (constantTimeEqual(normalized.toUpperCase(), expectedCode('admin').toUpperCase())) return 'admin';
  return null;
}

export function isValidParticipantInvite(token: string) {
  return Boolean(token) && constantTimeEqual(token, expectedCode('participant'));
}

export function cookieForRole(role: AccessRole) {
  const config = privateEnv();
  const secure = config.ANGIE_ACCESS_CODE || config.DEMO_ADMIN_ACCESS_CODE ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(roleToken(role))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function clearAccessCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getAccessRole(request: Request): AccessRole | null {
  const cookie = request.headers.get('cookie') ?? '';
  const encoded = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.split('=')[1];
  const value = encoded ? decodeURIComponent(encoded) : '';
  if (constantTimeEqual(value, roleToken('participant'))) return 'participant';
  if (constantTimeEqual(value, roleToken('admin'))) return 'admin';
  return null;
}

export function requireRole(request: Request, allowed: AccessRole[]) {
  const role = getAccessRole(request);
  return role && allowed.includes(role) ? role : null;
}
