import { supabase } from "@/lib/supabase";

export type DriverTripExpenseKind = "fuel" | "toll" | "other";

export type DriverTripExpenseRow = {
  id: string;
  tripId: string;
  kind: DriverTripExpenseKind;
  label: string;
  amount: number;
  enteredAt: string;
};

const CHUNK = 80;

function chunkIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
  return out;
}

function money(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function otherLabel(category: string | null | undefined, description: string | null | undefined): string {
  const desc = String(description ?? "").trim();
  if (desc) return desc;
  const cat = String(category ?? "").trim();
  if (!cat) return "Expense";
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
}

/** Active fuel / toll / other expenses for the driver's trips. */
export async function listDriverTripExpensesByTripIds(
  tripIds: string[],
): Promise<{ error: Error | null; entries: DriverTripExpenseRow[] }> {
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { error: null, entries: [] };

  const entries: DriverTripExpenseRow[] = [];
  try {
    for (const batch of chunkIds(ids)) {
      const [fuel, toll, other] = await Promise.all([
        supabase()
          .from("trip_fuel_entries")
          .select("id, trip_id, amount_inr, fuel_type, entered_at, status")
          .in("trip_id", batch)
          .eq("status", "active"),
        supabase()
          .from("trip_toll_entries")
          .select("id, trip_id, amount_inr, plaza_name, entered_at, status")
          .in("trip_id", batch)
          .eq("status", "active"),
        supabase()
          .from("trip_other_expenses")
          .select("id, trip_id, amount_inr, expense_category, description, entered_at, status")
          .in("trip_id", batch)
          .eq("status", "active"),
      ]);
      const firstError = fuel.error ?? toll.error ?? other.error;
      if (firstError) return { error: new Error(firstError.message), entries: [] };

      for (const row of fuel.data ?? []) {
        const r = row as {
          id: string;
          trip_id: string;
          amount_inr: number;
          fuel_type?: string | null;
          entered_at: string;
        };
        entries.push({
          id: r.id,
          tripId: r.trip_id,
          kind: "fuel",
          label: r.fuel_type ? `Fuel · ${r.fuel_type}` : "Fuel",
          amount: money(r.amount_inr),
          enteredAt: r.entered_at,
        });
      }
      for (const row of toll.data ?? []) {
        const r = row as {
          id: string;
          trip_id: string;
          amount_inr: number;
          plaza_name?: string | null;
          entered_at: string;
        };
        entries.push({
          id: r.id,
          tripId: r.trip_id,
          kind: "toll",
          label: r.plaza_name ? `Toll · ${r.plaza_name}` : "Toll",
          amount: money(r.amount_inr),
          enteredAt: r.entered_at,
        });
      }
      for (const row of other.data ?? []) {
        const r = row as {
          id: string;
          trip_id: string;
          amount_inr: number;
          expense_category?: string | null;
          description?: string | null;
          entered_at: string;
        };
        entries.push({
          id: r.id,
          tripId: r.trip_id,
          kind: "other",
          label: otherLabel(r.expense_category, r.description),
          amount: money(r.amount_inr),
          enteredAt: r.entered_at,
        });
      }
    }
    return { error: null, entries };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), entries: [] };
  }
}
