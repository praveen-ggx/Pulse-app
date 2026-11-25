/**
 * Supplier label + truck type for Compliance list cards: one
 * `get_compliance_list_trip_facts` call for the whole visible list (the RPC
 * resolves partner trucks and authorizes every trip server-side).
 */
import { useAuth } from "@/contexts/AuthContext";
import {
  buildComplianceListTripFacts,
  fetchComplianceListTripFacts,
  type ComplianceListTripFacts,
} from "@/features/tripCompliance/services/complianceListFacts.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type { ComplianceListTripFacts };

/** Short, stable key for a trip set (+ the vehicle/supplier ids the RPC reads). */
function hashSignature(signature: string): string {
  let h = 5381;
  for (let i = 0; i < signature.length; i++) h = ((h * 33) ^ signature.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function useComplianceListTripFacts(
  summaries: ComplianceTripSummary[],
  viewerOrgId: string,
): ComplianceListTripFacts {
  const { sessionAttached } = useAuth();

  const { tripIds, signature } = useMemo(() => {
    const parts = summaries
      .map((s) => [s.trip.id, s.trip.vehicle_id ?? "", s.trip.supplier_id ?? ""].join(":"))
      .sort();
    return {
      tripIds: summaries.map((s) => s.trip.id),
      signature: `${parts.length}-${hashSignature(parts.join("|"))}`,
    };
  }, [summaries]);

  const factsQuery = useQuery({
    queryKey: queryKeys.tripCompliance.listFacts(viewerOrgId, signature),
    queryFn: () => fetchComplianceListTripFacts(viewerOrgId, tripIds),
    // The RPC is authenticated-only; without a user JWT it fails 42501 as anon.
    enabled: sessionAttached && Boolean(viewerOrgId) && tripIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: STALE.frequent,
    // A failed batch must not double the load (5xx / timeouts during an incident).
    retry: false,
  });

  return useMemo(() => {
    if (!sessionAttached || !viewerOrgId || summaries.length === 0) {
      return { truckTypeByVehicleId: {}, supplierNameByTripId: {} };
    }
    if (!factsQuery.data) return { truckTypeByVehicleId: {}, supplierNameByTripId: {} };
    return buildComplianceListTripFacts(summaries, factsQuery.data);
  }, [factsQuery.data, sessionAttached, summaries, viewerOrgId]);
}
