import { getOrganizationMembers } from "@/features/organization/services/members.service";
import { formatLedgerDateTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";

export function formatAdjustmentAddedAt(iso?: string | null): string {
  return formatLedgerDateTime(iso);
}

export function resolveAdjustmentAddedBy(
  adj: Pick<TripAdjustment, "created_by" | "created_by_name">,
  names: Record<string, string>,
  self?: { userId?: string | null; name?: string | null },
): string {
  const id = String(adj.created_by ?? "").trim();
  if (id && names[id]?.trim()) return names[id].trim();
  const stored = String(adj.created_by_name ?? "").trim();
  if (stored) return stored;
  if (id && self?.userId === id && self.name?.trim()) return self.name.trim();
  if (!id && self?.name?.trim()) return self.name.trim();
  if (id) return "Team member";
  return "—";
}

function memberLabel(input: {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string | null {
  const name =
    String(input.full_name ?? "").trim() ||
    String(input.email ?? "").trim() ||
    String(input.phone ?? "").trim();
  return name || null;
}

/** Resolve CN/DN creator names from the org roster, then the signed-in session. */
export async function fetchAdjustmentActorNames(
  ids: Array<string | null | undefined>,
  orgId?: string | null,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const out: Record<string, string> = {};

  if (orgId) {
    const { members } = await getOrganizationMembers(orgId);
    for (const member of members) {
      if (!unique.includes(member.user_id)) continue;
      const label = memberLabel(member);
      if (label) out[member.user_id] = label;
    }
  }

  const missing = unique.filter((id) => !out[id]);
  if (missing.length === 0) return out;
  try {
    const { data } = await supabase().auth.getUser();
    const user = data.user ?? (await supabase().auth.getSession()).data.session?.user ?? null;
    if (user && missing.includes(user.id)) {
      const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      const label =
        String(meta.full_name ?? "").trim() ||
        String(meta.name ?? "").trim() ||
        String(user.email ?? "").trim();
      if (label) out[user.id] = label;
    }
  } catch {
    /* session missing */
  }
  return out;
}
