import { useQuery } from "@tanstack/react-query";
import {
  countIndentWorkload,
  listIndentWorkload,
} from "@/features/indents/services/indentWorkload.service";
import { indentWorkloadBounds } from "@/features/indents/utils/indentWorkload.util";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Trips hub indent workload: exact counts plus the matching rows. Under the
 * `indents.all(orgId)` prefix, so existing indent / trip invalidations refresh it.
 */
export function useIndentWorkload(orgId: string | null, opts?: { listEnabled?: boolean }) {
  const bounds = indentWorkloadBounds();
  const today = bounds?.today ?? "";
  const enabled = Boolean(orgId && bounds);
  const counts = useQuery({
    queryKey: queryKeys.indents.workloadCounts(orgId ?? "", today),
    queryFn: async () => {
      const res = await countIndentWorkload(orgId!, bounds!);
      if (res.error || !res.counts) throw res.error ?? new Error("indent workload count unavailable");
      return res.counts;
    },
    enabled,
    staleTime: STALE.moderate,
  });
  const list = useQuery({
    queryKey: queryKeys.indents.workloadList(orgId ?? "", today),
    queryFn: async () => {
      const res = await listIndentWorkload(orgId!, bounds!);
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
