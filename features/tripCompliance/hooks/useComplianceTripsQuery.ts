/**
 * Compliance queue — same trip source as `/trips` (`useTripsQuery` → getTripsForOrg),
 * then:
 *  1. Filter Loading → Completed pipeline
 *  2. Cache per-trip INPUTS for the full pipeline under one stable key
 *     (`tripCompliance.pipeline(orgId)`); summaries derive via `select`
 *  3. Writes patch only the inputs they changed (`useComplianceChangeSync`);
 *     trips-catalog updates reconcile instead of re-keying / rebuilding
 *  4. Paginate only the visible list (UI), not the totals query
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  changedTripIds,
  complianceChangeTripId,
  createComplianceWriteLog,
  loadCompliancePipelineInputs,
  patchForComplianceChange,
  patchForPipelineTrips,
  preserveNewerWrites,
  recordComplianceWrites,
  tripsWrittenSince,
  type ComplianceChange,
  type ComplianceWriteLog,
} from "@/features/tripCompliance/services/compliancePipelineSync.service";
import {
  buildComplianceTripSummaries,
  summarizeComplianceTrip,
  tripAppearsInAwaitingPod,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import type {
  ComplianceStage,
  ComplianceTripInputs,
  ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { ensureComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import { selectCompliancePipelineTrips } from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import { isCompliancePaymentPending, isComplianceVerifiedQueue } from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
  isFinanceDeclinedForCompliancePending,
  isFinanceDeclinedForPendingDocs,
  isFinanceDeclinedTrip,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type { ComplianceChange } from "@/features/tripCompliance/services/compliancePipelineSync.service";

/** Cards/table page size — totals always use the full pipeline. */
export const COMPLIANCE_QUEUE_PAGE_SIZE = 30;

function withChecklist(summary: ComplianceTripSummary): ComplianceTripSummary {
  const next: ComplianceTripSummary = {
    ...summary,
    vehicleDocuments: summary.vehicleDocuments ?? [],
    driverDocuments: summary.driverDocuments ?? [],
  };
  const checklist = ensureComplianceChecklist(next);
  return next.checklist === checklist ? next : { ...next, checklist };
}

/** Untouched inputs keep the same summary object across patches. */
const summaryByInputs = new WeakMap<ComplianceTripInputs, ComplianceTripSummary>();
function summaryFor(inputs: ComplianceTripInputs): ComplianceTripSummary {
  let summary = summaryByInputs.get(inputs);
  if (!summary) {
    summary = withChecklist(summarizeComplianceTrip(inputs));
    summaryByInputs.set(inputs, summary);
  }
  return summary;
}
function selectSummaries(rows: ComplianceTripInputs[]): ComplianceTripSummary[] {
  return rows.map(summaryFor);
}

/**
 * `org:user` pairs whose pipeline had a full batched read in this JS session.
 * A persisted (hydrated) cache is shown immediately but the first mount still
 * runs one full read; after that, refetches are incremental. Keyed by user too,
 * because logout does not clear the query cache and a different user of the
 * same org must not inherit the previous user's incremental state.
 */
const fullyLoadedSessions = new Set<string>();

/** Per-org write log guarding local writes against older in-flight reads. */
const writeLogs = new Map<string, ComplianceWriteLog>();
function writeLogFor(orgId: string): ComplianceWriteLog {
  let log = writeLogs.get(orgId);
  if (!log) {
    log = createComplianceWriteLog();
    writeLogs.set(orgId, log);
  }
  return log;
}

/** Rows the trips-list reconcile rebuilt (trip-row swap / fresh inputs) — not "newer writes". */
const reconciledRows = new WeakSet<ComplianceTripInputs>();

/**
 * Trips whose CURRENT row must win over a read that started at `startedAt`
 * from `snapshot`:
 *   - every trip this hook's write log recorded since the read began, and
 *   - every trip whose row object changed since the snapshot by a writer that
 *     does not use the write log (e.g. `lib/queries` hard-copy POD cache patch),
 *     excluding rows the reconcile merely rebuilt from the trips list.
 * Rows are never mutated in place, so a changed object means a newer write.
 */
function protectedTripIds(
  log: ComplianceWriteLog,
  startedAt: number,
  snapshot: ComplianceTripInputs[] | undefined,
  current: ComplianceTripInputs[] | undefined,
): Set<string> {
  const ids = tripsWrittenSince(log, startedAt);
  if (!snapshot || !current || snapshot === current) return ids;
  const before = new Map(snapshot.map((row) => [row.trip.id, row]));
  for (const row of current) {
    const prev = before.get(row.trip.id);
    if (prev && prev !== row && !reconciledRows.has(row)) ids.add(row.trip.id);
  }
  return ids;
}

function useComplianceOrgId(): string {
  const orgCtx = useOptionalOrganization();
  return orgCtx?.currentOrganization?.id ?? "";
}

export type ComplianceStageCounts = Record<ComplianceStage | "all", number>;

export type ComplianceQueueResult = {
  /** Full pipeline summaries — source of truth for stage totals. */
  summaries: ComplianceTripSummary[];
  /** Current page slice after stage + search filtering (set by screen). */
  pipelineTripCount: number;
  tripsLoading: boolean;
  summariesLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
};

/**
 * Loads the same trip catalog as Trip Operations, filters to Loading→Completed,
 * then keeps batched compliance inputs for **all** matching trips so chip
 * counts are global — not page-scoped.
 */
export function useComplianceTripsQuery(_page = 0): ComplianceQueueResult & {
  data: { summaries: ComplianceTripSummary[]; hasMore: boolean } | undefined;
  isLoading: boolean;
} {
  const orgId = useComplianceOrgId();
  const { user } = useAuth();
  const sessionKey = `${orgId}:${user?.uid ?? ""}`;
  const qc = useQueryClient();
  const tripsQuery = useTripsQuery(orgId || null);

  const pipelineTrips = useMemo(
    () => selectCompliancePipelineTrips(tripsQuery.data ?? []),
    [tripsQuery.data],
  );
  const pipelineTripsRef = useRef<TripRow[]>(pipelineTrips);
  pipelineTripsRef.current = pipelineTrips;
  const fullRefreshRef = useRef(false);
  const pipelineKey = queryKeys.tripCompliance.pipeline(orgId);

  const summariesQuery = useQuery({
    queryKey: pipelineKey,
    queryFn: async (): Promise<ComplianceTripInputs[]> => {
      const full = fullRefreshRef.current || !fullyLoadedSessions.has(sessionKey);
      fullRefreshRef.current = false;
      const log = writeLogFor(orgId);
      const startedAt = log.generation;
      const previous = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
      const rows = await loadCompliancePipelineInputs(previous, pipelineTripsRef.current, { full, viewerOrgId: orgId });
      if (full) fullyLoadedSessions.add(sessionKey);
      // A write that landed while this read was in flight wins over its snapshot.
      const current = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
      return preserveNewerWrites(rows, current, protectedTripIds(log, startedAt, previous, current));
    },
    enabled: !!orgId && tripsQuery.isSuccess,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    select: selectSummaries,
  });

  // Trips catalog changed (focus refetch, realtime, a patched row): reconcile
  // into the cached inputs — never re-key, never rebuild every summary.
  useEffect(() => {
    if (!orgId || !tripsQuery.data) return;
    const current = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
    if (!current) return;
    let cancelled = false;
    const log = writeLogFor(orgId);
    const startedAt = log.generation;
    void patchForPipelineTrips(current, pipelineTrips, orgId)
      .then((patch) => {
        if (cancelled) return;
        let before: ComplianceTripInputs[] | undefined;
        qc.setQueryData<ComplianceTripInputs[]>(pipelineKey, (cur) => {
          before = cur;
          return cur ? preserveNewerWrites(patch(cur), cur, protectedTripIds(log, startedAt, current, cur)) : cur;
        });
        // Mark what the cache actually stored (structural sharing may copy rows).
        const stored = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
        if (before && stored && stored !== before) {
          const prior = new Set(before);
          for (const row of stored) if (!prior.has(row)) reconciledRows.add(row);
        }
      })
      .catch(() => {
        // Next pipeline refetch will reconcile.
      });
    return () => {
      cancelled = true;
    };
    // pipelineKey is derived from orgId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, qc, pipelineTrips]);

  const summaries = summariesQuery.data ?? [];
  const isLoading =
    (tripsQuery.isPending && !tripsQuery.data) ||
    (summariesQuery.isPending && tripsQuery.isSuccess && !summariesQuery.data);
  const isFetching = tripsQuery.isFetching || summariesQuery.isFetching;
  const isError = tripsQuery.isError || summariesQuery.isError;
  const error = (tripsQuery.error ?? summariesQuery.error) as Error | null;

  const refetch = () => {
    fullRefreshRef.current = true;
    void tripsQuery.refetch();
    void summariesQuery.refetch();
  };

  return {
    data: {
      summaries,
      // hasMore is unused for network paging — UI paginates client-side.
      hasMore: false,
    },
    summaries,
    pipelineTripCount: pipelineTrips.length,
    tripsLoading: tripsQuery.isPending && !tripsQuery.data,
    summariesLoading: summariesQuery.isPending && !summariesQuery.data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  };
}

export type ComplianceQueueFilter = ComplianceStage | "all" | "pod_received";

/** Hard copy is in, and the charge form has not been saved yet. */
export function tripStillInPodReceived(summary: ComplianceTripSummary): boolean {
  return Boolean(summary.hardCopyPod?.received) && summary.hardCopyPod?.chargesSaved !== true;
}

/** Saved charges belong on Balance Pending, including trips already derived there. */
export function tripAppearsInBalancePending(summary: ComplianceTripSummary): boolean {
  if (summary.stage === "payment_settled") return false;
  if (summary.hardCopyPod?.chargesSaved === true) return true;
  return summary.stage === "balance_pending";
}

export function useComplianceStageFilter(summaries: ComplianceTripSummary[] | undefined) {
  const [stage, setStage] = useState<ComplianceQueueFilter>("all");
  const filtered = useMemo(() => {
    if (!summaries) return [];
    if (stage === "all") return summaries;
    if (stage === "pod_received") return summaries.filter(tripStillInPodReceived);
    if (stage === "balance_pending") {
      return summaries.filter(
        (s) => tripAppearsInBalancePending(s) || s.stage === "payment_settled",
      );
    }
    if (stage === "compliance_verified") {
      // Advance still owed stays on Verified. Payment Pending is not its own chip.
      return summaries.filter(
        (s) => isComplianceVerifiedQueue(s) || isFinanceDeclinedTrip(s) || isCompliancePaymentPending(s),
      );
    }
    if (stage === "hard_copy_pod_received") {
      return summaries.filter(
        (s) => tripAppearsInAwaitingPod(s) || tripStillInPodReceived(s),
      );
    }
    // Verified Reject keeps stage=compliance_verified but also lists under Verified All.
    if (stage === "pending_for_docs") {
      return summaries.filter(
        (s) => s.stage === "pending_for_docs" || isFinanceDeclinedForPendingDocs(s),
      );
    }
    if (stage === "compliance_pending") {
      return summaries.filter(
        (s) => s.stage === "compliance_pending" || isFinanceDeclinedForCompliancePending(s),
      );
    }
    return summaries.filter((s) => s.stage === stage);
  }, [summaries, stage]);

  const counts = useMemo((): ComplianceStageCounts => {
    const next: ComplianceStageCounts = {
      all: summaries?.length ?? 0,
      pending_for_docs: 0,
      compliance_pending: 0,
      compliance_verified: 0,
      advance_payment_processed: 0,
      hard_copy_pod_received: 0,
      balance_pending: 0,
      payment_settled: 0,
    };
    for (const summary of summaries ?? []) {
      // Post-verify Reject leaves Verified and counts on Pending Docs / Compliance Pending.
      if (summary.stage === "compliance_verified" && !isComplianceVerifiedQueue(summary)) {
        if (isFinanceDeclinedForPendingDocs(summary)) next.pending_for_docs += 1;
        else if (isFinanceDeclinedForCompliancePending(summary)) next.compliance_pending += 1;
        if (isFinanceDeclinedTrip(summary)) next.compliance_verified += 1;
      } else if (summary.stage in next) {
        next[summary.stage] += 1;
      }
      if (summary.stage !== "compliance_verified" && isComplianceVerifiedQueue(summary)) {
        next.compliance_verified += 1;
      } else if (
        isCompliancePaymentPending(summary) &&
        summary.stage !== "compliance_verified" &&
        !isComplianceVerifiedQueue(summary)
      ) {
        next.compliance_verified += 1;
      }
      if (
        summary.stage !== "hard_copy_pod_received" &&
        (tripAppearsInAwaitingPod(summary) || tripStillInPodReceived(summary))
      ) {
        next.hard_copy_pod_received += 1;
      }
      if (summary.stage !== "balance_pending" && tripAppearsInBalancePending(summary)) {
        next.balance_pending += 1;
      }
    }
    return next;
  }, [summaries]);

  const podReceivedCount = useMemo(
    () => (summaries ?? []).filter(tripStillInPodReceived).length,
    [summaries],
  );

  const declinedCount = useMemo(
    () => (summaries ?? []).filter(isFinanceDeclinedTrip).length,
    [summaries],
  );

  return {
    stage,
    setStage,
    filtered,
    counts,
    podReceivedCount,
    declinedCount,
  };
}

/** Client-side page over an already-filtered summary list. */
export function useComplianceListPagination<T>(
  items: T[],
  opts?: { pageSize?: number; resetKey?: string | number },
) {
  const pageSize = opts?.pageSize ?? COMPLIANCE_QUEUE_PAGE_SIZE;
  const resetKey = opts?.resetKey ?? "";
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize) || 1);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    pageCount,
    pageItems,
    total: items.length,
    hasPrev: page > 0,
    hasNext: page < pageCount - 1,
  };
}

/**
 * Broad refresh (Compliance details screen). The pipeline refetch is
 * incremental — see `loadCompliancePipelineInputs`.
 */
export function useInvalidateComplianceTrips() {
  const orgId = useComplianceOrgId();
  const qc = useQueryClient();
  return (tripId?: string) => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: queryKeys.tripCompliance.pipeline(orgId) });
    void qc.invalidateQueries({ queryKey: queryKeys.trips.finite(orgId) });
    if (tripId) {
      void qc.invalidateQueries({ queryKey: queryKeys.tripCompliance.detail(orgId, tripId) });
    } else {
      void qc.invalidateQueries({ queryKey: ["q", "tripCompliance", "detail", "v1", orgId] });
    }
  };
}

/**
 * Apply one Compliance write to the cached pipeline with the minimum reads
 * (see `patchForComplianceChange`). Payments also patch the trips catalog row
 * (`amount_paid`) in place so other screens stay consistent without a
 * `get_trips_for_org` refetch.
 */
export function useComplianceChangeSync() {
  const orgId = useComplianceOrgId();
  const qc = useQueryClient();
  return useCallback(
    async (change: ComplianceChange) => {
      if (!orgId) return;
      const key = queryKeys.tripCompliance.pipeline(orgId);
      const current = qc.getQueryData<ComplianceTripInputs[]>(key);
      const tripId = complianceChangeTripId(change);
      if (tripId) void qc.invalidateQueries({ queryKey: queryKeys.tripCompliance.detail(orgId, tripId) });
      if (!current) {
        void qc.invalidateQueries({ queryKey: key });
        return;
      }
      try {
        const log = writeLogFor(orgId);
        const startedAt = log.generation;
        const patch = await patchForComplianceChange(current, change, orgId);
        let patchedTrip: TripRow | null = null;
        qc.setQueryData<ComplianceTripInputs[]>(key, (cur) => {
          if (!cur) return cur;
          // If another write touched these trips while this change was reading, keep that write.
          const next = preserveNewerWrites(patch(cur), cur, protectedTripIds(log, startedAt, current, cur));
          recordComplianceWrites(log, changedTripIds(cur, next));
          if (change.type === "payment") patchedTrip = next.find((row) => row.trip.id === change.tripId)?.trip ?? null;
          return next;
        });
        if (patchedTrip) {
          const trip: TripRow = patchedTrip;
          qc.setQueriesData<TripRow[]>({ queryKey: queryKeys.trips.finite(orgId) }, (rows) =>
            rows?.map((row) =>
              row.id === trip.id ? { ...row, amount_paid: trip.amount_paid, updated_at: trip.updated_at } : row,
            ),
          );
        }
        // Payment / verify / decline also move Finance Hub + Ledger — bust their caches.
        if (
          change.type === "payment" ||
          change.type === "complianceVerified" ||
          change.type === "complianceDeclined"
        ) {
          const { syncFinanceComplianceCaches } = await import(
            "@/lib/queries/syncFinanceComplianceCaches"
          );
          syncFinanceComplianceCaches({
            queryClient: qc,
            organizationId: orgId,
            tripId,
            includeCompliance: false, // pipeline already patched above
          });
          void qc.invalidateQueries({ queryKey: ["q", "tripCompliance", "advanceProcessed"] });
        }
      } catch {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    [orgId, qc],
  );
}

export function useComplianceTripQuery(tripId: string | undefined) {
  const orgId = useComplianceOrgId();

  return useQuery({
    queryKey: queryKeys.tripCompliance.detail(orgId, tripId ?? ""),
    queryFn: async (): Promise<ComplianceTripSummary | null> => {
      if (!orgId || !tripId) return null;
      const { error, trip } = await getTripById(tripId);
      if (error) throw error;
      if (!trip || trip.organization_id !== orgId) return null;
      const summaries = await buildComplianceTripSummaries([trip], orgId);
      return summaries[0] ?? null;
    },
    enabled: !!orgId && !!tripId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    select: (summary) => (summary ? withChecklist(summary) : null),
  });
}
