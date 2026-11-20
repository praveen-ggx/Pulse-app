/**
 * Native trip map placeholder — desktop web uses TripMap.web (Leaflet).
 */
import { Theme } from "@/constants/Theme";
import { StyleSheet, View } from "react-native";

export interface TripMapProps {
  source?: string | null;
  destination?: string | null;
  sourceCoords?: { latitude: number; longitude: number } | null;
  destCoords?: { latitude: number; longitude: number } | null;
  truckLocation?: { latitude: number; longitude: number } | null;
  truckStatus?: {
    truckNo?: string;
    speed?: number;
    ignitionStatus?: boolean;
    location?: string;
    lastUpdated?: string;
  } | null;
  dbLocationTrail?: {
    latitude: number;
    longitude: number;
    recorded_at?: string;
  }[];
  intermediateStops?: string[];
  height?: number | string;
  onDistanceCalculated?: (distanceKm: string) => void;
  tripId?: string | null;
  trackingEnabled?: boolean;
  /** Bottom inset when auto-fitting the full route in compact previews. */
  fitPaddingBottom?: number;
  /** Right inset so a hanging side card does not cover the fitted route. */
  fitPaddingRight?: number;
  /** Live pin: driver profile image (matches driver-app map avatar). */
  driverAvatarUri?: string | null;
  /** Seed for generated avatar when URI is missing (usually driver id). */
  driverAvatarSeed?: string | null;
  /** Green online ring when driver is broadcasting. */
  driverOnline?: boolean;
  /** Completed trip: bold driven route + legend (web map; native ignores). */
  completedTrip?: boolean;
}

export function TripMap({ height }: TripMapProps) {
  const minHeight = typeof height === "number" ? height : 200;
  return <View style={[styles.map, { minHeight }]} />;
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
});
