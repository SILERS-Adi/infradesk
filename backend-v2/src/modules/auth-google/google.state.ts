import { redis } from '../../lib/redis';
import { randomToken } from '../../lib/crypto';

// Short-lived state stored in Redis; bound to userId so we can verify the
// callback belongs to the same user who started the flow.
const TTL_SECONDS = 10 * 60; // 10 min — user must complete consent in this window
const KEY_PREFIX = 'oauth:google:state:';

export interface PendingState {
  userId: string;
  redirect: string; // frontend path to return to
  createdAt: number;
}

export async function createState(userId: string, redirect: string): Promise<string> {
  const state = randomToken(24);
  const payload: PendingState = { userId, redirect, createdAt: Date.now() };
  await redis.set(KEY_PREFIX + state, JSON.stringify(payload), 'EX', TTL_SECONDS);
  return state;
}

export async function consumeState(state: string): Promise<PendingState | null> {
  const raw = await redis.get(KEY_PREFIX + state);
  if (!raw) return null;
  // Single-use — delete immediately so a stolen `state` can't be replayed.
  await redis.del(KEY_PREFIX + state);
  try {
    return JSON.parse(raw) as PendingState;
  } catch {
    return null;
  }
}
