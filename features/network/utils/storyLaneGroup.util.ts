/**
 * One Pulse LOAD story per shipper lane — same identity as Network pools
 * (pickup × drop × vehicle). Multiple indents on that lane must not become
 * extra story bubbles or progress segments.
 */
import {
  poolKey,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";

export type StoryLanePost = {
  id?: string | null;
  organization_id?: string | null;
  type?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicle_type?: string | null;
  source_indent_id?: string | null;
  is_sponsored?: boolean | null;
  created_at?: string | null;
};

export function storyLaneKey(post: StoryLanePost): string {
  const org = (post.organization_id ?? "").trim();
  const type = (post.type ?? "").trim().toUpperCase() || "LOAD";
  const lane = post.is_sponsored ? "ad" : "organic";
  if (type !== "LOAD") {
    return `${org}:${type}:${lane}:${post.id ?? ""}`;
  }
  const pool = poolKeyId(
    poolKey({
      pickup: post.origin,
      drop: post.destination,
      vehicleType: post.vehicle_type,
    }),
  );
  return `${org}:LOAD:${lane}:${pool || (post.source_indent_id ?? post.id ?? "")}`;
}

export type GroupedStoryLane<T extends StoryLanePost> = {
  post: T;
  indentIds: string[];
  indentCount: number;
};

function createdMs(post: StoryLanePost): number {
  return new Date(post.created_at ?? 0).getTime();
}

/** Newest representative per shipper lane; unique indent ids on that lane. */
export function groupStoriesByLane<T extends StoryLanePost>(
  posts: readonly T[],
): GroupedStoryLane<T>[] {
  const ordered = [...posts].sort((a, b) => createdMs(b) - createdMs(a));
  const groups = new Map<string, GroupedStoryLane<T>>();
  for (const post of ordered) {
    const key = storyLaneKey(post);
    const indentId = String(post.source_indent_id ?? "").trim();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        post,
        indentIds: indentId ? [indentId] : [],
        indentCount: indentId ? 1 : 1,
      });
      continue;
    }
    if (indentId && !existing.indentIds.includes(indentId)) {
      existing.indentIds.push(indentId);
      existing.indentCount = existing.indentIds.length;
    } else if (!indentId) {
      existing.indentCount = Math.max(existing.indentCount, 1);
    }
  }
  return [...groups.values()];
}

export function collapseStoriesByLane<T extends StoryLanePost>(
  posts: readonly T[],
): T[] {
  return groupStoriesByLane(posts).map((group) => group.post);
}

export function indentCountForStory<T extends StoryLanePost>(
  posts: readonly T[],
  postId: string | null | undefined,
): number {
  if (!postId) return 0;
  const group = groupStoriesByLane(posts).find((row) => row.post.id === postId);
  return group?.indentCount ?? 0;
}

/** Every live post + indent on the same shipper lane as this story. */
export function laneMembersForPost<T extends StoryLanePost>(
  posts: readonly T[],
  postId: string | null | undefined,
): { posts: T[]; postIds: string[]; indentIds: string[] } {
  if (!postId) return { posts: [], postIds: [], indentIds: [] };
  const target = posts.find((row) => row.id === postId);
  if (!target) {
    return { posts: [], postIds: [], indentIds: [] };
  }
  const key = storyLaneKey(target);
  const lanePosts = posts.filter((row) => storyLaneKey(row) === key);
  const postIds = [
    ...new Set(lanePosts.map((row) => String(row.id ?? "").trim()).filter(Boolean)),
  ];
  const indentIds = [
    ...new Set(
      lanePosts
        .map((row) => String(row.source_indent_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  return { posts: lanePosts, postIds, indentIds };
}
