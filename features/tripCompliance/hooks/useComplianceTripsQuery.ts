/**
 * Compliance queue — `/trips`' catalog (getTripsForOrg) plus older trips still open in
 * the Compliance workflow (`useComplianceTripCatalogQuery`), then:
 *  1. Filter Loading → Completed pipeline
 *  2. Cache per-trip INPUTS for the full pipeline under one stable key
 *     (`tripCompliance.pipeline(orgId)`); summaries derive via `select`
 *  3. Writes patch only the inputs they changed (`useComplianceChangeSync`);
 *     trips-catalog updates reconcile instead of re-keying / rebuilding
 *  4. Paginate only the visible list (UI), not the totals query
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
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
import { invalidateComplianceTripActivity } from "@/features/tripCompliance/components/ComplianceTripActivityLog";
import { ensureComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import { reconcilePipelineTrips, upsertTripInputs } from "@/features/tripCompliance/utils/compliancePipelinePatch.util";
import { selectCompliancePipelineTrips } from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import { logger } from "@/lib/logger";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import {
  isCompliancePaymentPending,
  isComplianceVerifiedQueue,
  isFinanceVerifiedQueue,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
  isActiveFinanceReject,
  isFinanceDeclinedForPendingDocs,
  isFinanceDeclinedTrip,
  isComplianceHoldAwaitingResubmit,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { useComplianceTripCatalogQuery } from "@/lib/queries/useTripsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { patchTripInEveryCatalog } from "@/lib/queries/tripCatalogFreshness";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type { ComplianceChange } from "@/features/tripCompliance/services/compliancePipelineSync.service";

/** Cards/table page size — totals always use the full pipeline. */
export const COMPLIANCE_QUEUE_PAGE_SIZE = 30;
/** Inputs read before the list paints. The rest follow without hiding the cards. */
const COMPLIANCE_FIRST_PAINT_TRIPS = 40;

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

/** Stable empty list so memoised consumers do not re-run while nothing is loaded. */
const NO_SUMMARIES: ComplianceTripSummary[] = [];

/**
 * Folds freshly read inputs (tail / retry) into the cache. Upsert by trip id keeps
 * ids unique, follows the latest pipeline order and drops trips that left it.
 * Rows a newer local write touched stay as they are (write-log protection).
 * With no pipeline order (catalog not loaded) the cache is left untouched.
 */
function mergeLoadedInputs(
  qc: QueryClient,
  pipelineKey: readonly unknown[],
  rows: ComplianceTripInputs[],
  orderTripIds: string[],
  base: ComplianceTripInputs[] | undefined,
  guard: { log: ComplianceWriteLog; startedAt: number; snapshot: ComplianceTripInputs[] | undefined },
): void {
  if (orderTripIds.length === 0) return;
  qc.setQueryData<ComplianceTripInputs[]>(pipelineKey, (cur) =>
    preserveNewerWrites(
      upsertTripInputs(cur ?? base ?? [], rows, orderTripIds),
      cur,
      protectedTripIds(guard.log, guard.startedAt, guard.snapshot, cur),
    ),
  );
}

/**
 * Background inputs load for trips the head read did not cover (and trips a
 * catalog change added). "failed" means some trips may be missing from the
 * queue; it is set per org:user session so another session never inherits it.
 */
type InputsLoadState = { sessionKey: string; status: "loading" | "failed" } | null;

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
  /** Last SUCCESSFUL pipeline read (ms epoch); 0 before the first one. Failed refreshes leave it. */
  dataUpdatedAt: number;
  /** Manual full refresh; a call while one is in flight is ignored. */
  refetch: () => Promise<void>;
  /** Pipeline trips that have loaded inputs (the rest are not in `summaries`). */
  pipelineLoadedCount: number;
  /** Trips in the pipeline: loaded + still missing. */
  pipelineTotalCount: number;
  /** Some pipeline trips are not in `summaries`: counts, lists and exports cover a partial queue. */
  pipelineIncomplete: boolean;
  /** A background / reconcile read failed. Cleared by a successful retry or full read. */
  pipelineLoadFailed: boolean;
  /** Reads only the trips that still need inputs. A call while one is in flight is ignored. */
  retryTail: () => Promise<void>;
};

/**
 * Loads the same trip catalog as Trip Operations, filters to Loading→Completed,
 * then keeps batched compliance inputs for **all** matching trips so chip
 * counts are global — not page-scoped.
 */
export function useComplianceTripsQuery(_page = 0): ComplianceQueueResult & {
  data: { summaries: ComplianceTripSummary[]; hasMore: boolean } | undefined;
  isLoading: boolean;
  /** Head of the queue is on screen; the rest of the catalog is still loading. */
  pipelinePartial: boolean;
} {
  const orgId = useComplianceOrgId();
  const { user } = useAuth();
  const sessionKey = `${orgId}:${user?.uid ?? ""}`;
  const qc = useQueryClient();
  const tripsQuery = useComplianceTripCatalogQuery(orgId || null, { urgent: true });

  // Ground Ops and Sourcing also see Assigned trips (upload before loading;
  // Sourcing uploads the Memo only before the trip is in transit).
  const memberPlatformRole = useOptionalActiveWorkspace()?.memberPlatformRole;
  const includeAssigned = memberPlatformRole === "ground_ops" || memberPlatformRole === "sourcing";
  const pipelineTrips = useMemo(
    () => selectCompliancePipelineTrips(tripsQuery.data ?? [], { includeAssigned }),
    [tripsQuery.data, includeAssigned],
  );
  const pipelineTripsRef = useRef<TripRow[]>(pipelineTrips);
  pipelineTripsRef.current = pipelineTrips;
  const fullRefreshRef = useRef(false);
  const [loadState, setLoadState] = useState<InputsLoadState>(null);
  const loadStatus = loadState && loadState.sessionKey === sessionKey ? loadState.status : "idle";
  // A read is stale once a newer full read / retry started or the org:user session
  // changed. Stale reads never write the cache or the load state.
  const runIdRef = useRef(0);
  const sessionKeyRef = useRef(sessionKey);
  if (sessionKeyRef.current !== sessionKey) {
    sessionKeyRef.current = sessionKey;
    runIdRef.current += 1;
  }
  const retryingRef = useRef(false);
  const pipelineKey = queryKeys.tripCompliance.pipeline(orgId);

  const summariesQuery = useQuery({
    queryKey: pipelineKey,
    queryFn: async (): Promise<ComplianceTripInputs[]> => {
      const full = fullRefreshRef.current || !fullyLoadedSessions.has(sessionKey);
      fullRefreshRef.current = false;
      // A full read supersedes any tail / retry still running from before.
      const runId = full ? ++runIdRef.current : runIdRef.current;
      const log = writeLogFor(orgId);
      const startedAt = log.generation;
      const previous = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
      const tripsNow = pipelineTripsRef.current;
      const paintFirst = full && tripsNow.length > COMPLIANCE_FIRST_PAINT_TRIPS;
      const headTrips = paintFirst ? tripsNow.slice(0, COMPLIANCE_FIRST_PAINT_TRIPS) : tripsNow;
      const rowsHead = await loadCompliancePipelineInputs(
        paintFirst ? undefined : previous,
        headTrips,
        { full, viewerOrgId: orgId },
      );
      let rows = rowsHead;
      if (paintFirst) {
        // Finish this query on the first page. Awaiting the rest kept
        // isFetching true (header spinner up) for every remaining trip.
        const headCurrent = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
        const headPaint = preserveNewerWrites(
          rowsHead,
          headCurrent,
          protectedTripIds(log, startedAt, previous, headCurrent),
        );
        const tailTrips = tripsNow.slice(COMPLIANCE_FIRST_PAINT_TRIPS);
        const tailStartedAt = startedAt;
        const loadTail = () => {
          if (runIdRef.current !== runId) return;
          void loadCompliancePipelineInputs(undefined, tailTrips, {
            full: true,
            viewerOrgId: orgId,
          })
            .then((rowsTail) => {
              if (runIdRef.current !== runId) return;
              mergeLoadedInputs(
                qc,
                pipelineKey,
                rowsTail,
                pipelineTripsRef.current.map((trip) => trip.id),
                headPaint,
                { log, startedAt: tailStartedAt, snapshot: previous },
              );
              fullyLoadedSessions.add(sessionKey);
              setLoadState(null);
            })
            .catch((error: unknown) => {
              if (runIdRef.current !== runId) return;
              logger.warn("[compliance] background trip load failed", {
                orgId,
                trips: tailTrips.length,
                error: error instanceof Error ? error.message : String(error),
              });
              setLoadState({ sessionKey, status: "failed" });
            });
        };
        if (runIdRef.current === runId) setLoadState({ sessionKey, status: "loading" });
        const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback;
        if (idle) idle(loadTail, { timeout: 400 });
        else setTimeout(loadTail, 0);
        return headPaint;
      }
      if (full) fullyLoadedSessions.add(sessionKey);
      // Every trip this read needed is in `rows`: an earlier failed load no longer applies.
      if (runIdRef.current === runId) setLoadState(null);
      // A write that landed while this read was in flight wins over its snapshot.
      const current = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
      return preserveNewerWrites(rows, current, protectedTripIds(log, startedAt, previous, current));
    },
    enabled: !!orgId && tripsQuery.isSuccess,
    // Incremental refetches re-read documents, flags, events, and the ledger
    // only for trips whose settlement or assignment fields changed. A location
    // ping does not. Writes patch the cache, so 2 min is enough for the rest.
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
    // Focus used to re-read documents, flags, events and the ledger for every
    // pipeline trip. Writes and realtime patch the cache; the header refresh
    // still forces a read.
    refetchOnWindowFocus: false,
    select: selectSummaries,
  });

  // Trips catalog changed (focus refetch, realtime, a patched row): reconcile
  // into the cached inputs — never re-key, never rebuild every summary.
  // While the background load runs (or failed), trips still missing are not
  // fetched here: the load / retry owns them, so a catalog change cannot start
  // a second read of the same tail. The effect re-runs when the load settles.
  useEffect(() => {
    if (!orgId || !tripsQuery.data) return;
    const current = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
    if (!current) return;
    let cancelled = false;
    const log = writeLogFor(orgId);
    const startedAt = log.generation;
    const cachedIds = loadStatus === "idle" ? null : new Set(current.map((row) => row.trip.id));
    const scopedTrips = cachedIds ? pipelineTrips.filter((trip) => cachedIds.has(trip.id)) : pipelineTrips;
    void patchForPipelineTrips(current, scopedTrips, orgId)
      .then((patch) => {
        // Rows a newer read or write changed since `current` stay (protectedTripIds).
        if (cancelled || sessionKeyRef.current !== sessionKey) return;
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
      .catch((error: unknown) => {
        if (cancelled || sessionKeyRef.current !== sessionKey) return;
        logger.warn("[compliance] trip reconcile failed", {
          orgId,
          error: error instanceof Error ? error.message : String(error),
        });
        setLoadState({ sessionKey, status: "failed" });
      });
    return () => {
      cancelled = true;
    };
    // pipelineKey is derived from orgId; sessionKey from orgId + user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, qc, pipelineTrips, loadStatus]);

  // keepPreviousData shows the previous org's rows while a new org's pipeline loads.
  // Those rows are never this org's queue: no summaries, counts or exports from them.
  const ownRows = summariesQuery.isPlaceholderData ? undefined : summariesQuery.data;
  const summaries = ownRows ?? NO_SUMMARIES;
  const isLoading =
    (tripsQuery.isPending && !tripsQuery.data) ||
    ((summariesQuery.isPending || summariesQuery.isPlaceholderData) && tripsQuery.isSuccess && !ownRows);
  const isFetching = tripsQuery.isFetching || summariesQuery.isFetching;
  const isError = tripsQuery.isError || summariesQuery.isError;
  const error = (tripsQuery.error ?? summariesQuery.error) as Error | null;

  const refreshingRef = useRef<Promise<void> | null>(null);
  const refetch = useCallback((): Promise<void> => {
    if (refreshingRef.current) return refreshingRef.current;
    fullRefreshRef.current = true;
    const run = Promise.all([tripsQuery.refetch(), summariesQuery.refetch()]).then(
      () => undefined,
      () => undefined,
    );
    refreshingRef.current = run.finally(() => {
      refreshingRef.current = null;
    });
    return refreshingRef.current;
  }, [tripsQuery, summariesQuery]);

  // Completeness is derived from the data: a pipeline trip with no loaded inputs
  // is missing, whatever the reason (loading, failed read, catalog change).
  const pipelineLoadedCount = useMemo(() => {
    if (pipelineTrips.length === 0 || summaries.length === 0) return 0;
    const loaded = new Set(summaries.map((summary) => summary.trip.id));
    let count = 0;
    for (const trip of pipelineTrips) if (loaded.has(trip.id)) count += 1;
    return count;
  }, [pipelineTrips, summaries]);
  const pipelineTotalCount = pipelineTrips.length;
  const pipelineIncomplete = pipelineLoadedCount < pipelineTotalCount;

  // Reads only what genuinely needs inputs: trips with none (tail, or new since
  // the catalog changed) and trips whose vehicle/driver identity changed. Covers
  // both a failed background load and a failed reconcile.
  const retryTail = useCallback(async (): Promise<void> => {
    if (!orgId || retryingRef.current) return;
    const snapshot = qc.getQueryData<ComplianceTripInputs[]>(pipelineKey);
    const { needsInputs } = reconcilePipelineTrips(snapshot ?? [], pipelineTripsRef.current);
    if (needsInputs.length === 0) {
      setLoadState(null);
      return;
    }
    retryingRef.current = true;
    const runId = ++runIdRef.current;
    const log = writeLogFor(orgId);
    const startedAt = log.generation;
    setLoadState({ sessionKey, status: "loading" });
    try {
      const rows = await loadCompliancePipelineInputs(undefined, needsInputs, {
        full: true,
        viewerOrgId: orgId,
      });
      if (runIdRef.current !== runId) return;
      mergeLoadedInputs(
        qc,
        pipelineKey,
        rows,
        pipelineTripsRef.current.map((trip) => trip.id),
        snapshot,
        { log, startedAt, snapshot },
      );
      fullyLoadedSessions.add(sessionKey);
      setLoadState(null);
    } catch (error) {
      if (runIdRef.current !== runId) return;
      logger.warn("[compliance] retry of trip load failed", {
        orgId,
        trips: needsInputs.length,
        error: error instanceof Error ? error.message : String(error),
      });
      setLoadState({ sessionKey, status: "failed" });
    } finally {
      retryingRef.current = false;
    }
    // pipelineKey is derived from orgId; sessionKey from orgId + user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, qc, sessionKey]);

  return {
    data: {
      summaries,
      // hasMore is unused for network paging — UI paginates client-side.
      hasMore: false,
    },
    summaries,
    pipelineTripCount: pipelineTrips.length,
    tripsLoading: tripsQuery.isPending && !tripsQuery.data,
    summariesLoading: summariesQuery.isPending && !ownRows,
    pipelinePartial: pipelineIncomplete,
    pipelineLoadedCount,
    pipelineTotalCount,
    pipelineIncomplete,
    pipelineLoadFailed: loadStatus === "failed",
    retryTail,
    isLoading,
    isError,
    error,
    isFetching,
    dataUpdatedAt: summariesQuery.isPlaceholderData ? 0 : summariesQuery.dataUpdatedAt,
    refetch,
  };
}

export type ComplianceQueueFilter = ComplianceStage | "all" | "pod_received";

/** Hard copy is in, and the charge form has not been saved yet. */
export function tripStillInPodReceived(summary: ComplianceTripSummary): boolean {
  return (
    Boolean(summary.hardCopyPod?.received) &&
    summary.hardCopyPod?.chargesSaved !== true &&
    summary.hardCopyPod?.revalidateRequested !== true
  );
}

/** Settlement sent this trip back so Debit Control can rework POD charges. */
export function tripNeedsPodReverification(summary: ComplianceTripSummary): boolean {
  return (
    Boolean(summary.hardCopyPod?.received) &&
    summary.hardCopyPod?.revalidateRequested === true &&
    summary.hardCopyPod?.chargesSaved !== true
  );
}

/** Saved charges belong on Balance Pending, including trips already derived there. */
export function tripAppearsInBalancePending(summary: ComplianceTripSummary): boolean {
  if (summary.stage === "payment_settled" || summary.balance) return false;
  if (summary.hardCopyPod?.settlementReleased === true) return false;
  if (summary.hardCopyPod?.revalidateRequested === true) return false;
  if (summary.hardCopyPod?.chargesSaved === true) return true;
  return summary.stage === "balance_pending";
}

/** Final Settlement: exclusive settled stage, posted balance, or CN/DN release. */
export function tripAppearsInFinalSettlement(
  summary: Pick<ComplianceTripSummary, "stage" | "balance"> & {
    hardCopyPod?: { settlementReleased?: boolean };
  },
): boolean {
  return (
    summary.stage === "payment_settled" ||
    Boolean(summary.balance) ||
    summary.hardCopyPod?.settlementReleased === true
  );
}

/** Chip totals. Final Settlement is exclusive — do not add it again as an overlay. */
export function tallyComplianceStageCounts(
  summaries: ComplianceTripSummary[] | undefined,
): ComplianceStageCounts {
  const next: ComplianceStageCounts = {
    all: summaries?.length ?? 0,
    pending_for_docs: 0,
    compliance_pending: 0,
    compliance_verified: 0,
    finance_verified: 0,
    advance_payment_processed: 0,
    hard_copy_pod_received: 0,
    balance_pending: 0,
    payment_settled: 0,
  };
  for (const summary of summaries ?? []) {
    // Active rejects and holds are Ground Ops work; a resubmitted finance
    // reject is back with Finance. Each trip counts on one queue.
    if (isActiveFinanceReject(summary)) {
      next.pending_for_docs += 1;
    } else if (summary.stage === "compliance_pending" && isComplianceHoldAwaitingResubmit(summary)) {
      next.pending_for_docs += 1;
    } else if (tripAppearsInFinalSettlement(summary)) {
      next.payment_settled += 1;
    } else if (summary.stage in next) {
      next[summary.stage] += 1;
    }
    if (summary.stage !== "compliance_verified" && isComplianceVerifiedQueue(summary)) {
      next.compliance_verified += 1;
    } else if (
      !summary.financeVerifiedAt &&
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
  // Same rule as the Finance Verified list, so the chip count always matches it.
  next.finance_verified = (summaries ?? []).filter(isFinanceVerifiedQueue).length;
  // Awaiting POD also lists paid trips still running (their exclusive stage is Advance Processed).
  next.hard_copy_pod_received += next.advance_payment_processed;
  return next;
}

export function useComplianceStageFilter(summaries: ComplianceTripSummary[] | undefined) {
  const [stage, setStage] = useState<ComplianceQueueFilter>("all");
  const filtered = useMemo(() => {
    if (!summaries) return [];
    if (stage === "all") return summaries;
    if (stage === "pod_received") {
      return summaries.filter(
        (summary) => tripStillInPodReceived(summary) || tripNeedsPodReverification(summary),
      );
    }
    if (stage === "balance_pending") {
      // Settlement Verification. Settled trips have their own Final Settlement tab.
      return summaries.filter(tripAppearsInBalancePending);
    }
    if (stage === "payment_settled") {
      return summaries.filter(tripAppearsInFinalSettlement);
    }
    if (stage === "compliance_verified") {
      // Advance still owed stays on Verified. Payment Pending is not its own chip.
      // Once Finance verifies, the trip moves to Finance Verified.
      return summaries.filter(
        (s) =>
          !s.financeVerifiedAt &&
          (isComplianceVerifiedQueue(s) || isCompliancePaymentPending(s)),
      );
    }
    if (stage === "finance_verified") {
      return summaries.filter(isFinanceVerifiedQueue);
    }
    if (stage === "hard_copy_pod_received") {
      // Awaiting POD tab: also lists paid trips that are still running (Advance Processed).
      return summaries.filter(
        (s) =>
          tripAppearsInAwaitingPod(s) ||
          tripStillInPodReceived(s) ||
          s.stage === "advance_payment_processed",
      );
    }
    // Verified Reject keeps stage=compliance_verified but also lists under Verified All.
    if (stage === "pending_for_docs") {
      // Ground Ops work: missing files, holds and finance rejects until Resubmit.
      return summaries.filter(
        (s) =>
          s.stage === "pending_for_docs" ||
          isFinanceDeclinedForPendingDocs(s) ||
          isComplianceHoldAwaitingResubmit(s),
      );
    }
    if (stage === "compliance_pending") {
      // Compliance work: complete trips not waiting on Ground Ops. A resubmitted
      // finance reject goes straight back to Finance (Advance Verification).
      return summaries.filter(
        (s) => s.stage === "compliance_pending" && !isComplianceHoldAwaitingResubmit(s),
      );
    }
    return summaries.filter((s) => s.stage === stage);
  }, [summaries, stage]);

  const counts = useMemo(() => tallyComplianceStageCounts(summaries), [summaries]);

  const podReceivedCount = useMemo(
    () =>
      (summaries ?? []).filter(
        (summary) => tripStillInPodReceived(summary) || tripNeedsPodReverification(summary),
      ).length,
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
    void qc.invalidateQueries({ queryKey: queryKeys.trips.complete(orgId) });
    void qc.invalidateQueries({ queryKey: queryKeys.trips.compliance(orgId) });
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
      if (tripId) invalidateComplianceTripActivity(tripId);
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
          patchTripInEveryCatalog(qc, orgId, trip.id, (row: TripRow) =>
            row.id === trip.id
              ? { ...row, amount_paid: trip.amount_paid, updated_at: trip.updated_at }
              : row,
          );
        }
        // Payment / verify / decline also move Finance Hub + Ledger — bust their caches.
        if (
          change.type === "payment" ||
          change.type === "complianceVerified" ||
          change.type === "complianceDeclined"
        ) {
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
  const qc = useQueryClient();

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
    // The queue already built this summary. Paint it, then refresh in the background.
    placeholderData: () => {
      if (!orgId || !tripId) return undefined;
      const rows = qc.getQueryData<ComplianceTripInputs[]>(
        queryKeys.tripCompliance.pipeline(orgId),
      );
      const row = rows?.find((item) => item.trip.id === tripId);
      return row ? summaryFor(row) : undefined;
    },
    select: (summary) => (summary ? withChecklist(summary) : null),
  });
}
