import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { useDriverTripOpsActions } from "@/features/driver/hooks/useDriverTripOpsActions";
import {
  driverOpsTripCapabilities,
  resolveDriverOpsActiveTrip,
} from "@/features/driver/utils/driverActiveOpsTrip.util";
import * as tripsService from "@/features/trips/services/trips.service";
import { refetchDriverDashboardTripsIfStale } from "@/features/trips/domain/driverDashboardTripList";
import {
  driverUiTripsQueryKey,
  useDriverUiTripsQuery,
} from "@/lib/queries/useDriverUiTripsQuery";
import { usePendingOtpTripsQuery } from "@/lib/queries/usePendingOtpTripsQuery";
import { ROUTES } from "@/lib/routes";

const DRIVER_ACCEPTED_TRIP_ID_KEY = "driver_accepted_trip_id";

type DriverTripOpsContextValue = {
  hasTargetTrip: boolean;
  showExpenseOps: boolean;
  showOdometerOps: boolean;
  /** Short route/label for the expense capture card. */
  activeTripSummary: string | null;
  openExpense: () => void;
  openTripExpense: () => void;
  openOdometer: () => void;
  registerContextTrip: (trip: tripsService.TripRow | null) => void;
};

const DriverTripOpsContext = createContext<DriverTripOpsContextValue | null>(null);

export function DriverTripOpsProvider({
  children,
  refreshOpenTripsOnFocus = true,
}: {
  children: ReactNode;
  /**
   * The driver shell owns the open-trip list. Trip Detail must subscribe to
   * the same cache without refetching it, or Odometer/Expense/Settlement
   * compete with a second list read.
   */
  refreshOpenTripsOnFocus?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const pendingOtpQuery = usePendingOtpTripsQuery(uid);
  const tripsQuery = useDriverUiTripsQuery(uid, !!uid);

  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [contextTrip, setContextTrip] = useState<tripsService.TripRow | null>(null);

  const tripsQueryRef = useRef(tripsQuery);
  tripsQueryRef.current = tripsQuery;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
        if (!cancelled) setAcceptedTripId(id?.trim() ? id : null);
      });
      if (!refreshOpenTripsOnFocus) {
        return () => {
          cancelled = true;
        };
      }
      // refetch() ignores staleTime. A fresh open-trip list stays cached.
      // Leaving the shell cancels an in-flight list so it does not keep a
      // pool slot while a child route reads one trip.
      const query = tripsQueryRef.current;
      refetchDriverDashboardTripsIfStale(
        { isFetched: query.isFetched, isStale: query.isStale },
        () => {
          void query.refetch();
        },
      );
      return () => {
        cancelled = true;
        if (uid) {
          void queryClient.cancelQueries({ queryKey: driverUiTripsQueryKey(uid) });
        }
      };
    }, [queryClient, refreshOpenTripsOnFocus, uid]),
  );

  const allTrips = tripsQuery.trips;
  const pendingTrips = pendingOtpQuery.pendingTrips;

  const activeTrip = useMemo(
    () => resolveDriverOpsActiveTrip({ trips: allTrips, pendingTrips, acceptedTripId }),
    [acceptedTripId, allTrips, pendingTrips],
  );

  const targetTrip = activeTrip ?? contextTrip;

  const baseOps = useDriverTripOpsActions({
    trips: allTrips,
    pendingTrips,
    acceptedTripId,
    activeTrip: targetTrip,
  });

  const caps = useMemo(() => driverOpsTripCapabilities(targetTrip), [targetTrip]);

  const registerContextTrip = useCallback((trip: tripsService.TripRow | null) => {
    setContextTrip(trip);
  }, []);

  const alertNoActiveTrip = useCallback(() => {
    Alert.alert(
      "No active trip",
      "Accept or start a delivery to log expenses for that trip.",
      [
        {
          text: "Open History",
          onPress: () => router.push("/(driver)/trip-history" as never),
        },
        { text: "OK", style: "cancel" },
      ],
    );
  }, [router]);

  const openTripExpense = useCallback(() => {
    if (!targetTrip?.id) {
      alertNoActiveTrip();
      return;
    }
    // Always attach to the active / context trip while delivery is incomplete.
    router.push(ROUTES.tripOtherExpenseEntry(targetTrip.id) as never);
  }, [alertNoActiveTrip, router, targetTrip?.id]);

  const openExpense = openTripExpense;

  const openOdometer = useCallback(() => {
    if (!targetTrip?.id) {
      alertNoActiveTrip();
      return;
    }
    if (!caps.showOdometer) {
      Alert.alert(
        "Odometer not available",
        "Odometer readings apply to asset fleet trips only.",
        [{ text: "OK" }],
      );
      return;
    }
    baseOps.openOdometer();
  }, [alertNoActiveTrip, baseOps, caps.showOdometer, targetTrip?.id]);

  const activeTripSummary = useMemo(() => {
    if (!targetTrip?.id) return null;
    const from = targetTrip.pickup_area?.trim() || "Origin";
    const to = targetTrip.drop_location?.trim() || "Destination";
    return `${from} → ${to}`;
  }, [targetTrip]);

  const value = useMemo<DriverTripOpsContextValue>(
    () => ({
      hasTargetTrip: Boolean(targetTrip?.id),
      showExpenseOps: Boolean(targetTrip?.id),
      showOdometerOps: caps.showOdometer,
      activeTripSummary,
      openExpense,
      openTripExpense,
      openOdometer,
      registerContextTrip,
    }),
    [
      activeTripSummary,
      caps.showOdometer,
      openExpense,
      openOdometer,
      openTripExpense,
      registerContextTrip,
      targetTrip?.id,
    ],
  );

  return (
    <DriverTripOpsContext.Provider value={value}>
      {children}
    </DriverTripOpsContext.Provider>
  );
}

export function useDriverTripOps() {
  const ctx = useContext(DriverTripOpsContext);
  if (!ctx) {
    throw new Error("useDriverTripOps must be used within DriverTripOpsProvider");
  }
  return ctx;
}

/** Optional hook for screens outside provider (should not happen in driver app). */
export function useOptionalDriverTripOps() {
  return useContext(DriverTripOpsContext);
}

export function useRegisterDriverContextTrip(trip: tripsService.TripRow | null | undefined) {
  const ctx = useOptionalDriverTripOps();
  useFocusEffect(
    useCallback(() => {
      if (!ctx) return undefined;
      ctx.registerContextTrip(trip ?? null);
      return () => ctx.registerContextTrip(null);
    }, [ctx, trip]),
  );
}
