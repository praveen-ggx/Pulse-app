import { supabase } from "@/lib/supabase";
import { chunkIds, mapChunksInFlight } from "@/features/network/utils/commercePlanIds.util";
import {
  groupPlanStopsToRouteSummaries,
  type ExecutionPlanRouteSummary,
  type PlanStopLocationRow,
} from "@/features/network/utils/executionPlanRouteSummary";
import { throwIfCancelled, withAbortSignal } from "@/lib/supabaseAbort.util";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

/** Stop columns only — nested `client_warehouses` embeds 57014 under load. */
export const EXECUTION_PLAN_STOP_SELECT =
  "execution_plan_id, stop_type, sequence, label, city, state, address_line, latitude, longitude";

/** Smaller than client-name chunks: stop rows fan out per plan. */
const PLAN_ID_CHUNK = 8;
const PLAN_FETCH_CONCURRENCY = 3;

export async function fetchExecutionPlanRouteSummaries(
  planIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, ExecutionPlanRouteSummary>> {
  if (!isCommerceDataQueryEnabled()) return {};
  const ids = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const parts = await mapChunksInFlight(
    chunkIds(ids, PLAN_ID_CHUNK),
    PLAN_FETCH_CONCURRENCY,
    async (chunk) => {
      throwIfCancelled(signal);
      const { data, error } = await withAbortSignal(
        supabase()
          .from("execution_plan_stops")
          .select(EXECUTION_PLAN_STOP_SELECT)
          .in("execution_plan_id", chunk)
          .order("sequence", { ascending: true }),
        signal,
      );
      throwIfCancelled(signal, error);
      if (error) {
        console.warn("[executionPlanStops] route summaries:", error.message);
        return [] as PlanStopLocationRow[];
      }
      return (data ?? []) as PlanStopLocationRow[];
    },
  );

  return groupPlanStopsToRouteSummaries(parts.flat());
}
