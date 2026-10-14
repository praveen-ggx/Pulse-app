/**
 * Unallocated indent on the Trips hub — same ticket shell as a Trip card,
 * with indent bidding status + circulation source tags (not trip stages).
 */
import {
  getIndentDisplayNumber,
  type IndentRow,
} from "@/features/indents";
import { indentCancelReasonLabel } from "@/features/indents/utils/indentCancelReason.util";
import { TripsHubMobileTripCard } from "@/features/trips/components/TripsHubMobileTripCard";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  indentHubLifecycleStatus,
  indentHubLoadSpecLine,
  indentHubSourceTags,
  indentHasAwardRevokedTag,
} from "@/features/trips/utils/indentHubCardPresentation";
import { extraStopChipLabel } from "@/features/trips/utils/routeExtraStops.util";
import type { ReactNode } from "react";

function indentAsHubTripShape(indent: IndentRow): TripRow {
  return {
    id: indent.id,
    pickup_area: indent.pickup_area,
    drop_location: indent.drop_location,
    client_name: indent.client_name,
    client_id: indent.client_id ?? null,
    created_at: indent.created_at,
    pickup_date: indent.pickup_date,
    organization_id: indent.organization_id,
    indent_id: null,
  } as TripRow;
}

export function TripsHubIndentStageCard({
  indent,
  bidCount,
  extraStopCount = 0,
  extraStopNames,
  onPress,
  tr,
  hubGrid = false,
  layoutCompact = false,
  actions,
  clientAvatarUrl,
  clientAvatarSeed,
  clientAvatarFallbackSeed,
  clientOrganizationImageUrl,
  clientOrganizationAvatarSeed,
}: {
  indent: IndentRow;
  bidCount: number;
  /** FTL stops between pickup and drop. */
  extraStopCount?: number;
  /** Stop cities in route order, shown under the arrow. */
  extraStopNames?: readonly string[];
  onPress: () => void;
  tr: (key: string) => string;
  hubGrid?: boolean;
  layoutCompact?: boolean;
  actions?: ReactNode;
  /** Same client photo/logo stack as the existing Give Load cards — see indentCardAvatar.util.ts. */
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientAvatarFallbackSeed?: string;
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
}) {
  const stageLabel = indentHubLifecycleStatus(indent.status, bidCount);
  const cancelReason = indentCancelReasonLabel(indent.cancel_reason);
  const originTags = [
    ...indentHubSourceTags(indent.circulation_target),
    ...(cancelReason ? [cancelReason.toUpperCase()] : []),
    ...(indentHasAwardRevokedTag(indent.status, indent.award_revoked_at)
      ? ["AWARD REVOKED"]
      : []),
  ];

  return (
    <TripsHubMobileTripCard
      trip={indentAsHubTripShape(indent)}
      displayClientName={indent.client_name || "—"}
      stageLabel={stageLabel}
      origin={indent.pickup_area || "—"}
      dest={indent.drop_location || "—"}
      routeViaLabel={extraStopChipLabel(extraStopCount)}
      routeViaDetail={extraStopNames?.length ? extraStopNames.join(", ") : null}
      pickupIso={indent.pickup_date ?? indent.created_at}
      onPress={onPress}
      tr={tr}
      originTags={originTags}
      displayNumber={getIndentDisplayNumber(indent)}
      hidePartyRow
      clientAvatarUrl={clientAvatarUrl}
      clientAvatarSeed={clientAvatarSeed}
      clientAvatarFallbackSeed={clientAvatarFallbackSeed}
      clientOrganizationImageUrl={clientOrganizationImageUrl}
      clientOrganizationAvatarSeed={clientOrganizationAvatarSeed}
      specLine={indentHubLoadSpecLine(indent)}
      dense={hubGrid || layoutCompact}
      fillGrid={hubGrid}
      actions={actions}
    />
  );
}
