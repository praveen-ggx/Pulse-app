import Theme from '@/constants/Theme';
import { DriverMapAvatarMarker } from '@/components/driver/DriverMapAvatarMarker';
import { LeafletMapZoomControls } from '@/components/driver/LeafletMapZoomControls';
import { kindIndexFromMarkerId, tripMapMarkerRoleFromId } from '@/lib/mapMarkerIcons.util';
import { RoutePlanMapPin } from '@/features/driver/job-card/parts/RoutePlanMapPin';
// Migrated to @maplibre/maplibre-react-native v11 API: MapView->Map,
// PointAnnotation->Marker (lngLat), ShapeSource->GeoJSONSource, setCamera->setStop.
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native';
import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { withWebSafeShadows } from '@/lib/platformViewStyle.util';
import { NATIVE_BASEMAP_STYLE } from '@/lib/maps/nativeBasemapStyle';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  LeafletLatLng,
  LeafletMapProps,
  LeafletMapRef,
  LeafletPolylineLayer,
} from './LeafletMap.types';

function resolvePolylineLayers(
  polylines: LeafletPolylineLayer[] | undefined,
  polyline: LeafletLatLng[],
  polylineColor: string,
): LeafletPolylineLayer[] {
  if (polylines?.length) {
    return polylines.filter((layer) => layer.coordinates?.length >= 2);
  }
  if (polyline.length >= 2) {
    return [{ id: 'main', coordinates: polyline, color: polylineColor }];
  }
  return [];
}

function toLngLat(c: LeafletLatLng): [number, number] {
  return [c.longitude, c.latitude];
}

// Free, reliable OSM-based vector style (works well for India coverage).
const MAP_STYLE = NATIVE_BASEMAP_STYLE;

/** White chevron drawn along solid route lines to show travel direction. */
const ROUTE_IMAGES = {
  'route-arrow': require('@/assets/images/map/route-arrow.png'),
};
/** Solid lines at least this wide are "hero" routes and get direction arrows. */
const ROUTE_ARROW_MIN_WIDTH = 6;

function MarkerContent({
  markerId,
  color,
  label,
  highlighted,
  kindIndex,
  avatarUri,
  avatarSeed,
  isOnline,
  onPress,
}: {
  markerId: string;
  color?: string;
  label?: string;
  highlighted?: boolean;
  kindIndex?: number;
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
  onPress?: () => void;
}) {
  const role = tripMapMarkerRoleFromId(markerId);
  if (role === 'driver' || role === 'truck' || role === 'live') {
    return (
      <DriverMapAvatarMarker
        avatarUri={avatarUri}
        avatarSeed={avatarSeed}
        isOnline={isOnline ?? (role === 'truck' || role === 'live')}
        size={48}
        onPressStatus={onPress}
        variant="truck"
      />
    );
  }
  if (role === 'origin' || role === 'destination') {
    const isDrop = role === 'destination';
    const index = kindIndex ?? kindIndexFromMarkerId(markerId);
    if (index != null) {
      return (
        <RoutePlanMapPin
          kind={isDrop ? 'drop' : 'pickup'}
          index={index}
          caption={label?.trim() || undefined}
          emphasized={highlighted}
        />
      );
    }
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? 'View location' : undefined}
      style={[
        styles.markerDot,
        { backgroundColor: color ?? Theme.driverEmerald },
      ]}
    />
  );
}

export const LeafletMapMapLibre = React.forwardRef<
  LeafletMapRef,
  LeafletMapProps
>(
  (
    {
      style,
      center,
      zoom = 15,
      markers = [],
      polylines,
      routeLabels = [],
      polyline = [],
      polylineColor = '#3b82f6',
      lowPower = false,
      interactionLocked = false,
      showZoomControls = true,
    },
    ref,
  ) => {
    const cameraRef = useRef<CameraRef | null>(null);
    const zoomLevelRef = useRef(zoom);

    const setCameraZoom = useCallback(
      (next: number, animationDuration = lowPower ? 0 : 280) => {
        const clamped = Math.max(3, Math.min(16, next));
        zoomLevelRef.current = clamped;
        cameraRef.current?.zoomTo(clamped, { duration: animationDuration });
      },
      [lowPower],
    );

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        const z = Math.max(
          3,
          Math.min(
            16,
            currentZoom !== undefined ? currentZoom : zoomLevelRef.current,
          ),
        );
        zoomLevelRef.current = z;
        cameraRef.current?.setStop({
          center: toLngLat(currentCenter),
          zoom: z,
          duration: lowPower ? 0 : 450,
        });
      },
      setMarkerCoordinate: (_id, _coordinate) => {
        // Native MapLibre path rebuilds PointAnnotations from props; live bus
        // still updates shared values / React throttle on the home screen.
      },
      fitBounds: (ne, sw, paddingPx = 80, _maxZoom, insets) => {
        cameraRef.current?.fitBounds?.(
          [sw.longitude, sw.latitude, ne.longitude, ne.latitude],
          {
            padding: {
              top: insets?.top ?? paddingPx,
              right: insets?.right ?? paddingPx,
              bottom: insets?.bottom ?? paddingPx,
              left: insets?.left ?? paddingPx,
            },
            duration: lowPower ? 0 : 600,
          },
        );
      },
      zoomIn: () => setCameraZoom(zoomLevelRef.current + 1),
      zoomOut: () => setCameraZoom(zoomLevelRef.current - 1),
    }));

    const safePolylineLayers = useMemo(
      () => resolvePolylineLayers(polylines, polyline, polylineColor),
      [polylines, polyline, polylineColor],
    );

    const showZoom = showZoomControls && !interactionLocked;

    return (
      // Caller style last: callers pass absoluteFill, and mapHost's
      // position:'relative' must not override it (that collapsed the map to
      // 0 height on the dashboard preview and full-screen map).
      <View style={[styles.mapHost, style]}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE}
          logo={false}
          attribution={false}
          compass={false}
          dragPan={!interactionLocked}
          doubleTapZoom={!interactionLocked}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: toLngLat(center),
              zoom,
            }}
          />

          <Images images={ROUTE_IMAGES} />

          {safePolylineLayers.map((layer) => (
            <GeoJSONSource
              key={layer.id}
              id={`leaflet-polyline-source-${layer.id}`}
              data={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: layer.coordinates.map(toLngLat),
                },
                properties: {},
              }}
            >
              {layer.glowWidth ? (
                // White casing under the route so it stays readable over
                // parks, water and busy streets.
                <Layer
                  key={`leaflet-polyline-casing-${layer.id}`}
                  id={`leaflet-polyline-casing-${layer.id}`}
                  type="line"
                  source={`leaflet-polyline-source-${layer.id}`}
                  style={{
                    lineColor: Theme.cardWhite,
                    lineWidth: layer.glowWidth,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              ) : null}
              <Layer
                // Fixed key: MapLibre re-indexes children after dropping nulls,
                // so without it the casing reuses this layer and its id changes.
                key={`leaflet-polyline-layer-${layer.id}`}
                id={`leaflet-polyline-layer-${layer.id}`}
                type="line"
                source={`leaflet-polyline-source-${layer.id}`}
                style={{
                  lineColor: layer.color ?? polylineColor,
                  lineWidth: layer.width ?? 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  // Round dots (zero-length dash + round cap) for approx paths.
                  ...(layer.dashed ? { lineDasharray: [0, 2] } : {}),
                }}
              />
              {!layer.dashed && (layer.width ?? 5) >= ROUTE_ARROW_MIN_WIDTH ? (
                <Layer
                  key={`leaflet-polyline-arrows-${layer.id}`}
                  id={`leaflet-polyline-arrows-${layer.id}`}
                  type="symbol"
                  source={`leaflet-polyline-source-${layer.id}`}
                  style={{
                    symbolPlacement: 'line',
                    symbolSpacing: 90,
                    iconImage: 'route-arrow',
                    iconSize: 0.32,
                    iconAllowOverlap: true,
                    iconIgnorePlacement: true,
                  }}
                />
              ) : null}
            </GeoJSONSource>
          ))}

          {(routeLabels ?? []).map((label) => (
            <Marker
              key={label.id}
              id={`leaflet-route-label-${label.id}`}
              lngLat={toLngLat(label.coordinate)}
              anchor="center"
            >
              <View style={styles.routeDistanceLabel}>
                <Text style={styles.routeDistanceLabelText}>{label.text}</Text>
              </View>
            </Marker>
          ))}

          {(markers ?? []).map((m) => (
            <Marker
              key={m.id}
              id={`leaflet-marker-${m.id}`}
              lngLat={toLngLat(m.coordinate)}
              anchor={
                ['driver', 'truck', 'live', 'origin', 'destination'].includes(
                  tripMapMarkerRoleFromId(m.id),
                )
                  ? 'bottom'
                  : 'center'
              }
            >
              <MarkerContent
                markerId={m.id}
                color={m.color}
                label={m.label}
                highlighted={m.highlighted}
                kindIndex={m.kindIndex}
                avatarUri={m.avatarUri}
                avatarSeed={m.avatarSeed}
                isOnline={m.isOnline}
                onPress={m.onPress}
              />
            </Marker>
          ))}
        </Map>
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => setCameraZoom(zoomLevelRef.current + 1)}
            onZoomOut={() => setCameraZoom(zoomLevelRef.current - 1)}
          />
        ) : null}
      </View>
    );
  },
);

const styles = withWebSafeShadows(
  StyleSheet.create({
  mapHost: {
    position: 'relative',
    overflow: 'hidden',
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  routeDistanceLabel: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(4,120,87,0.28)',
  },
  routeDistanceLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.driverEmeraldDark,
    letterSpacing: 0.2,
  },
}),
);
