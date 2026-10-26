/**
 * Broadcast-story picker lanes. Same identity as Indent Pool / Network
 * (pickup × drop × vehicle). One card per lane — never one card per indent.
 */
import {
  poolKey,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";

export type BroadcastPoolIndent = {
  id: string;
  pickup_area?: string | null;
  drop_location?: string | null;
  vehicle_type?: string | null;
  created_at?: string | null;
  client_id?: string | null;
  client_name?: string | null;
};

export type BroadcastPoolLane<I extends BroadcastPoolIndent> = {
  poolId: string;
  pickup: string;
  drop: string;
  vehicleType: string;
  members: I[];
  representative: I;
  indentCount: number;
  extraClientCount: number;
};

function createdMs(indent: BroadcastPoolIndent): number {
  return new Date(indent.created_at ?? 0).getTime();
}

export function broadcastPoolId(indent: BroadcastPoolIndent): string {
  const key = poolKey({
    pickup: indent.pickup_area,
    drop: indent.drop_location,
    vehicleType: indent.vehicle_type,
  });
  if (key.pickup && key.drop && key.vehicleType) return poolKeyId(key);
  return `indent:${indent.id}`;
}

export type BroadcastStoryFilter = "all" | "active" | "inactive";

export function laneHasActiveStory(
  memberIds: readonly string[],
  storyStates: Record<string, { isLive?: boolean } | undefined>,
): boolean {
  return memberIds.some((id) => storyStates[id]?.isLive === true);
}

/** Live lanes stay on the reel. Deploy is only for inactive lanes. */
export function canDeployBroadcastLane(
  memberIds: readonly string[],
  storyStates: Record<string, { isLive?: boolean } | undefined>,
): boolean {
  return memberIds.length > 0 && !laneHasActiveStory(memberIds, storyStates);
}

export function filterBroadcastLanesByStory<
  I extends BroadcastPoolIndent,
  L extends { members: readonly I[] },
>(
  lanes: readonly L[],
  filter: BroadcastStoryFilter,
  storyStates: Record<string, { isLive?: boolean } | undefined>,
): L[] {
  if (filter === "all") return [...lanes];
  return lanes.filter((lane) => {
    const active = laneHasActiveStory(
      lane.members.map((member) => member.id),
      storyStates,
    );
    return filter === "active" ? active : !active;
  });
}

function broadcastClientKey(indent: BroadcastPoolIndent): string {
  const id = (indent.client_id ?? "").trim();
  if (id) return `id:${id}`;
  const name = (indent.client_name ?? "").trim().toLowerCase();
  return name ? `name:${name}` : `indent:${indent.id}`;
}

export function formatBroadcastExtraClients(extraClientCount: number): string | null {
  if (extraClientCount <= 0) return null;
  return extraClientCount === 1 ? "+1 client" : `+${extraClientCount} clients`;
}

export function formatBroadcastLaneClientTitle(
  name: string | null | undefined,
  extraClientCount: number,
): string {
  const extra = formatBroadcastExtraClients(extraClientCount);
  const base = (name ?? "").trim() || "Client";
  return extra ? `${base} ${extra}` : base;
}

/** Client with the most indents on the lane; extras become "+N clients". */
export function pickBroadcastLanePrimaryClient<I extends BroadcastPoolIndent>(
  members: readonly I[],
): { indent: I; extraClientCount: number } {
  const groups = new Map<string, I[]>();
  for (const member of members) {
    const key = broadcastClientKey(member);
    const list = groups.get(key);
    if (list) list.push(member);
    else groups.set(key, [member]);
  }
  let best: I[] = [];
  for (const list of groups.values()) {
    if (list.length > best.length) {
      best = list;
      continue;
    }
    if (list.length === best.length && best.length > 0) {
      const listNewest = Math.max(...list.map(createdMs));
      const bestNewest = Math.max(...best.map(createdMs));
      if (listNewest > bestNewest) best = list;
    }
  }
  const sorted = [...best].sort((a, b) => createdMs(b) - createdMs(a));
  return {
    indent: sorted[0] ?? members[0]!,
    extraClientCount: Math.max(0, groups.size - 1),
  };
}

export function groupBroadcastIndentsByPool<I extends BroadcastPoolIndent>(
  indents: readonly I[],
): BroadcastPoolLane<I>[] {
  const groups = new Map<string, I[]>();
  for (const indent of indents) {
    const id = broadcastPoolId(indent);
    const list = groups.get(id);
    if (list) list.push(indent);
    else groups.set(id, [indent]);
  }

  return [...groups.entries()]
    .map(([poolId, members]) => {
      const sorted = [...members].sort((a, b) => createdMs(b) - createdMs(a));
      const primary = pickBroadcastLanePrimaryClient(sorted);
      const representative = primary.indent;
      return {
        poolId,
        pickup: (representative.pickup_area ?? "").trim(),
        drop: (representative.drop_location ?? "").trim(),
        vehicleType: (representative.vehicle_type ?? "").trim(),
        members: sorted,
        representative,
        indentCount: sorted.length,
        extraClientCount: primary.extraClientCount,
      };
    })
    .sort((a, b) => createdMs(b.representative) - createdMs(a.representative));
}
