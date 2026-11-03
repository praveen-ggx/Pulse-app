import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useClientsQuery, useCompleteTripsQuery } from "@/lib/queries";
import { useCustomerLedgerInputsQuery } from "@/lib/queries/useLedgerAggregationQuery";
import { useIssuedInvoicesQuery } from "@/lib/queries/useInvoicingExecuteQueries";
import { loadHubPodReceiptFlags } from "@/features/trips/services/tripDocumentLrPod.service";
import { STALE } from "@/lib/queryClient";
import { buildFinanceProModel } from "../model/buildFinanceProModel";
import { financeProTripCompleted, financeProTripPodReceived } from "../model/tripLens.util";

/**
 * Shared F1 data plane. Digital POD is loaded only for completed trips that
 * still lack a physical stamp — not a full-org trip_documents scan.
 */
export function useFinanceProModel() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const clientsQ = useClientsQuery(orgId);
  const ledgerQ = useCustomerLedgerInputsQuery(orgId, true);
  const tripsQ = useCompleteTripsQuery(orgId);
  const invoicesQ = useIssuedInvoicesQuery(orgId);

  const digitalPodCandidateIds = useMemo(() => {
    const trips = tripsQ.data ?? [];
    return trips
      .filter(
        (t) =>
          financeProTripCompleted(t) &&
          !financeProTripPodReceived(t) &&
          Boolean(t.id),
      )
      .map((t) => t.id)
      .sort();
  }, [tripsQ.data]);

  const digitalPodKey = digitalPodCandidateIds.join(",");
  const digitalPodQ = useQuery({
    queryKey: ["q", "finance-pro", "digital-pod", orgId ?? "", digitalPodKey],
    enabled: !!orgId && digitalPodCandidateIds.length > 0,
    staleTime: STALE.moderate,
    queryFn: async () => {
      const flags = await loadHubPodReceiptFlags(digitalPodCandidateIds);
      return flags.softTripIds;
    },
  });

  const digitalPodTripIds = useMemo(
    () => new Set(digitalPodQ.data ?? []),
    [digitalPodQ.data],
  );

  const model = useMemo(
    () =>
      buildFinanceProModel({
        clients: clientsQ.data ?? [],
        inputs: ledgerQ.data,
        trips: tripsQ.data ?? [],
        issuedInvoices: invoicesQ.data ?? [],
        digitalPodTripIds,
      }),
    [clientsQ.data, ledgerQ.data, tripsQ.data, invoicesQ.data, digitalPodTripIds],
  );

  const hasCachedCore =
    (Array.isArray(clientsQ.data) && clientsQ.data.length > 0) ||
    (Array.isArray(tripsQ.data) && tripsQ.data.length > 0) ||
    Boolean(
      ledgerQ.data &&
        Array.isArray(ledgerQ.data.trip_inputs) &&
        ledgerQ.data.trip_inputs.length > 0,
    );
  const loading =
    !!orgId &&
    !hasCachedCore &&
    (clientsQ.isPending ||
      ledgerQ.isPending ||
      tripsQ.isPending ||
      clientsQ.isFetching ||
      ledgerQ.isFetching ||
      tripsQ.isFetching);
  const documentsLoading =
    !!orgId &&
    ((invoicesQ.isPending && invoicesQ.data === undefined) ||
      (digitalPodCandidateIds.length > 0 &&
        digitalPodQ.isPending &&
        digitalPodQ.data === undefined));

  const error =
    clientsQ.error ??
    ledgerQ.error ??
    tripsQ.error ??
    invoicesQ.error ??
    digitalPodQ.error ??
    null;

  return { orgId, model, loading, documentsLoading, error };
}
