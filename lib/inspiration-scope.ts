import { env } from 'cloudflare:workers';
import { getAccessRole, type AccessRole } from '@/lib/auth';
import { SESSION_ID } from '@/lib/persistence';

export const INSPIRATION_TEST_SESSION = 'angie-qa-v1';
export const INSPIRATION_LEGACY_TEST_SESSION = 'angie-qa-legacy-v1';
export const INSPIRATION_REVIEW_SESSION = 'angie-review-legacy-v1';

export type InspirationScope = { sessionId: string; mode: 'personal' | 'test'; actorRole: AccessRole };

export function inspirationScope(request: Request): InspirationScope | null {
  const actorRole = getAccessRole(request);
  if (!actorRole) return null;
  // Fail closed into QA. Only a deployed live binding plus participant access can train Angie.
  // Client headers, query strings and request bodies cannot choose a learning session.
  const live = (env as unknown as { INSPIRATION_MODE?: string }).INSPIRATION_MODE === 'live';
  const personal = live && actorRole === 'participant';
  return { sessionId: personal ? SESSION_ID : INSPIRATION_TEST_SESSION, mode: personal ? 'personal' : 'test', actorRole };
}
