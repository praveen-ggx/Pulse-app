import React, { useImperativeHandle, useRef } from "react";
import { Platform } from "react-native";

import { resolveNativeLeafletMap } from "@/lib/maps/leafletNativeImplementation";

import { LeafletMap as LeafletMapWeb } from "./LeafletMap.web";
import type { LeafletLatLng, LeafletMapProps, LeafletMapRef } from "./LeafletMap.types";

export type { LeafletLatLng, LeafletMapRef, LeafletMarker, LeafletPolylineLayer, LeafletRouteLabel } from "./LeafletMap.types";

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  function LeafletMap(props, ref) {
    const webRef = useRef<LeafletMapRef>(null);
    const nativeRef = useRef<LeafletMapRef>(null);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        if (Platform.OS === "web") {
          webRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        } else {
          nativeRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        }
      },
      setMarkerCoordinate: (id, coordinate) => {
        if (Platform.OS === "web") {
          webRef.current?.setMarkerCoordinate(id, coordinate);
        } else {
          nativeRef.current?.setMarkerCoordinate(id, coordinate);
        }
      },
      fitBounds: (ne, sw, paddingPx, maxZoom, insets) => {
        if (Platform.OS === "web") {
          webRef.current?.fitBounds(ne, sw, paddingPx, maxZoom, insets);
        } else {
          nativeRef.current?.fitBounds(ne, sw, paddingPx, maxZoom, insets);
        }
      },
      zoomIn: () => {
        if (Platform.OS === "web") {
          webRef.current?.zoomIn();
        } else {
          nativeRef.current?.zoomIn();
        }
      },
      zoomOut: () => {
        if (Platform.OS === "web") {
          webRef.current?.zoomOut();
        } else {
          nativeRef.current?.zoomOut();
        }
      },
    }));

    if (Platform.OS === "web") {
      return <LeafletMapWeb ref={webRef} {...props} />;
    }

    // Exactly one implementation is evaluated, chosen by the map registry.
    // A missing export must not take down the whole driver app with it — the
    // map is a preview, so render nothing rather than throwing.
    const NativeImpl = resolveNativeLeafletMap();
    if (!NativeImpl) return null;

    return <NativeImpl ref={nativeRef} {...props} />;
  },
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((p) => [p.latitude, p.longitude]);
}
