import { env } from 'cloudflare:workers';

type AuthEnv = { PUBLIC_DEMO?: string; ANGIE_ACCESS_CODE?: string; EXTRA_ACCESS_CODES?: string };
const COOKIE = 'angie_session';
export const DEMO_USER = 'demo';
export const DEMO_CODE = 'demo-participant';

const config = () => env as unknown as AuthEnv;
export const isDemo = () => config().PUBLIC_DEMO === '1';

// One access code per person. Adding a person is configuration, not code:
// EXTRA_ACCESS_CODES="sam:code-one,lee:code-two".
function accounts() {
  const list: Array<{ userId: string; code: string }> = [];
  if (config().ANGIE_ACCESS_CODE) list.push({ userId: 'angie', code: config().ANGIE_ACCESS_CODE! });
  for (const entry of (config().EXTRA_ACCESS_CODES || '').split(',')) {
    const [userId, code] = entry.split(':').map(part => part?.trim());
    if (userId && code && /^[a-z0-9-]{1,40}$/.test(userId) && userId !== DEMO_USER) list.push({ userId, code });
  }
  if (isDemo()) list.push({ userId: DEMO_USER, code: DEMO_CODE });
  return list;
}

function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function signature(userId: string, code: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`angie-session:${userId}`));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function login(code: string) {
  const account = accounts().find(a => equal(a.code, code.trim()));
  if (!account) return null;
  const secure = isDemo() ? '' : '; Secure';
  return { userId: account.userId, cookie: `${COOKIE}=${account.userId}.${await signature(account.userId, account.code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}` };
}

export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function viewer(request: Request) {
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const [userId, mac] = value.split('.');
  const account = accounts().find(a => a.userId === userId);
  if (!account || !mac || !equal(mac, await signature(account.userId, account.code))) return null;
  return { userId: account.userId, demo: account.userId === DEMO_USER };
}
