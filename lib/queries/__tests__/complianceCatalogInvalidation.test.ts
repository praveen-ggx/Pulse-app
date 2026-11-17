import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

describe("compliance trip catalog invalidation", () => {
  it("does not rerun the compliance catalog when the hub trip list is invalidated", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let complianceReads = 0;
    let finiteReads = 0;
    await qc.prefetchQuery({
      queryKey: queryKeys.trips.compliance("org-a"),
      queryFn: async () => {
        complianceReads += 1;
        return [{ id: "t1" }];
      },
    });
    await qc.prefetchQuery({
      queryKey: queryKeys.trips.finite("org-a"),
      queryFn: async () => {
        finiteReads += 1;
        return [{ id: "t1" }];
      },
    });

    await qc.invalidateQueries({
      queryKey: queryKeys.trips.all("org-a"),
      refetchType: "all",
    });

    expect(complianceReads).toBe(1);
    expect(finiteReads).toBe(2);
    expect(qc.getQueryData(queryKeys.trips.compliance("org-a"))).toEqual([{ id: "t1" }]);
  });

  it("still refetches the compliance catalog when that key is invalidated, and not another org", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads = new Map<string, number>();
    const read = (orgId: string) => async () => {
      reads.set(orgId, (reads.get(orgId) ?? 0) + 1);
      return [{ id: orgId }];
    };
    await qc.prefetchQuery({ queryKey: queryKeys.trips.compliance("org-a"), queryFn: read("org-a") });
    await qc.prefetchQuery({ queryKey: queryKeys.trips.compliance("org-b"), queryFn: read("org-b") });

    await qc.invalidateQueries({
      queryKey: queryKeys.trips.compliance("org-a"),
      refetchType: "all",
    });

    expect(reads.get("org-a")).toBe(2);
    expect(reads.get("org-b")).toBe(1);
    expect(qc.getQueryData(queryKeys.trips.compliance("org-b"))).toEqual([{ id: "org-b" }]);
  });
});
