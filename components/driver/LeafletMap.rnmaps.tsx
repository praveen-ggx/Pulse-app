/**
 * Leaflet-shaped map for Expo Go using react-native-maps (MapLibre native is unavailable).
 * When tiles grey out on device, fall back to WebView OSM (see LeafletMap.expoWebView).
 */
import Theme from '@/constants/Theme';
import { DriverMapAvatarMarker } from '@/components/driver/DriverMapAvatarMarker';
import { LeafletMapZoomControls } from '@/components/driver/LeafletMapZoomControls';
import { isExpoGo } from '@/lib/expoGoMaps';
import { kindIndexFromMarkerId, tripMapMarkerRoleFromId } from '@/lib/mapMarkerIcons.util';
import { RoutePlanMapPin } from '@/features/driver/job-card/parts/RoutePlanMapPin';
import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { withWebSafeShadows } from '@/lib/platformViewStyle.util';
import MapView, { Marker, Polyline } from 'react-native-maps';

import {
  ExpoGoWebLeafletMap,
  shouldUseExpoGoWebMap,
} from './LeafletMap.expoWebView';
import type { LeafletLatLng, LeafletMapProps, LeafletMapRef, LeafletPolylineLayer } from './LeafletMap.types';

/** Short dash + round cap reads as round dots — Google-style "approx" path. */
const ROUTE_DOTTED_PATTERN = [1, 9];

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

function zoomToRegionDeltas(zoom: number): { lat: number; lng: number } {
  const z = Math.max(2, Math.min(20, zoom));
  const d = 360 / Math.pow(2, z);
  const delta = Number.isFinite(d) ? Math.min(180, Math.max(0.0005, d)) : 0.05;
  return { lat: delta, lng: delta };
}

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
    // Expo Go: custom Image markers frequently grey the entire MapView after
    // heavy asset pressure. Use a light pin so tiles stay visible.
    if (isExpoGo()) {
      return (
        <View
          style={[
            styles.expoGoYouDot,
            { borderColor: isOnline ? Theme.darkGreen : Theme.teslaRed },
          ]}
        />
      );
    }
    return (
      <DriverMapAvatarMarker
        avatarUri={avatarUri}
        avatarSeed={avatarSeed}
        isOnline={isOnline ?? (role === 'truck' || role === 'live')}
        size={48}
        onPressStatus={onPress}
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
    return (
      <View style={styles.pinMarkerWrap}>
        {label?.trim() ? (
          <View
            style={[
              styles.pinLabel,
              isDrop ? styles.pinLabelDrop : styles.pinLabelPickup,
              highlighted ? styles.pinLabelActive : null,
            ]}
          >
            <Text
              style={[
                styles.pinLabelText,
                isDrop ? styles.pinLabelTextDrop : styles.pinLabelTextPickup,
              ]}
              numberOfLines={1}
            >
              {label.trim()}
            </Text>
          </View>
        ) : null}
        <View
          style={[
            styles.pinDot,
            {
              backgroundColor: color ?? (isDrop ? Theme.driverGold : Theme.driverEmerald),
            },
            highlighted ? styles.pinDotActive : null,
          ]}
        />
        <View style={styles.pinTail} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? 'View location' : undefined}
      style={[styles.markerDot, { backgroundColor: color ?? Theme.driverEmerald }]}
    />
  );
}

export const LeafletMapRnMaps = React.forwardRef<
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
    const mapRef = useRef<MapView | null>(null);
    const zoomLevelRef = useRef(zoom);
    const centerRef = useRef(center);
    centerRef.current = center;

    const animateToZoom = useCallback(
      (next: number) => {
        const clamped = Math.max(3, Math.min(16, next));
        zoomLevelRef.current = clamped;
        const { lat, lng } = zoomToRegionDeltas(clamped);
        const duration = lowPower ? 0 : 280;
        const c = centerRef.current;
        mapRef.current?.animateToRegion(
          {
            latitude: c.latitude,
            longitude: c.longitude,
            latitudeDelta: lat,
            longitudeDelta: lng,
          },
          duration,
        );
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
        const { lat, lng } = zoomToRegionDeltas(z);
        const duration = lowPower ? 0 : 450;
        mapRef.current?.animateToRegion(
          {
            latitude: currentCenter.latitude,
            longitude: currentCenter.longitude,
            latitudeDelta: lat,
            longitudeDelta: lng,
          },
          duration,
        );
      },
      setMarkerCoordinate: (_id, _coordinate) => {
        // rnmaps Marker is prop-driven; home screen uses Reanimated for native You.
      },
      fitBounds: (_ne, _sw, _paddingPx, _maxZoom) => {},
      zoomIn: () => animateToZoom(zoomLevelRef.current + 1),
      zoomOut: () => animateToZoom(zoomLevelRef.current - 1),
    }));

    const safePolylineLayers = useMemo(
      () => resolvePolylineLayers(polylines, polyline, polylineColor),
      [polylines, polyline, polylineColor],
    );

    const { lat: initLatD, lng: initLngD } = zoomToRegionDeltas(zoom);
    const showZoom = showZoomControls && !interactionLocked;

    // Defensive: this path is only meant for Expo Go, where react-native-maps is
    // available. If the environment was mis-detected in a standalone build that
    // ships MapLibre (not react-native-maps), MapView resolves to undefined and
    // rendering it throws "Cannot read property 'MapView' of undefined". Render an
    // empty host instead of crashing the whole screen via the error boundary.
    if (!MapView) {
      return <View style={[style, styles.mapHost]} />;
    }

    return (
      <View style={[style, styles.mapHost]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: center.latitude,
            longitude: center.longitude,
            latitudeDelta: initLatD,
            longitudeDelta: initLngD,
          }}
          // Expo Go iOS: mutedStandard / custom styles often render grey tiles.
          mapType="standard"
          userInterfaceStyle="light"
          rotateEnabled={false}
          pitchEnabled={false}
          scrollEnabled={!interactionLocked}
          zoomEnabled={!interactionLocked}
        >
          {safePolylineLayers.map((layer) => {
            const color = layer.color ?? polylineColor;
            const mainWidth = layer.width ?? 5;
            const glowWidth = layer.glowWidth ?? mainWidth + 5;
            return (
              <React.Fragment key={layer.id}>
                {layer.dashed ? null : (
                  // White casing under solid routes; dotted routes have none.
                  <Polyline
                    coordinates={layer.coordinates}
                    strokeColor={Theme.cardWhite}
                    strokeWidth={glowWidth}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
                <Polyline
                  coordinates={layer.coordinates}
                  strokeColor={color}
                  strokeWidth={mainWidth}
                  lineCap="round"
                  lineJoin="round"
                  lineDashPattern={layer.dashed ? ROUTE_DOTTED_PATTERN : undefined}
                />
              </React.Fragment>
            );
          })}

          {(routeLabels ?? []).map((label) => (
            <Marker
              key={label.id}
              coordinate={label.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.routeDistanceLabel}>
                <Text style={styles.routeDistanceLabelText}>{label.text}</Text>
              </View>
            </Marker>
          ))}

          {(markers ?? []).map((m) => {
            const role = tripMapMarkerRoleFromId(m.id);
            const isAvatar =
              role === 'driver' || role === 'truck' || role === 'live';
            const isPin = role === 'origin' || role === 'destination';
            return (
              <Marker
                key={m.id}
                coordinate={m.coordinate}
                anchor={isAvatar || isPin ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
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
            );
          })}
        </MapView>
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => animateToZoom(zoomLevelRef.current + 1)}
            onZoomOut={() => animateToZoom(zoomLevelRef.current - 1)}
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
  expoGoYouDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.driverEmerald,
    borderWidth: 3,
    borderColor: Theme.darkGreen,
  },
  pinMarkerWrap: {
    alignItems: 'center',
    minWidth: 72,
  },
  pinLabel: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    marginBottom: 4,
    maxWidth: 140,
  },
  pinLabelPickup: {
    borderColor: 'rgba(4,120,87,0.24)',
  },
  pinLabelDrop: {
    borderColor: 'rgba(245,158,11,0.38)',
  },
  pinLabelActive: {
    shadowColor: Theme.driverPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  pinLabelText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  pinLabelTextPickup: {
    color: Theme.driverEmeraldDark,
  },
  pinLabelTextDrop: {
    color: '#92400e',
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  pinDotActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
    marginTop: -1,
  },
  routeDistanceLabel: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(4,120,87,0.28)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  routeDistanceLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.driverEmeraldDark,
    letterSpacing: 0.2,
  },
}),
);



/** Expo Go: prefer WebView OSM tiles (rn MapView often greys out on device). */
export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  function LeafletMapExpoAware(props, ref) {
    if (shouldUseExpoGoWebMap()) {
      return <ExpoGoWebLeafletMap ref={ref} {...props} />;
    }
    return <LeafletMapRnMaps ref={ref} {...props} />;
  },
);
