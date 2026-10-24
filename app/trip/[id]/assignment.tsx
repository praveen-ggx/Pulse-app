import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import type { AssignmentFlowFocus } from "@/features/trips/components/trip-detail/TripAssignmentFlowScreen";
import { hasInAppPrevious } from "@/lib/inAppHistory";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Suspense, lazy, useCallback } from "react";
import { Platform } from "react-native";

const TripAssignmentFlowScreen = lazy(
  () =>
    import("@/features/trips/components/trip-detail/TripAssignmentFlowScreen").then(
      (m) => ({ default: m.TripAssignmentFlowScreen }),
    ),
);

export default function TripAssignmentRoute() {
  const params = useLocalSearchParams<{
    id: string;
    focus?: string;
  }>();
  const tripId = typeof params.id === "string" ? params.id : (params.id?.[0] ?? "");
  const router = useRouter();
  const onBack = useCallback(() => {
    const tripDetailHref = tripId ? ROUTES.tripDetail(tripId) : ROUTES.TABS.TRIPS;
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      hasInAppPrevious() &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(tripDetailHref as never);
  }, [router, tripId]);
  const focusRaw = typeof params.focus === "string" ? params.focus : params.focus?.[0];
  const initialFocus: AssignmentFlowFocus =
    focusRaw === "vehicle" ? "vehicle" : "driver";

  if (!tripId) {
    return (
      <LazySuspenseInlineFallback message="Missing trip" />
    );
  }

  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading…" />}>
      <TripAssignmentFlowScreen
        tripId={tripId}
        initialFocus={initialFocus}
        onBack={onBack}
      />
    </Suspense>
  );
}
