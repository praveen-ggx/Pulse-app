import { setInitialTripForDetail } from "@/features/trips/initialTripForDetail";
import { setLastOpenedHubItem } from "@/features/trips/utils/lastOpenedHubItem.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Stable trip-detail navigation handler for list rows.
 * Optional `seed` is the list TripRow — stashed for first paint only (not URL params).
 */
export function useOpenTripDetail() {
  const router = useRouter();

  const openTripDetail = useCallback(
    (tripId: string, seed?: TripRow | null) => {
      const id = tripId.trim();
      if (!id) return;
      setLastOpenedHubItem(id);
      if (seed?.id === id) {
        setInitialTripForDetail(seed);
      }
      router.push(ROUTES.tripDetail(id) as never);
    },
    [router],
  );

  return { openTripDetail };
}
