import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { OtherExpenseEntryScreen } from "@/features/trips/operations/other/OtherExpenseEntryScreen";
import { DriverUnifiedExpenseEntryScreen } from "@/features/trips/operations/shared/DriverUnifiedExpenseEntryScreen";
import {
  parseDriverExpenseCategoryParam,
  parseDriverExpenseKindParam,
} from "@/features/trips/operations/shared/driverExpenseCategoryNav.util";
import { useLeaveTripExpenseEntry } from "@/features/trips/operations/shared/useLeaveTripExpenseEntry";
import { peekMountedDriverDetailTrip } from "@/features/driver/components/DriverTripHistoryDetailScreen";
import { getDriverOwnedTrip } from "@/features/driver/services/driverOwnedTrip.service";
import { getAccessibleTripById, type TripRow } from "@/features/trips/services/trips.service";
import { ROUTES } from "@/lib/routes";
import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function TripLoadError({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry?: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: Theme.screenBackground,
        gap: 12,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "800",
          color: Theme.textBody,
          textAlign: "center",
        }}
      >
        Couldn’t open expense
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "500",
          color: Theme.textMuted,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {message}
      </Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            style={{
              minHeight: 44,
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: Theme.primary,
            }}
          >
            <Text style={{ color: Theme.textOnDark, fontWeight: "700", fontSize: 14 }}>
              Retry
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            minHeight: 44,
            paddingHorizontal: 16,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: Theme.borderMedium,
            backgroundColor: Theme.whiteMuted,
          }}
        >
          <Text style={{ color: Theme.textBody, fontWeight: "700", fontSize: 14 }}>
            Go back
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TripOtherExpenseEntryRoute() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    entryId?: string | string[];
    category?: string | string[];
    kind?: string | string[];
  }>();
  const { profile } = useAuth();
  const tripId = readParam(params.id);
  const leave = useLeaveTripExpenseEntry(tripId);
  const entryId = readParam(params.entryId);
  const initialCategory = parseDriverExpenseCategoryParam(readParam(params.category));
  const initialKind = parseDriverExpenseKindParam(readParam(params.kind));
  const reusedParent = tripId ? peekMountedDriverDetailTrip(tripId) : null;
  const [trip, setTrip] = useState<TripRow | null>(reusedParent);
  const [loading, setLoading] = useState(!reusedParent);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadTrip = useCallback(() => {
    let mounted = true;
    if (!tripId) {
      setLoading(false);
      setError("Trip not found.");
      setTrip(null);
      return () => {
        mounted = false;
      };
    }
    const parentTrip = peekMountedDriverDetailTrip(tripId);
    if (parentTrip) {
      setTrip(parentTrip);
      setError(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }
    setLoading(true);
    setError(null);
    const load =
      profile?.role === "driver" ? getDriverOwnedTrip(tripId) : getAccessibleTripById(tripId);
    void load.then((res) => {
      if (!mounted) return;
      setTrip(res.trip ?? null);
      setError(res.error ? res.error.message : res.trip ? null : "Trip not found.");
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [profile?.role, tripId]);

  useEffect(() => {
    return loadTrip();
  }, [loadTrip, reloadKey]);

  return useMemo(() => {
    if (loading) return <CenteredLoadingView message="Loading expense entry..." />;
    if (error || !trip) {
      return (
        <TripLoadError
          message={error ?? "Trip not found"}
          onRetry={tripId ? () => setReloadKey((k) => k + 1) : undefined}
          onBack={leave}
        />
      );
    }

    // Fleet: kind=fuel|toll must use dedicated screens (legacy deep links).
    if (profile?.role !== "driver" && !entryId) {
      if (initialKind === "fuel") {
        return <Redirect href={ROUTES.tripFuelEntry(tripId) as Href} />;
      }
      if (initialKind === "toll") {
        return <Redirect href={ROUTES.tripTollEntry(tripId) as Href} />;
      }
    }

    if (profile?.role === "driver") {
      return (
        <DriverUnifiedExpenseEntryScreen
          trip={trip}
          entryId={entryId || null}
          initialKind={initialKind}
          initialOtherCategory={initialCategory}
        />
      );
    }

    return (
      <OtherExpenseEntryScreen
        trip={trip}
        entryId={entryId || null}
        initialCategory={initialCategory}
      />
    );
  }, [
    entryId,
    error,
    initialCategory,
    initialKind,
    leave,
    loading,
    profile?.role,
    trip,
    tripId,
  ]);
}
