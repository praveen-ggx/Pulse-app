import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isActivityActorUserId(value: string): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

export function collectActivityTimelineActorIds(
  rows: DriverActivityTimelineRow[],
): string[] {
  const ids = new Set<string>();
  for (const item of rows) {
    const raw =
      item.kind === "assignment" ? item.row.changed_by : item.actorUserId;
    const id = String(raw ?? "").trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export function formatActivityTimelineActorLabel(args: {
  actorUserId?: string | null;
  currentUserId?: string | null;
  displayById: Record<string, string>;
  fallback: string;
}): string {
  const actorUserId = String(args.actorUserId ?? "").trim();
  if (!actorUserId) return args.fallback;
  const lookedUp = args.displayById[actorUserId]?.trim() || "";
  const storedName = isActivityActorUserId(actorUserId) ? "" : actorUserId;
  const name = lookedUp || storedName;
  const isYou =
    Boolean(args.currentUserId) && actorUserId === args.currentUserId;
  if (isYou) return name ? `${name} (you)` : "You";
  return name || args.fallback;
}

export function fallbackActorForStatusContext(
  context: Extract<DriverActivityTimelineRow, { kind: "status" }>["status_context"],
): string {
  if (context === "accepted") return "Driver";
  if (context === "assigned") return "Dispatcher";
  if (context === "created") return "Staff";
  return "Staff";
}
