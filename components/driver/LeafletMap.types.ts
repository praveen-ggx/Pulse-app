import type { StyleProp, ViewStyle } from "react-native";

export type LeafletLatLng = { latitude: number; longitude: number };

export type LeafletPolylineLayer = {
  id: string;
  coordinates: LeafletLatLng[];
  color?: string;
  /** Dashed stroke (e.g. driver → pickup before arrival). */
  dashed?: boolean;
  width?: number;
  glowWidth?: number;
};

export type LeafletRouteLabel = {
  id: string;
  coordinate: LeafletLatLng;
  text: string;
};

export type LeafletMarker = {
  id: string;
  coordinate: LeafletLatLng;
  label?: string;
  color?: string;
  /** Driver self-marker (`id: "you"`): profile image + online ring. */
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
  /** Active guidance target — subtle pulse on pickup/drop. */
  highlighted?: boolean;
  /** Pickup 1 / Drop 2 numbering for multi-stop plans. */
  kindIndex?: number;
  /** "+N next · Drop 2" hint for a stacked route-plan pin. Not drawn yet. */
  nextLabel?: string | null;
  /** Pickup/drop numbers stacked under one route-plan pin. Not drawn yet. */
  clusterBadges?: ReadonlyArray<{ kind: 'pickup' | 'drop'; index: number }>;
  /** Tap marker (or online status chip) to focus / open location. */
  onPress?: () => void;
};

export type LeafletMapProps = {
  style?: StyleProp<ViewStyle>;
  center: LeafletLatLng;
  zoom?: number;
  markers?: LeafletMarker[];
  /** Preferred: multiple route layers (trip leg + approach, etc.). */
  polylines?: LeafletPolylineLayer[];
  /** Distance / ETA chips placed on the map along a route. */
  routeLabels?: LeafletRouteLabel[];
  /** Legacy single polyline — used when `polylines` is omitted. */
  polyline?: LeafletLatLng[];
  polylineColor?: string;
  /** Optional hard viewport constraint (used for India-focused tracking). */
  maxBounds?: {
    southWest: LeafletLatLng;
    northEast: LeafletLatLng;
  };
  /** When false, route/marker updates never call fitBounds — parent owns the camera
   *  (driver follow / focus). Default true for standalone maps. */
  autoFitBoundsOnRouteChange?: boolean;
  /** Prefer compact tiles and lower motion for low-end devices. */
  lowPower?: boolean;
  /** When true, disable drag/zoom so the viewport stays locked while driver-tracking. */
  interactionLocked?: boolean;
  /** Show +/- zoom buttons (default true). */
  showZoomControls?: boolean;
};

export type LeafletMapRef = {
  /**
   * Center on a location. When `zoom` is omitted, keep the current zoom
   * (follow mode must not reset user/route overview zoom).
   */
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
  /** Move an existing marker without rebuilding overlay layers (live GPS / truck anim). */
  setMarkerCoordinate: (id: string, coordinate: LeafletLatLng) => void;
  fitBounds: (
    ne: LeafletLatLng,
    sw: LeafletLatLng,
    paddingPx?: number,
    maxZoom?: number,
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};
