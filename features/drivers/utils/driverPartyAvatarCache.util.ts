/**
 * Display-only avatar memo. This file stays free of identity and organization
 * imports so sign-out and workspace changes can clear it without a cycle.
 * Successful lookups last five minutes. Failures are not kept. An in-flight
 * lookup from an older epoch cannot write back after a clear.
 */
const AVATAR_LOOKUP_TTL_MS = 5 * 60_000;

type CachedLookup<T> = { at: number; epoch: number; value: Promise<T> };

const clientDetailsCache = new Map<string, CachedLookup<{ error: unknown }>>();
const linkedOrgProfileCache = new Map<string, CachedLookup<{ error: unknown }>>();

let identityEpoch = 0;
let avatarUserId: string | null = null;
let avatarWorkspaceId: string | null = null;

function memoLookup<T extends { error: unknown }>(
  cache: Map<string, CachedLookup<{ error: unknown }>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.epoch === identityEpoch && Date.now() - hit.at < AVATAR_LOOKUP_TTL_MS) {
    return hit.value as Promise<T>;
  }
  const epoch = identityEpoch;
  const value = load();
  cache.set(key, { at: Date.now(), value, epoch });
  const dropIfOurs = () => {
    if (cache.get(key)?.value === value) cache.delete(key);
  };
  void value.then(
    (res) => {
      if (epoch !== identityEpoch || res.error) dropIfOurs();
    },
    dropIfOurs,
  );
  return value;
}

export function memoDriverClientDetails<T extends { error: unknown }>(
  clientId: string,
  load: () => Promise<T>,
): Promise<T> {
  return memoLookup(clientDetailsCache, clientId, load);
}

export function memoDriverLinkedOrgProfile<T extends { error: unknown }>(
  orgId: string,
  load: () => Promise<T>,
): Promise<T> {
  return memoLookup(linkedOrgProfileCache, orgId, load);
}

/** Drop memoised avatars. In-flight lookups from the previous epoch cannot write back. */
export function clearDriverPartyAvatarCache(): void {
  identityEpoch += 1;
  clientDetailsCache.clear();
  linkedOrgProfileCache.clear();
}

/** Clear when the signed-in user changes. Same user is a no-op. */
export function bindDriverPartyAvatarUser(userId: string | null): void {
  if (avatarUserId === userId) return;
  avatarUserId = userId;
  clearDriverPartyAvatarCache();
}

/** Clear when the active workspace changes. The same workspace is a no-op. */
export function bindDriverPartyAvatarWorkspace(workspaceId: string | null): void {
  if (avatarWorkspaceId === workspaceId) return;
  avatarWorkspaceId = workspaceId;
  clearDriverPartyAvatarCache();
}

/** Test hook: clear the avatar lookup memo and the bound identity. */
export function clearDriverPartyAvatarCacheForTests(): void {
  avatarUserId = null;
  avatarWorkspaceId = null;
  clearDriverPartyAvatarCache();
}
