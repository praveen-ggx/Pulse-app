import { useQuery } from "@tanstack/react-query";
import {
  countIndentWorkload,
  listIndentWorkload,
} from "@/features/indents/services/indentWorkload.service";
import {
  indentWorkloadBounds,
  type IndentWorkloadRange,
} from "@/features/indents/utils/indentWorkload.util";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Trips hub indent workload: exact counts plus the matching rows. Under the
 * `indents.all(orgId)` prefix, so existing indent / trip invalidations refresh it.
 * `range` (hub date pill): "all" = every live indent, needs_trip still today−7;
 * dated = that IST window for both. null = current workload (live today+;
 * needs_trip today−7).
 */
export function useIndentWorkload(
  orgId: string | null,
  opts?: { listEnabled?: boolean; range?: IndentWorkloadRange | null },
) {
  const bounds = indentWorkloadBounds();
  const today = bounds?.today ?? "";
  const range = opts?.range ?? null;
  const rangeKey = range === "all" ? "all" : range ? `${range.from}..${range.to}` : "now";
  const enabled = Boolean(orgId && bounds);
  const counts = useQuery({
    queryKey: queryKeys.indents.workloadCounts(orgId ?? "", today, rangeKey),
    queryFn: async () => {
      const res = await countIndentWorkload(orgId!, bounds!, range);
      if (res.error || !res.counts) throw res.error ?? new Error("indent workload count unavailable");
      return res.counts;
    },
    enabled,
    staleTime: STALE.moderate,
  });
  const list = useQuery({
    queryKey: queryKeys.indents.workloadList(orgId ?? "", today, rangeKey),
    queryFn: async () => {
      const res = await listIndentWorkload(orgId!, bounds!, range);
      if (res.error) throw res.error;
      return { indents: res.indents, truncated: res.truncated };
    },
    enabled: enabled && opts?.listEnabled !== false,
    staleTime: STALE.moderate,
  });
  return {
    bounds,
    counts: counts.data ?? null,
    countsError: counts.isError,
    indents: list.data?.indents ?? null,
    listTruncated: list.data?.truncated ?? false,
    listError: list.isError,
  };
}
