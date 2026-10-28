import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import type { TripDetailScreenProps } from "@/features/trips/components/trip-detail/TripDetailScreen.types";
import { setLastOpenedHubItem } from "@/features/trips/utils/lastOpenedHubItem.util";
import { parseTripDetailRouteParams, ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { Suspense, lazy } from "react";

const TripDetailScreen = lazy(
  () => import("@/features/trips/components/trip-detail/TripDetailScreen"),
);

export default function TripDetailRoute() {
  const raw = useLocalSearchParams<{
    id: string;
    tab?: string;
    financeSubTab?: string;
    entryContext?: string;
    clientIdFromContext?: string;
    clientNameFromContext?: string;
  }>();
  const safeBack = useSafeBack(ROUTES.TABS.TRIPS);
  const parsed = parseTripDetailRouteParams(raw);
  if (parsed.tripId) setLastOpenedHubItem(parsed.tripId);

  const screenProps: TripDetailScreenProps = {
    tripId: parsed.tripId,
    entryContext: parsed.entryContext,
    clientIdFromContext: parsed.clientIdFromContext,
    clientNameFromContext: parsed.clientNameFromContext,
    initialTab: parsed.tab,
    initialFinanceSubTab: parsed.financeSubTab,
    onBack: safeBack,
  };

  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading trip…" />}>
      <TripDetailScreen {...screenProps} />
    </Suspense>
  );
}
