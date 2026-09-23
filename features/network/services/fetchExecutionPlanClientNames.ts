import { uniqueClientNameFromCustomers } from "@/features/network/utils/indentCardAvatar.util";
import { chunkIds } from "@/features/network/utils/commercePlanIds.util";
import { supabase } from "@/lib/supabase";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

type ClientJoin = {
  id?: string | null;
  name?: string | null;
  legal_name?: string | null;
  trade_name?: string | null;
};

export type ExecutionPlanClientParty = {
  id: string;
  name: string;
};

function firstJoin(customer: ClientJoin | ClientJoin[] | null): ClientJoin | null {
  if (!customer) return null;
  return Array.isArray(customer) ? (customer[0] ?? null) : customer;
}

function nameFromJoin(customer: ClientJoin | null): string {
  return String(
    customer?.legal_name ?? customer?.trade_name ?? customer?.name ?? "",
  ).trim();
}

export function groupSalesOrdersToPlanClients(
  rows: Array<{
    execution_plan_id?: string | null;
    customer_id?: string | null;
    customer?: ClientJoin | ClientJoin[] | null;
  }>,
): Record<string, ExecutionPlanClientParty[]> {
  const byPlan = new Map<string, Map<string, ExecutionPlanClientParty>>();

  for (const row of rows) {
    const planId = String(row.execution_plan_id ?? "").trim();
    if (!planId) continue;
    const join = firstJoin(row.customer ?? null);
    const id = String(join?.id ?? row.customer_id ?? "").trim();
    const name = nameFromJoin(join);
    if (!id && !name) continue;
    const key = id || name.toLowerCase();
    const planMap = byPlan.get(planId) ?? new Map<string, ExecutionPlanClientParty>();
    if (!planMap.has(key)) {
      planMap.set(key, { id: id || key, name: name || "Client" });
    }
    byPlan.set(planId, planMap);
  }

  const out: Record<string, ExecutionPlanClientParty[]> = {};
  for (const [planId, parties] of byPlan) {
    out[planId] = [...parties.values()];
  }
  return out;
}

export async function fetchExecutionPlanClients(
  orgId: string,
  planIds: string[],
): Promise<Record<string, ExecutionPlanClientParty[]>> {
  if (!isCommerceDataQueryEnabled()) return {};
  const ids = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))];
  if (!orgId.trim() || ids.length === 0) return {};

  const chunks = await Promise.all(
    chunkIds(ids).map(async (chunk) => {
      const { data, error } = await supabase()
        .from("sales_orders")
        .select("execution_plan_id, customer_id")
        .eq("organization_id", orgId)
        .in("execution_plan_id", chunk)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  );

  return groupSalesOrdersToPlanClients(chunks.flat());
}

export async function fetchExecutionPlanClientNames(
  orgId: string,
  planIds: string[],
): Promise<Record<string, string>> {
  const byPlan = await fetchExecutionPlanClients(orgId, planIds);
  const out: Record<string, string> = {};
  for (const [planId, parties] of Object.entries(byPlan)) {
    const clientName = uniqueClientNameFromCustomers(parties.map((p) => p.name));
    if (clientName) out[planId] = clientName;
  }
  return out;
}
