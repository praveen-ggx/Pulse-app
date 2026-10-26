/** Which stories belong to one Pulse-story bubble (same org, type, ad lane). */
export function matchesStoryBubble<
  T extends {
    organization_id?: string | null;
    type?: string | null;
    is_sponsored?: boolean | null;
  },
>(post: T, bubble: T): boolean {
  const left = (post.organization_id ?? "").trim();
  const right = (bubble.organization_id ?? "").trim();
  return (
    Boolean(left) &&
    left === right &&
    post.type === bubble.type &&
    !!post.is_sponsored === !!bubble.is_sponsored
  );
}

export function storyIdsForBubble<
  T extends {
    id?: string | null;
    organization_id?: string | null;
    type?: string | null;
    is_sponsored?: boolean | null;
  },
>(posts: readonly T[], bubble: T): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    if (!matchesStoryBubble(post, bubble)) continue;
    const id = (post.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Prefer the tapped post, then the first resolved queue row. */
export function pickOpenedStorySeed<T extends { id?: string | null }>(
  postId: string | null | undefined,
  queuePosts: readonly T[],
  extras: readonly T[] = [],
): T | null {
  const target = (postId ?? "").trim();
  const pool = [...queuePosts, ...extras];
  if (target) {
    const hit = pool.find((post) => (post.id ?? "").trim() === target);
    if (hit) return hit;
  }
  return queuePosts[0] ?? null;
}
