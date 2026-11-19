/**
 * Supplier display names for the Trip Report export.
 *
 * The export can include trips that are not loaded on the Trips screen, so the
 * screen's supplier lookups don't cover them. This loads names for any
 * supplier ids the screen doesn't already know.
 */
import { supabase } from "@/lib/supabase";

/** Returns `{ [supplierId lowercase]: name }`. Empty on error — export still runs. */
export async function fetchSupplierNamesByIds(ids: readonly string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const out: Record<string, string> = {};
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase()
      .from("suppliers")
      .select("id, name, company_name, contact_person")
      .in("id", unique.slice(i, i + CHUNK));
    if (error) continue;
    for (const row of (data ?? []) as Array<{
      id: string;
      name?: string | null;
      company_name?: string | null;
      contact_person?: string | null;
    }>) {
      const key = String(row.id ?? "").trim().toLowerCase();
      const label =
        String(row.name ?? "").trim() ||
        String(row.company_name ?? "").trim() ||
        String(row.contact_person ?? "").trim();
      if (key && label) out[key] = label;
    }
  }
  return out;
}
