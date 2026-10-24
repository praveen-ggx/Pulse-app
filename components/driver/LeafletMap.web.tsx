import Theme from "@/constants/Theme";
import { withAlpha } from "@/lib/color";
import { LeafletMapZoomControls } from "@/components/driver/LeafletMapZoomControls";
import { boundsFromCoordinates } from "@/features/trips/utils/mapRouteViewport.util";
import {
  createRouteDistanceLabelElement,
  createTripMapMarkerElement,
  kindIndexFromMarkerId,
  tripMapMarkerRoleFromId,
} from "@/lib/mapMarkerIcons.util";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type {
  LeafletLatLng,
  LeafletMapProps,
  LeafletMapRef,
  LeafletPolylineLayer,
} from "./LeafletMap.types";

export type { LeafletLatLng, LeafletMapRef, LeafletMarker } from "./LeafletMap.types";

/** Keep fits/user zoom below where basemaps look empty. */
const OSM_USEFUL_MAX_ZOOM = 16;
const DEFAULT_FIT_MAX_ZOOM = 14;

/**
 * Same Carto Positron style as native LeafletMap.maplibre.
 * Raw OSM raster + MapLibre leaves a black WebGL clear-color when tiles
 * fail/overzoom (exact "black map" symptom). Positron paints a light land
 * background immediately and serves reliable India tiles.
 */
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Critical layout rules if CDN CSS is slow/blocked — without these the
 *  canvas often stays 0×0 (blank white) inside RN Web absolute hosts. */
const MAPLIBRE_CRITICAL_CSS = `
.maplibregl-map{position:relative;width:100%;height:100%}
.maplibregl-canvas-container,.maplibregl-canvas-container canvas{
  position:absolute;top:0;left:0;width:100%!important;height:100%!important
}
.maplibregl-ctrl-attrib{display:none!important}
`;

function ensureMapLibreCss(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById("maplibre-critical-css")) {
    const style = document.createElement("style");
    style.id = "maplibre-critical-css";
    style.textContent = MAPLIBRE_CRITICAL_CSS;
    document.head.appendChild(style);
  }
  if (!document.getElementById("maplibre-css")) {
    const link = document.createElement("link");
    link.id = "maplibre-css";
    link.rel = "stylesheet";
    // Match installed maplibre-gl major so layout classes stay compatible.
    link.href = "https://unpkg.com/maplibre-gl@5.23.0/dist/maplibre-gl.css";
    document.head.appendChild(link);
  }
}

type GeoJsonLine = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: number[][] };
  properties: Record<string, never>;
};

type MapLibreSourceLike = {
  setData?: (data: GeoJsonLine) => void;
};

type MapLibreMapLike = {
  on: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  isStyleLoaded?: () => boolean;
  addSource: (id: string, source: unknown) => void;
  getSource: (id: string) => MapLibreSourceLike | undefined;
  addLayer: (layer: unknown) => void;
  getLayer: (id: string) => unknown;
  setPaintProperty: (
    layerId: string,
    name: string,
    value: string | number | number[],
  ) => void;
  removeLayer?: (id: string) => void;
  removeSource?: (id: string) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number; maxZoom?: number },
  ) => void;
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    duration?: number;
  }) => void;
  getZoom?: () => number;
  getCenter?: () => { lng: number; lat: number };
  resize: () => void;
  triggerRepaint?: () => void;
  redraw?: () => void;
  getContainer?: () => HTMLElement;
  remove?: () => void;
};

type MapLibreMarkerLike = {
  setLngLat: (coord: [number, number]) => MapLibreMarkerLike;
  addTo: (map: MapLibreMapLike) => MapLibreMarkerLike;
  setPopup: (popup: unknown) => void;
  remove?: () => void;
};

type MapLibreModuleLike = {
  Map: new (options: {
    container: HTMLDivElement;
    style: string | Record<string, unknown>;
    center: [number, number];
    zoom: number;
    dragRotate: boolean;
    pitchWithRotate: boolean;
    attributionControl: boolean;
    maxBounds?: [[number, number], [number, number]];
  }) => MapLibreMapLike;
  Marker: new (options: {
    element: HTMLDivElement;
    anchor: string;
  }) => MapLibreMarkerLike;
  Popup: new (options: { closeButton: boolean }) => {
    setText: (text: string) => unknown;
  };
};

function resolvePolylineLayers(
  polylines: LeafletPolylineLayer[] | undefined,
  polyline: LeafletLatLng[],
  polylineColor: string,
): LeafletPolylineLayer[] {
  if (polylines?.length) {
    return polylines.filter((layer) => layer.coordinates?.length >= 2);
  }
  if (polyline.length >= 2) {
    return [
      {
        id: "main",
        coordinates: polyline,
        color: polylineColor,
      },
    ];
  }
  return [];
}

/** Route outline (glow) opacity — was the "40" in the old `${color}40` hex-alpha-suffix concatenation (0x40/255 ≈ 0.25). */
const ROUTE_OUTLINE_ALPHA = 0.25;

function isMapStyleReady(map: MapLibreMapLike | null | undefined): boolean {
  if (!map) return false;
  if (typeof map.isStyleLoaded === "function") {
    return map.isStyleLoaded();
  }
  return false;
}

function upsertRouteLayer(
  map: MapLibreMapLike,
  layer: LeafletPolylineLayer,
): void {
  if (!isMapStyleReady(map)) return;

  try {
  const sourceId = `route-src-${layer.id}`;
  const outlineId = `route-outline-${layer.id}`;
  const mainId = `route-main-${layer.id}`;
  const color = layer.color ?? Theme.driverPrimary;
  const mainWidth = layer.width ?? 5;
  const glowWidth = layer.glowWidth ?? mainWidth + 5;
  const pts = layer.coordinates.map((p) => [p.longitude, p.latitude]);

  const source = map.getSource(sourceId);
  const data: GeoJsonLine = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: pts },
    properties: {},
  };
  if (source?.setData) {
    source.setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }

  if (!map.getLayer(outlineId)) {
    map.addLayer({
      id: outlineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": withAlpha(color, ROUTE_OUTLINE_ALPHA),
        "line-width": glowWidth,
        "line-blur": layer.dashed ? 0 : 1.5,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  } else {
    map.setPaintProperty(outlineId, "line-color", withAlpha(color, ROUTE_OUTLINE_ALPHA));
    map.setPaintProperty(outlineId, "line-width", glowWidth);
  }

  if (!map.getLayer(mainId)) {
    map.addLayer({
      id: mainId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": mainWidth,
        ...(layer.dashed ? { "line-dasharray": [2, 2.5] } : {}),
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  } else {
    map.setPaintProperty(mainId, "line-color", color);
    map.setPaintProperty(mainId, "line-width", mainWidth);
    if (layer.dashed) {
      map.setPaintProperty(mainId, "line-dasharray", [2, 2.5]);
    } else {
      map.setPaintProperty(mainId, "line-dasharray", [1, 0]);
    }
  }
  } catch (e) {
    console.warn("[LeafletMap.web] upsertRouteLayer:", e);
  }
}

function removeRouteLayer(map: MapLibreMapLike, layerId: string): void {
  if (!isMapStyleReady(map)) return;

  const outlineId = `route-outline-${layerId}`;
  const mainId = `route-main-${layerId}`;
  const sourceId = `route-src-${layerId}`;
  try {
    if (map.getLayer(mainId)) map.removeLayer?.(mainId);
    if (map.getLayer(outlineId)) map.removeLayer?.(outlineId);
    if (map.getSource(sourceId)) map.removeSource?.(sourceId);
  } catch {
    /* map may be tearing down */
  }
}

function clampToBounds(
  point: LeafletLatLng,
  bounds?: { southWest: LeafletLatLng; northEast: LeafletLatLng },
): LeafletLatLng {
  if (!bounds) return point;
  return {
    latitude: Math.max(bounds.southWest.latitude, Math.min(bounds.northEast.latitude, point.latitude)),
    longitude: Math.max(bounds.southWest.longitude, Math.min(bounds.northEast.longitude, point.longitude)),
  };
}

function applyMapInteractionLock(map: unknown, locked: boolean): void {
  if (!map) return;
  const m = map as Record<
    string,
    { disable?: () => void; enable?: () => void } | undefined
  >;
  const names = [
    "dragPan",
    "scrollZoom",
    "boxZoom",
    "keyboard",
    "doubleClickZoom",
    "touchZoomRotate",
  ];
  try {
    names.forEach((key) => {
      const h = m[key];
      if (!h || typeof h.disable !== "function") return;
      if (locked) h.disable();
      else if (typeof h.enable === "function") h.enable();
    });
  } catch {
    /* noop */
  }
}

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  (
    {
      style,
      center,
      zoom = 15,
      markers = [],
      polylines,
      routeLabels = [],
      polyline = [],
      polylineColor = "#3b82f6",
      maxBounds,
      lowPower = false,
      interactionLocked = false,
      showZoomControls = true,
      autoFitBoundsOnRouteChange = true,
    },
    ref,
  ) => {
    const mapRef = useRef<MapLibreMapLike | null>(null);
    const zoomLevelRef = useRef(zoom);
    zoomLevelRef.current = zoom;
    const interactionLockedRef = useRef(interactionLocked);
    interactionLockedRef.current = interactionLocked;
    const autoFitBoundsRef = useRef(autoFitBoundsOnRouteChange);
    autoFitBoundsRef.current = autoFitBoundsOnRouteChange;
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<MapLibreMarkerLike[]>([]);
    const markersByIdRef = useRef(new Map<string, MapLibreMarkerLike>());
    const routeLayerIdsRef = useRef<string[]>([]);
    const lastPolylineStrRef = useRef<string>("");
    const mapStyleLoadedRef = useRef(false);
    const isMountedRef = useRef(true);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
      isMountedRef.current = true;
      if (typeof window === "undefined" || mapRef.current) {
        return;
      }

      ensureMapLibreCss();

      let cancelled = false;
      let rafId = 0;

      const mountMap = () => {
        if (cancelled || !isMountedRef.current || mapRef.current) return;
        const el = mapContainerRef.current;
        if (!el) {
          rafId = requestAnimationFrame(mountMap);
          return;
        }
        // Wait for a non-zero box before constructing — 0×0 WebGL frame
        // paints solid black/empty and often never recovers without a gesture.
        if (el.clientWidth === 0 || el.clientHeight === 0) {
          rafId = requestAnimationFrame(mountMap);
          return;
        }

        import("maplibre-gl").then((MapLibreModule) => {
          if (cancelled || !isMountedRef.current || !mapContainerRef.current || mapRef.current)
            return;
          const maplibregl =
            ((MapLibreModule as unknown) as { default?: MapLibreModuleLike }).default ??
            (MapLibreModule as unknown as MapLibreModuleLike);

          const container = mapContainerRef.current;
          if (container.clientWidth === 0 || container.clientHeight === 0) {
            rafId = requestAnimationFrame(mountMap);
            return;
          }

          const map = new maplibregl.Map({
            container,
            style: MAP_STYLE,
            center: [center.longitude, center.latitude],
            zoom,
            dragRotate: !lowPower,
            pitchWithRotate: !lowPower,
            attributionControl: false,
            maxBounds: maxBounds
              ? [
                  [maxBounds.southWest.longitude, maxBounds.southWest.latitude],
                  [maxBounds.northEast.longitude, maxBounds.northEast.latitude],
                ]
              : undefined,
          });

          mapRef.current = map;

          // Sync MapLibre's canvas to the container's real pixel size and force a
          // repaint. On desktop flex layouts the container can still report 0
          // height on the `load` frame, so resizing then paints an empty canvas
          // even though tiles are already fetched/cached — this is why the map
          // stayed blank until a manual zoom (which forced a fresh render).
          // resize() alone is insufficient: if MapLibre thinks its size is
          // unchanged it skips the repaint, so we also call triggerRepaint().
          const syncCanvas = () => {
            const m = mapRef.current;
            if (!m) return;
            const el = mapContainerRef.current;
            // Bail until the container has a real size; retry next frame.
            if (el && (el.clientWidth === 0 || el.clientHeight === 0)) {
              requestAnimationFrame(syncCanvas);
              return;
            }
            try {
              m.resize();
              m.triggerRepaint?.();
              m.redraw?.();
            } catch {
              // ignore
            }
          };

          const handleMapLoad = () => {
            mapStyleLoadedRef.current = true;
            syncCanvas();
            requestAnimationFrame(syncCanvas);
            setTimeout(syncCanvas, 150);
            setTimeout(syncCanvas, 400);
            applyMapInteractionLock(map, interactionLockedRef.current);

            // Recover from any later container size change (layout settle, tab
            // switch, split-pane resize) by re-syncing the canvas + repainting.
            if (
              typeof ResizeObserver !== "undefined" &&
              mapContainerRef.current &&
              !resizeObserverRef.current
            ) {
              const observer = new ResizeObserver(() => {
                if (!isMountedRef.current || !mapRef.current) return;
                syncCanvas();
              });
              observer.observe(mapContainerRef.current);
              resizeObserverRef.current = observer;
            }
          };

          if (isMapStyleReady(map)) {
            handleMapLoad();
          } else {
            map.on("load", handleMapLoad);
          }
        });
      };

      mountMap();

      const mkrById = markersByIdRef.current;

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        isMountedRef.current = false;
        mapStyleLoadedRef.current = false;
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
        }
        if (mapRef.current) {
          markersRef.current.forEach((m) => m.remove?.());
          markersRef.current = [];
          mkrById.clear();
          mapRef.current.remove?.();
          mapRef.current = null;
        }
      };
    }, [center.latitude, center.longitude, lowPower, maxBounds, zoom]);

    useEffect(() => {
      applyMapInteractionLock(mapRef.current, interactionLocked);
    }, [interactionLocked]);

    useEffect(() => {
      if (!mapRef.current || typeof window === "undefined") {
        return;
      }

      let cancelled = false;
      let loadListener: (() => void) | null = null;

      const syncMapOverlays = (maplibregl: MapLibreModuleLike) => {
        if (cancelled || !isMountedRef.current) return;
        const mapInstance = mapRef.current;
        if (!mapInstance || !isMapStyleReady(mapInstance)) return;

        try {
          markersRef.current.forEach((m) => m.remove?.());
          markersRef.current = [];
          markersByIdRef.current.clear();

          let shouldFitBounds = false;
          const activeLayers = resolvePolylineLayers(polylines, polyline, polylineColor);
          const currentPolylineStr = JSON.stringify(activeLayers);
          if (currentPolylineStr !== lastPolylineStrRef.current) {
            shouldFitBounds = true;
            lastPolylineStrRef.current = currentPolylineStr;
          }

          const activeIds = activeLayers.map((layer) => layer.id);
          for (const staleId of routeLayerIdsRef.current) {
            if (!activeIds.includes(staleId)) {
              removeRouteLayer(mapInstance, staleId);
            }
          }
          routeLayerIdsRef.current = activeIds;

          // India bounding box — fallback view when no route or markers
          const INDIA_BOUNDS: [[number, number], [number, number]] = [
            [68.1, 6.7],
            [97.4, 37.1],
          ];

          const allRoutePts: number[][] = [];
          for (const layer of activeLayers) {
            upsertRouteLayer(mapInstance, layer);
            layer.coordinates.forEach((p) => {
              allRoutePts.push([p.longitude, p.latitude]);
            });
          }

          if (shouldFitBounds && autoFitBoundsRef.current) {
            try {
              const routeCoords = allRoutePts.map(([lng, lat]) => ({
                latitude: lat,
                longitude: lng,
              }));
              const markerCoords = (Array.isArray(markers) ? markers : [])
                .filter((m) => m?.coordinate)
                .map((m) => m.coordinate);
              const expanded =
                boundsFromCoordinates(
                  routeCoords.length >= 2 ? routeCoords : markerCoords,
                ) ?? null;

              if (expanded) {
                mapInstance.fitBounds(
                  [
                    [expanded.sw.longitude, expanded.sw.latitude],
                    [expanded.ne.longitude, expanded.ne.latitude],
                  ],
                  {
                    padding: routeCoords.length >= 2 ? 80 : 100,
                    duration: lowPower ? 0 : 600,
                    maxZoom: DEFAULT_FIT_MAX_ZOOM,
                  },
                );
              } else if (markerCoords.length === 1) {
                const m = markerCoords[0];
                mapInstance.easeTo({
                  center: [m.longitude, m.latitude],
                  zoom: 8,
                  duration: lowPower ? 0 : 500,
                });
              } else {
                mapInstance.fitBounds(INDIA_BOUNDS, {
                  padding: 40,
                  duration: lowPower ? 0 : 600,
                  maxZoom: DEFAULT_FIT_MAX_ZOOM,
                });
              }
            } catch (e) {
              console.warn("[LeafletMap.web] Error fitting bounds:", e);
            }
          }

          const currentMarkers = Array.isArray(markers) ? markers : [];
          for (const m of currentMarkers) {
            if (!m || !m.coordinate) continue;
            const lat = m.coordinate.latitude;
            const lng = m.coordinate.longitude;
            const color = m.color || Theme.driverEmerald;
            const role = tripMapMarkerRoleFromId(m.id);
            const el = createTripMapMarkerElement(role, m.label, color, {
              avatarUri: m.avatarUri,
              avatarSeed: m.avatarSeed,
              isOnline: m.isOnline,
              highlighted: m.highlighted,
              kindIndex: m.kindIndex ?? kindIndexFromMarkerId(m.id) ?? undefined,
              clusterBadges: m.clusterBadges,
              nextLabel: m.nextLabel,
            });
            if (m.onPress) {
              el.style.cursor = "pointer";
              el.style.pointerEvents = "auto";
              el.setAttribute("role", "button");
              el.setAttribute(
                "aria-label",
                m.label?.trim() || (role === "driver" ? "View location" : "Map marker"),
              );
              el.addEventListener("click", (event) => {
                event.stopPropagation();
                m.onPress?.();
              });
            }
            const anchor =
              role === "origin" ||
              role === "destination" ||
              role === "driver" ||
              role === "truck" ||
              role === "live"
                ? "bottom"
                : "center";

            if (m.nudgeX) el.style.marginLeft = `${m.nudgeX}px`;
            const marker = new maplibregl.Marker({
              element: el,
              anchor,
            })
              .setLngLat([lng, lat])
              .addTo(mapInstance);
            markersRef.current.push(marker);
            if (m.id) markersByIdRef.current.set(String(m.id), marker);
          }

          for (const label of routeLabels ?? []) {
            if (!label?.coordinate || !label.text?.trim()) continue;
            const el = createRouteDistanceLabelElement(label.text);
            const labelMarker = new maplibregl.Marker({
              element: el,
              anchor: "center",
            })
              .setLngLat([label.coordinate.longitude, label.coordinate.latitude])
              .addTo(mapInstance);
            markersRef.current.push(labelMarker);
          }

          mapInstance.resize();
        } catch (e) {
          console.warn("[LeafletMap.web] Error syncing overlays:", e);
        }
      };

      const mapInstance = mapRef.current;
      const scheduleSync = (maplibregl: MapLibreModuleLike) => {
        if (isMapStyleReady(mapInstance)) {
          syncMapOverlays(maplibregl);
          return;
        }
        loadListener = () => {
          mapStyleLoadedRef.current = true;
          syncMapOverlays(maplibregl);
        };
        mapInstance.on("load", loadListener);
      };

      import("maplibre-gl").then((MapLibreModule) => {
        if (cancelled || !isMountedRef.current) return;
        const maplibregl =
          ((MapLibreModule as unknown) as { default?: MapLibreModuleLike }).default ??
          (MapLibreModule as unknown as MapLibreModuleLike);
        scheduleSync(maplibregl);
      });

      return () => {
        cancelled = true;
        if (loadListener && mapRef.current?.off) {
          mapRef.current.off("load", loadListener);
        }
      };
      // Do NOT depend on `center` / `zoom` — GPS ticks would tear down every marker
      // and look like a full map reload. Camera follows via focusCurrentLocation.
    }, [markers, polylines, routeLabels, polyline, polylineColor, maxBounds, lowPower]);

    const adjustZoom = useCallback(
      (delta: number) => {
        const map = mapRef.current;
        if (!map || interactionLockedRef.current) return;
        const current =
          typeof map.getZoom === "function" ? map.getZoom() : zoomLevelRef.current;
        const next = Math.max(3, Math.min(OSM_USEFUL_MAX_ZOOM, current + delta));
        zoomLevelRef.current = next;
        const mapCenter = map.getCenter?.();
        const lng = mapCenter?.lng ?? center.longitude;
        const lat = mapCenter?.lat ?? center.latitude;
        try {
          map.easeTo({
            center: [lng, lat],
            zoom: next,
            duration: lowPower ? 0 : 280,
          });
        } catch {
          // Map may not be ready
        }
      },
      [center.latitude, center.longitude, lowPower],
    );

    const syncCanvasAfterLayout = useCallback(() => {
      const m = mapRef.current;
      const el = mapContainerRef.current;
      if (!m || !el) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        m.resize();
        m.triggerRepaint?.();
        m.redraw?.();
      } catch {
        // ignore
      }
    }, []);

    React.useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        const map = mapRef.current;
        const boundedCenter = clampToBounds(currentCenter, maxBounds);
        const rawZoom =
          currentZoom !== undefined
            ? currentZoom
            : typeof map?.getZoom === "function"
              ? map.getZoom()
              : zoomLevelRef.current;
        const resolvedZoom = Math.max(
          3,
          Math.min(OSM_USEFUL_MAX_ZOOM, rawZoom ?? 15),
        );
        zoomLevelRef.current = resolvedZoom;
        map?.easeTo({
          center: [boundedCenter.longitude, boundedCenter.latitude],
          zoom: resolvedZoom,
          duration: lowPower ? 0 : 450,
        });
      },
      setMarkerCoordinate: (id, coordinate) => {
        const marker = markersByIdRef.current.get(String(id));
        if (!marker || typeof marker.setLngLat !== "function") return;
        try {
          marker.setLngLat([coordinate.longitude, coordinate.latitude]);
        } catch {
          // marker may have been removed mid-sync
        }
      },
      fitBounds: (ne, sw, paddingPx = 80, maxZoom = DEFAULT_FIT_MAX_ZOOM) => {
        if (!mapRef.current) return;
        const expanded = boundsFromCoordinates([ne, sw]);
        if (!expanded) return;
        try {
          mapRef.current.fitBounds(
            [
              [expanded.sw.longitude, expanded.sw.latitude],
              [expanded.ne.longitude, expanded.ne.latitude],
            ],
            {
              padding: paddingPx,
              duration: lowPower ? 0 : 600,
              maxZoom: Math.min(OSM_USEFUL_MAX_ZOOM, maxZoom),
            },
          );
        } catch {
          // Map may not be ready
        }
      },
      zoomIn: () => adjustZoom(1),
      zoomOut: () => adjustZoom(-1),
    }));

    const showZoom = showZoomControls && !interactionLocked;

    return (
      <View
        style={[style, styles.mapHost]}
        onLayout={syncCanvasAfterLayout}
      >
        {/* Absolute-fill (not height:100%) so the canvas gets a resolved pixel
            size even when the host's flex height settles a frame after mount —
            percentage height against an unresolved parent reads 0 and paints a
            blank canvas on desktop. */}
        <div
          ref={mapContainerRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            // Light fill while style/tiles load — matches Positron, avoids black void.
            backgroundColor: "#e8eef2",
          }}
        />
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => adjustZoom(1)}
            onZoomOut={() => adjustZoom(-1)}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  mapHost: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "100%",
    backgroundColor: "#e8eef2",
  },
});

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((c) => [c.latitude, c.longitude]);
}
