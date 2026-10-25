/**
 * One quote for a whole Network pool (one canonical lane, any number of
 * shippers). The server manifest (get_org_network_pool) defines the pool and
 * which members this organization may quote; the rate is written with
 * submit_network_quote once per quotable member, sequentially. Each indent's
 * shipper reviews, counters and awards only the quote on its own indent.
 */
import { IndentBidAmountEntry } from "@/features/indents/components/bidding/IndentBidAmountEntry";
import type { IndentRow } from "@/features/indents";
import { PoolBidCommitSheet } from "@/features/network/components/bidding/PoolBidCommitSheet";
import { loadMtLabel } from "@/features/network/components/pooled/NetworkLoadPoolCard";
import {
  getOrgNetworkPool,
  submitNetworkPoolQuote,
  submitNetworkQuote,
  withdrawNetworkQuotes,
  type NetworkPoolManifest,
} from "@/features/network/services/networkPools.service";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import {
  clampPoolVehicleCommit,
  endOfLocalDayIso,
} from "@/features/network/utils/networkPoolBidCommit.util";
import {
  forgetPoolCommitPreview,
  rememberPoolCommitPreview,
} from "@/features/network/utils/networkPoolCommitPreview.util";
import {
  existingNetworkPoolQuoteAmount,
  type NetworkBidPool,
} from "@/features/network/utils/networkBidPools.util";
import {
  poolQuoteFailureLines,
  type NetworkLoadPool,
} from "@/features/network/utils/networkLoadPools.util";
import { runPoolBidSubmission } from "@/features/network/utils/pooledOpportunity.util";
import { useInvalidateIndents } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

export const NETWORK_POOL_TOO_LARGE_MESSAGE =
  "This pool contains more loads than Network can currently process. Nothing was submitted.";
export const NETWORK_POOL_CHANGED_MESSAGE =
  "This pool changed while you were quoting. Nothing was submitted — review the updated pool and submit again.";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function readManifest(
  orgId: string,
  pool: NetworkLoadPool<IndentRow>,
): Promise<NetworkPoolManifest> {
  const { error, pool: manifest } = await getOrgNetworkPool(orgId, pool.key);
  if (error) throw error;
  if (!manifest) throw new Error("Pool not found.");
  return manifest;
}

function cardQuoteAmount(
  pool: NetworkLoadPool<IndentRow> | null,
): number | null {
  if (!pool || !("rateMin" in pool)) return null;
  return existingNetworkPoolQuoteAmount([
    (pool as NetworkBidPool<IndentRow>).rateMin,
  ]);
}

function manifestQuoteAmount(shown: NetworkPoolManifest | null): number | null {
  if (!shown) return null;
  return existingNetworkPoolQuoteAmount(
    shown.org_quotes
      .filter((quote) => {
        const status = (quote.status ?? "").trim().toLowerCase();
        return quote.quotable || status === "pending";
      })
      .map((quote) => quote.amount),
  );
}

export function NetworkPoolQuoteModal({
  pool,
  orgId,
  onClose,
  onSuccess,
  queryClient,
  invalidateIndents,
  refetchMyQuotes,
  refetchMarketIndents,
}: {
  pool: NetworkLoadPool<IndentRow> | null;
  orgId: string | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  refetchMyQuotes: () => void;
  refetchMarketIndents: () => void;
}) {
  const [entryError, setEntryError] = useState<string | undefined>();
  const [succeededCount, setSucceededCount] = useState(0);
  const [draftAmount, setDraftAmount] = useState<number | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitSubmitting, setCommitSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | undefined>();
  const [fleetCount, setFleetCount] = useState<number | null>(null);

  const manifestKey = queryKeys.networkPools.manifest(orgId ?? "", pool?.id ?? "");
  const manifestQ = useQuery({
    queryKey: manifestKey,
    queryFn: () => readManifest(orgId as string, pool as NetworkLoadPool<IndentRow>),
    enabled: !!orgId && !!pool,
    staleTime: 0,
  });
  const shown = manifestQ.data ?? null;

  const handleClose = useCallback(() => {
    setEntryError(undefined);
    setCommitOpen(false);
    setDraftAmount(null);
    setCommitError(undefined);
    onClose();
  }, [onClose]);

  const fleetQ = useQuery({
    queryKey: ["network-pool-fleet-count", orgId ?? ""],
    queryFn: async () => {
      const { vehicles } = await getVehiclesByOrganization(orgId as string);
      return vehicles.filter((v) => (v.status || "").toLowerCase() !== "inactive").length;
    },
    enabled: !!orgId && !!pool,
    staleTime: 60_000,
  });

  const submitPoolQuote = useCallback(
    async (
      amount: number,
      commit?: { vehicleLimit: number; validUntilIso: string },
    ): Promise<boolean> => {
      if (!orgId || !pool) return false;
      if (!shown) {
        setEntryError("This pool is still being prepared. Try again in a moment.");
        return false;
      }
      let fresh: NetworkPoolManifest;
      try {
        fresh = await readManifest(orgId, pool);
      } catch {
        setEntryError("Couldn't load this pool. Nothing was submitted — try again.");
        return false;
      }
      queryClient.setQueryData(manifestKey, fresh);
      if (!fresh.complete) {
        setEntryError(NETWORK_POOL_TOO_LARGE_MESSAGE);
        return false;
      }
      if (fresh.fingerprint !== shown.fingerprint) {
        setEntryError(NETWORK_POOL_CHANGED_MESSAGE);
        return false;
      }

      if (commit) {
        const rpc = await submitNetworkPoolQuote(orgId, pool.key, amount, commit);
        if (!rpc.error && rpc.result) {
          invalidateIndents(orgId);
          await Promise.allSettled([
            queryClient.invalidateQueries({
              queryKey: [...queryKeys.indents.finite(orgId), "my-direct-quotes"],
            }),
            queryClient.invalidateQueries({ queryKey: ["indents", "quote-counts"] }),
            queryClient.invalidateQueries({ queryKey: manifestKey }),
            queryClient.invalidateQueries({ queryKey: queryKeys.networkPools.lanes(orgId) }),
            refetchMyQuotes(),
            refetchMarketIndents(),
          ]);
          setSucceededCount(rpc.result.quoted);
          return rpc.result.failed === 0;
        }
        const rpcMsg = rpc.error?.message ?? "";
        const rpcMissing =
          /could not find the function|schema cache|submit_network_pool_quote|not found|pgrst202|404/i.test(
            rpcMsg,
          ) || rpcMsg.trim() === "";
        if (!rpcMissing) {
          setEntryError(rpcMsg || "Could not send this pool bid.");
          return false;
        }
      }

      const result = await runPoolBidSubmission({
        indentIds: fresh.quotable_ids,
        memberIds: new Set(fresh.members.map((m) => m.id)),
        submitOne: (indentId) => submitNetworkQuote(indentId, orgId, amount),
      });
      if (result.blocked) {
        setEntryError(result.blocked);
        return false;
      }
      if (result.succeeded.length > 0) {
        invalidateIndents(orgId);
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: [...queryKeys.indents.finite(orgId), "my-direct-quotes"],
          }),
          queryClient.invalidateQueries({ queryKey: ["indents", "quote-counts"] }),
          queryClient.invalidateQueries({ queryKey: manifestKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.networkPools.lanes(orgId) }),
          ...result.succeeded.map((id) =>
            queryClient.invalidateQueries({
              queryKey: ["indents", id, "direct-quotes"],
            }),
          ),
          refetchMyQuotes(),
          refetchMarketIndents(),
        ]);
      }
      if (result.failed.length > 0) {
        const reasons = poolQuoteFailureLines(result.failed).join(" ");
        setEntryError(
          result.succeeded.length > 0
            ? `Quoted ${result.succeeded.length} of ${plural(result.attempted, "load")}. ${reasons}`
            : result.attempted === 1
              ? `Not quoted. ${reasons}`
              : `Not quoted: none of the ${result.attempted} loads took your rate. ${reasons}`,
        );
        return false;
      }
      setSucceededCount(result.succeeded.length);
      return true;
    },
    [
      orgId,
      pool,
      shown,
      manifestKey,
      invalidateIndents,
      queryClient,
      refetchMyQuotes,
      refetchMarketIndents,
    ],
  );

  const withdrawPoolBid = useCallback(async (): Promise<boolean> => {
    if (!orgId || !pool) return false;
    const pendingIds = (shown?.org_quotes ?? [])
      .filter((quote) => (quote.status ?? "").trim().toLowerCase() === "pending")
      .map((quote) => quote.indent_id)
      .filter(Boolean);
    if (pendingIds.length === 0) {
      setEntryError("No pending bid to cancel.");
      return false;
    }
    const { error } = await withdrawNetworkQuotes(orgId, pendingIds);
    if (error) {
      setEntryError(error.message);
      return false;
    }
    forgetPoolCommitPreview(pool.id);
    invalidateIndents(orgId);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: manifestKey }),
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.indents.finite(orgId), "my-direct-quotes"],
      }),
      queryClient.invalidateQueries({ queryKey: ["indents", "quote-counts"] }),
      refetchMyQuotes(),
      refetchMarketIndents(),
    ]);
    return true;
  }, [
    orgId,
    pool,
    shown,
    manifestKey,
    invalidateIndents,
    queryClient,
    refetchMyQuotes,
    refetchMarketIndents,
  ]);

  const openCommit = useCallback((amount: number) => {
    setEntryError(undefined);
    setCommitError(undefined);
    setDraftAmount(amount);
    setCommitOpen(true);
    setFleetCount(fleetQ.data ?? null);
  }, [fleetQ.data]);

  if (!pool) return null;

  const initialAmount =
    manifestQuoteAmount(shown) ?? cardQuoteAmount(pool);
  const isUpdate = initialAmount != null;

  const count = shown?.complete ? shown.quotable_ids.length : null;
  const loadsLabel =
    count != null
      ? plural(count, "load")
      : shown && !shown.complete
        ? "too many loads"
        : "preparing";
  const target =
    pool.targetRateMin != null && pool.targetRateMin > 0
      ? pool.targetRateMin
      : undefined;
  const contextLine =
    count != null
      ? `Applies to all ${loadsLabel} in this pool`
      : shown && !shown.complete
        ? NETWORK_POOL_TOO_LARGE_MESSAGE
        : manifestQ.isError
          ? "Couldn't load this pool."
          : "Preparing pool…";

  return (
    <>
    <IndentBidAmountEntry
      visible={!commitOpen}
      onClose={handleClose}
      onSubmitAmount={submitPoolQuote}
      onContinueAfterReview={openCommit}
      onSuccessDone={() =>
        onSuccess(`Quote sent for ${plural(succeededCount, "load")}`)
      }
      indentDisplayNumber={`Pool · ${loadsLabel}`}
      origin={pool.key.pickup}
      destination={pool.key.drop}
      vehicleType={pool.key.vehicleType}
      weightLabel={loadMtLabel(pool.weightKgMin, pool.weightKgMax)}
      ownerName="Network pool"
      partyMark="pool"
      targetRateInr={target}
      initialAmount={initialAmount}
      isUpdate={isUpdate}
      contextLine={contextLine}
      submitLabel={isUpdate ? "Revise bid" : "Quote for pool"}
      confirmCopy={{
        scopeNote: `Your rate will be quoted on all ${loadsLabel} in this pool. Each shipper reviews, counters and awards its own load.`,
        successTitle: "Pool quoted",
        successSubtitle: `Your rate has been quoted on all ${plural(succeededCount, "load")}.`,
        withdrawScopeNote: `This removes your pending offers on all ${loadsLabel} in this pool. You can quote again if the loads are still open.`,
      }}
      onWithdraw={isUpdate ? withdrawPoolBid : undefined}
      onWithdrawSuccessDone={() => onSuccess("Bid cancelled")}
      validationError={entryError}
      onClearValidationError={() => setEntryError(undefined)}
      onInvalidAmount={() => setEntryError("Enter an amount greater than 0.")}
    />
    <PoolBidCommitSheet
      visible={commitOpen}
      onClose={() => {
        if (commitSubmitting) return;
        setCommitOpen(false);
        setDraftAmount(null);
      }}
      amount={draftAmount ?? 0}
      poolSize={count ?? pool.members.length}
      fleetVehicleCount={fleetCount ?? fleetQ.data ?? null}
      routeLabel={`${pool.key.pickup} → ${pool.key.drop}`}
      submitting={commitSubmitting}
      error={commitError}
      onSubmit={({ vehicleLimit, validUntilDate }) => {
        if (draftAmount == null) return;
        const validUntilIso = endOfLocalDayIso(validUntilDate);
        if (!validUntilIso) {
          setCommitError("Choose a valid-until date.");
          return;
        }
        const limit = clampPoolVehicleCommit(vehicleLimit);
        setCommitSubmitting(true);
        setCommitError(undefined);
        void submitPoolQuote(draftAmount, {
          vehicleLimit: limit,
          validUntilIso,
        }).then((ok) => {
          setCommitSubmitting(false);
          if (!ok) {
            setCommitError(entryError ?? "Could not send this pool bid.");
            return;
          }
          rememberPoolCommitPreview(pool.id, {
            vehicleLimit: limit,
            awardedCount: 0,
            validUntilDate,
          });
          setCommitOpen(false);
          onSuccess(
            `Quote sent · ${limit} vehicle${limit === 1 ? "" : "s"} committed until ${validUntilDate}`,
          );
          handleClose();
        });
      }}
    />
    </>
  );
}
