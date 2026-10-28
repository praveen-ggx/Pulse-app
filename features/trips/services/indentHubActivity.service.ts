import {
  normalizeIndentRow,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import { supabase } from "@/lib/supabase";

const ACTIVITY_SELECT =
  "id, organization_id, indent_number, indent_code, indent_operational_code, display_indent_id, client_name, pickup_area, drop_location, status, cancel_reason, award_revoked_at, created_at, updated_at, last_saved_at, shared_at, created_by_user_id, owner_user_id, active_trip:trips!trips_indent_id_fkey(trip_operational_code, trip_number, trip_code)";

function sanitizeActivitySearch(raw: string): string {
  return raw.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

async function indentIdsMatchingTripSearch(
  orgId: string,
  query: string,
): Promise<string[]> {
  const { data, error } = await supabase()
    .from("trips")
    .select("indent_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("indent_id", "is", null)
    .or(
      [
        `trip_operational_code.ilike.%${query}%`,
        `trip_number.ilike.%${query}%`,
        `display_trip_id.ilike.%${query}%`,
        `trip_code.ilike.%${query}%`,
      ].join(","),
    )
    .limit(40);
  if (error) return [];
  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => String((row as { indent_id?: string | null }).indent_id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export async function listIndentHubActivityPage(
  orgId: string,
  opts: {
    offset: number;
    limit: number;
    search?: string;
    indentId?: string | null;
  },
): Promise<{ error: Error | null; indents: IndentRow[]; hasMore: boolean }> {
  if (!orgId) return { error: null, indents: [], hasMore: false };
  const from = Math.max(0, opts.offset);
  const limit = Math.max(1, opts.limit);
  const search = sanitizeActivitySearch(opts.search ?? "");
  const indentId = String(opts.indentId ?? "").trim();
  let query = supabase()
    .from("indents")
    .select(ACTIVITY_SELECT)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (indentId) {
    query = query.eq("id", indentId);
  } else if (search) {
    const tripIndentIds = await indentIdsMatchingTripSearch(orgId, search);
    const filters = [
      `client_name.ilike.%${search}%`,
      `indent_number.ilike.%${search}%`,
      `indent_code.ilike.%${search}%`,
      `indent_operational_code.ilike.%${search}%`,
      `display_indent_id.ilike.%${search}%`,
    ];
    if (tripIndentIds.length > 0) {
      filters.push(`id.in.(${tripIndentIds.join(",")})`);
    }
    query = query.or(filters.join(","));
  }

  const { data, error } = await query.range(from, from + limit - 1);
  if (error) return { error: new Error(error.message), indents: [], hasMore: false };
  const rows = ((data ?? []) as unknown as IndentRow[]).map((row) =>
    normalizeIndentRow(row),
  );
  return { error: null, indents: rows, hasMore: rows.length === limit };
}
