/**
 * Web-only trip map using Leaflet with road routing via routingService.ts.
 */
import {
  INDIA_MAP_CENTER,
  lookupIndianCityCoordinate,
} from '@/lib/indianCityCoordinates.util';
import { getOptimalRoute, type RouteResult } from '@/lib/routingService';
import {
  buildDriverAvatarMarkerHtml,
  MAP_DESTINATION_PIN_HTML,
  MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR,
  MAP_DRIVER_AVATAR_MARKER_ICON_SIZE,
  MAP_SOURCE_PIN_HTML,
} from '@/lib/mapMarkerIcons.util';
import { LeafletLiveTruckLayer } from '@/features/tracking/map/LeafletLiveTruckLayer';
import {
  liveTrailSignature,
  tripMapStructureKey,
} from '@/features/trips/utils/tripMapLiveTrail.util';
import {
  detectTrackingGaps,
  detectTripHalts,
  haltIndexSet,
  summarizeTripHalts,
  type TripHalt,
} from '@/features/trips/utils/tripHalts.util';
import { resolveMapLocationLabel } from '@/lib/mapLocationLabel.service';
import {
  endMarkerHtml,
  formatStatDuration,
  formatStopDuration,
  formatTrailDate,
  formatTrailTime,
  gapTagHtml,
  haltCardHtml,
  haltPillHtml,
  setHaltPillSelected,
  shortPlaceName,
  startMarkerHtml,
  TRAIL_COLORS,
  TRAIL_PING_MIN_SPACING_PX,
  trailCardHtml,
  tripCardHtml,
  trailSpansDays,
  type TripCardRow,
} from './tripMapTrailMarkers.web';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';
import React, { useEffect, useRef, useState } from 'react';

/** Metro web cannot bundle leaflet.css (relative url(images/...) in CSS). Load from CDN instead. */
const LEAFLET_CSS_VERSION = '1.9.4';
const LEAFLET_CSS_LINK_ID = 'leaflet-dist-css';
const NOMINATIM_TIMEOUT_MS = 2_000;
const geocodeCache = new Map<string, [number, number]>();
const leafletReady =
  typeof window !== 'undefined' ? import('leaflet') : null;

function ensureLeafletStylesheet(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEAFLET_CSS_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = LEAFLET_CSS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_CSS_VERSION}/dist/leaflet.css`;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

const getFallbackCoordinates = (location?: string): [number, number] => {
  if (!location) return [INDIA_MAP_CENTER.latitude, INDIA_MAP_CENTER.longitude];
  const hit = lookupIndianCityCoordinate(location);
  if (hit) return [hit.latitude, hit.longitude];
  return [INDIA_MAP_CENTER.latitude, INDIA_MAP_CENTER.longitude];
};

const getCoordinates = async (location: string): Promise<[number, number]> => {
  const key = location.trim().toLowerCase();
  if (!key) return getFallbackCoordinates(location);
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  const local = lookupIndianCityCoordinate(location);
  if (local) {
    const coords: [number, number] = [local.latitude, local.longitude];
    geocodeCache.set(key, coords);
    return coords;
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)},India&format=json&limit=1&countrycodes=IN`,
      { signal: controller.signal, headers: { Accept: 'application/json' }, mode: 'cors' },
    );
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
      const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocodeCache.set(key, coords);
      return coords;
    }
  } catch {
    /* city centroid / India center is enough for first paint */
  }
  const fallback = getFallbackCoordinates(location);
  geocodeCache.set(key, fallback);
  return fallback;
};

function isLatLngObject(
  coords: { latitude: number; longitude: number } | [number, number] | null | undefined,
): coords is { latitude: number; longitude: number } {
  return coords != null && !Array.isArray(coords) && isValidCoordinatePair(coords);
}

function isValidCoordinatePair(
  coords:
    | { latitude: number; longitude: number }
    | [number, number]
    | null
    | undefined,
): boolean {
  if (!coords) return false;
  const latitude = Array.isArray(coords) ? coords[0] : coords.latitude;
  const longitude = Array.isArray(coords) ? coords[1] : coords.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  // Sentinel/invalid location frequently appears as null-island coordinates.
  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return false;
  return true;
}

function toLatLngTuple(
  coords: { latitude: number; longitude: number },
): [number, number] {
  return [coords.latitude, coords.longitude];
}

// ── Trail helpers ────────────────────────────────────────────────────────────
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function etaFromLatLng(
  fromLat: number, fromLng: number, toLat: number, toLng: number, avgSpeedKmh = 50,
): { distanceKm: number; etaMinutes: number } {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { distanceKm: dist, etaMinutes: Math.round((dist / avgSpeedKmh) * 60) };
}

// ── Completed trip: connect saved driven points along roads ────────────────
const DRIVEN_SNAP_MAX_POINTS = 12;
const DRIVEN_SNAP_CONCURRENCY = 3;
/** Points closer than this are joined straight (no routing call). */
const DRIVEN_SNAP_MIN_GAP_KM = 0.15;

function downsampleIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < max; i++) out.add(Math.round((i * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Road-snapped driven path; `gapLines` are the no-signal stretches (drawn dashed). */
type SnappedDrivenPath = { latlngs: [number, number][]; gapLines: [number, number][][] };

/**
 * Road geometry through the driven points (one cached routing call per step,
 * ~11 at most, 3 at a time) — like a maps app, every step follows the roads,
 * including "no signal" stretches. A step whose road route fails, or detours
 * far beyond the straight distance, stays straight. `gapAfter`: trail indices i
 * whose step to i+1 is a no-signal gap; they are kept as sample points so the
 * dashed stretch starts and ends exactly at those pings.
 * Returns null when no step could be routed (caller keeps the straight line).
 */
async function snapDrivenPathToRoads(
  pts: { latitude: number; longitude: number }[],
  gapAfter: Set<number> = new Set(),
): Promise<SnappedDrivenPath | null> {
  const idxSet = new Set(downsampleIndices(pts.length, DRIVEN_SNAP_MAX_POINTS));
  gapAfter.forEach((i) => {
    if (i + 1 < pts.length) {
      idxSet.add(i);
      idxSet.add(i + 1);
    }
  });
  const idx = [...idxSet].sort((a, b) => a - b);
  if (idx.length < 2) return null;
  const steps = idx.slice(0, -1).map((fi, k) => ({
    from: pts[fi],
    to: pts[idx[k + 1]],
    noSignal: idx[k + 1] === fi + 1 && gapAfter.has(fi),
  }));
  const results: ([number, number][] | null)[] = new Array(steps.length).fill(null);
  let routedAny = false;
  let next = 0;
  const worker = async () => {
    while (next < steps.length) {
      const i = next++;
      const { from, to } = steps[i];
      const straightKm = etaFromLatLng(from.latitude, from.longitude, to.latitude, to.longitude).distanceKm;
      if (straightKm < DRIVEN_SNAP_MIN_GAP_KM) continue;
      try {
        const route = await getOptimalRoute(from, to);
        const roadKm = (route?.distance ?? 0) / 1000;
        if (route && route.coordinates.length > 1 && roadKm <= straightKm * 3 + 2) {
          results[i] = route.coordinates.map((c) => [c.latitude, c.longitude] as [number, number]);
          routedAny = true;
        }
      } catch {
        /* straight step */
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(DRIVEN_SNAP_CONCURRENCY, steps.length) }, () => worker()),
  );
  if (!routedAny) return null;
  const latlngs: [number, number][] = [];
  const gapLines: [number, number][][] = [];
  steps.forEach((st, i) => {
    const seg = results[i] ?? [
      [st.from.latitude, st.from.longitude] as [number, number],
      [st.to.latitude, st.to.longitude] as [number, number],
    ];
    latlngs.push(...(latlngs.length ? seg.slice(1) : seg));
    if (st.noSignal) gapLines.push(seg);
  });
  return { latlngs, gapLines };
}

/** The point halfway along a polyline, by distance. */
function midpointAlong(seg: [number, number][]): [number, number] {
  if (seg.length === 1) return seg[0];
  const cum: number[] = [0];
  for (let i = 1; i < seg.length; i++) {
    const [a, b] = [seg[i - 1], seg[i]];
    cum.push(cum[i - 1] + etaFromLatLng(a[0], a[1], b[0], b[1]).distanceKm);
  }
  const half = cum[cum.length - 1] / 2;
  for (let i = 1; i < seg.length; i++) {
    if (cum[i] >= half) {
      const span = cum[i] - cum[i - 1];
      const f = span > 0 ? (half - cum[i - 1]) / span : 0;
      return [seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * f, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * f];
    }
  }
  return seg[seg.length - 1];
}

// ── Props ───────────────────────────────────────────────────────────────────
export interface TripMapProps {
  source?: string | null;
  destination?: string | null;
  sourceCoords?: { latitude: number; longitude: number } | null;
  destCoords?: { latitude: number; longitude: number } | null;
  truckLocation?: { latitude: number; longitude: number } | null;
  truckStatus?: { truckNo?: string; speed?: number; ignitionStatus?: boolean; location?: string; lastUpdated?: string } | null;
  /** GPS pings from `driver_locations` (chronological). Shown as dots on top of the road route. */
  dbLocationTrail?: { latitude: number; longitude: number; recorded_at?: string }[];
  intermediateStops?: string[];
  /** Pixel height or a CSS height string (e.g. `"100%"`) to fill the parent. */
  height?: number | string;
  onDistanceCalculated?: (distanceKm: string) => void;
  /** When set, attaches LeafletLiveTruckLayer instead of a static pin. */
  tripId?: string | null;
  /** Must be true for live layer to attach; false = static pin fallback. */
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
  /**
   * Completed trip: draw `dbLocationTrail` as the bold driven route (road-snapped
   * when routing is available), fade the planned route, show a legend.
   */
  completedTrip?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────
export function TripMap({
  source, destination, sourceCoords, destCoords,
  truckLocation, truckStatus,
  dbLocationTrail = [],
  intermediateStops = [],
  height,
  onDistanceCalculated,
  tripId,
  trackingEnabled,
  fitPaddingBottom = 48,
  fitPaddingRight = 40,
  driverAvatarUri,
  driverAvatarSeed,
  driverOnline,
  completedTrip = false,
}: TripMapProps) {
  const resolvedHeight = height ?? 520;
  const compactMapPreview =
    typeof resolvedHeight === "number" && resolvedHeight <= 460;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const unmountedRef = useRef(false);
  const initRunIdRef = useRef(0);
  const liveLayerRef = useRef<LeafletLiveTruckLayer | null>(null);
  const trailPointsRef = useRef(dbLocationTrail);
  trailPointsRef.current = dbLocationTrail;
  const paintTrailRef = useRef<
    | ((
        points: { latitude: number; longitude: number; recorded_at?: string }[],
      ) => void)
    | null
  >(null);
  const trailLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const trailEtaElRef = useRef<HTMLElement | null>(null);
  const completedTripRef = useRef(completedTrip);
  completedTripRef.current = completedTrip;
  /** Bumped on every trail paint so late road-snap results never draw over a newer paint. */
  const trailPaintSeqRef = useRef(0);
  const trailLegendElRef = useRef<HTMLElement | null>(null);
  /** zoomend listener that shows/hides moving dots; removed on every repaint. */
  const trailZoomHandlerRef = useRef<(() => void) | null>(null);
  // Side-channel map lifecycle refs — avoids tagging the map instance with custom props.
  const mapRafIdRef = useRef<number | null>(null);
  const mapTimeoutIdsRef = useRef<number[]>([]);
  const mapResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocodingProgress, setGeocodingProgress] = useState({ current: 0, total: 0 });

  const initializeMap = async () => {
    try {
      unmountedRef.current = false;
      const runId = ++initRunIdRef.current;
      const isRunActive = () => !unmountedRef.current && runId === initRunIdRef.current;
      setIsLoading(true);
      setError(null);

      ensureLeafletStylesheet();
      const leafletMod = leafletReady ? await leafletReady : await import('leaflet');
      const L = leafletMod.default;
      if (!isRunActive()) return;
      // Resolve every missing pin at once. Sequential Nominatim calls made the
      // map sit on a spinner for several seconds before the first tile.
      const stopLabels = intermediateStops.filter((stop) => stop?.trim());
      setGeocodingProgress({ current: 0, total: 2 + stopLabels.length });

      const [srcCoords, dstCoords, ...resolvedStops] = await Promise.all([
        isLatLngObject(sourceCoords)
          ? Promise.resolve(toLatLngTuple(sourceCoords))
          : source
            ? getCoordinates(source)
            : Promise.reject(new Error('Source location required')),
        isLatLngObject(destCoords)
          ? Promise.resolve(toLatLngTuple(destCoords))
          : destination
            ? getCoordinates(destination)
            : Promise.reject(new Error('Destination location required')),
        ...stopLabels.map((stop) => getCoordinates(stop)),
      ]);
      if (!isRunActive()) return;
      const stopCoords = stopLabels.map((location, idx) => ({
        location,
        coords: resolvedStops[idx],
      }));

      // ── Center ───────────────────────────────────────────────────────────
      const allCoords = [srcCoords, dstCoords, ...stopCoords.map((s) => s.coords)];
      const avgLat = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
      const avgLng = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;

      // ── Clean up old instance ────────────────────────────────────────────
      // stop() → remove() → off(), same ordering rationale as the unmount
      // cleanup below: a bare off() first would strip the internal listeners
      // remove() needs, leaving a detached pane behind (GX-PULSE-X). This path
      // runs far more often than unmount — the effect re-runs on every truck
      // location update — so it is the likelier origin of the crash.
      const prev = mapInstanceRef.current;
      if (prev) {
        try { prev.stop?.(); } catch { /* ignore */ }
        try { prev.remove(); } catch { /* ignore */ }
        try { prev.off?.(); } catch { /* ignore */ }
        mapInstanceRef.current = null;
      }
      if (!mapRef.current || !isRunActive()) return;

      // ── Create map ───────────────────────────────────────────────────────
      // zoomAnimation off: the transition timer survives map.remove(), so an
      // unmount mid-zoom crashes inside Leaflet's _onZoomTransitionEnd.
      const map = L.map(mapRef.current, {
        zoomControl: false,
        zoomAnimation: false,
      }).setView([avgLat, avgLng], 7);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        errorTileUrl:
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk1hcCBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==',
      }).addTo(map);
      if (isRunActive()) setIsLoading(false);

      // ── Markers (identical SVG icons as reference) ───────────────────────
      const sourceIcon = L.divIcon({
        html: MAP_SOURCE_PIN_HTML,
        className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -40],
      });

      const destinationIcon = L.divIcon({
        html: MAP_DESTINATION_PIN_HTML,
        className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -40],
      });

      const intermediateStopIcon = L.divIcon({
        html: `<svg width="24" height="32" viewBox="0 0 24 32" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.15));">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#f59e0b"/>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10z" fill="#fbbf24"/>
          <circle cx="12" cy="12" r="5" fill="#fff"/><circle cx="12" cy="12" r="2.5" fill="#f59e0b"/>
        </svg>`,
        className: '', iconSize: [24, 32], iconAnchor: [12, 32], popupAnchor: [0, -32],
      });

      const liveDriverIcon = L.divIcon({
        html: buildDriverAvatarMarkerHtml(
          driverAvatarUri,
          driverAvatarSeed,
          driverOnline ?? Boolean(trackingEnabled),
        ),
        className: '',
        iconSize: MAP_DRIVER_AVATAR_MARKER_ICON_SIZE,
        iconAnchor: MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR,
      });

      L.marker(srcCoords, { icon: sourceIcon })
        .bindPopup(`<strong>From:</strong> ${source ?? 'Origin'}`)
        .addTo(map);

      L.marker(dstCoords, { icon: destinationIcon })
        .bindPopup(`<strong>To:</strong> ${destination ?? 'Destination'}`)
        .addTo(map);

      stopCoords.forEach((stop, idx) => {
        L.marker(stop.coords, { icon: intermediateStopIcon })
          .bindPopup(`<strong>Stop ${idx + 1}:</strong> ${stop.location}`)
          .addTo(map);
      });

      if (tripId && trackingEnabled) {
        // Live layer: subscribes to TripTrackingMapStore → RAF → marker.setLatLng()
        // Detaches on map cleanup below. Static truckLocation prop ignored when live.
        liveLayerRef.current?.detach();
        const seedLatLng: [number, number] | undefined = isLatLngObject(truckLocation)
          ? toLatLngTuple(truckLocation)
          : undefined;
        const layer = new LeafletLiveTruckLayer(tripId, map, L, {
          avatarUri: driverAvatarUri,
          avatarSeed: driverAvatarSeed,
          isOnline: driverOnline ?? true,
        });
        layer.attach(seedLatLng);
        liveLayerRef.current = layer;
      } else if (isLatLngObject(truckLocation)) {
        const truckMarker = L.marker(toLatLngTuple(truckLocation), {
          icon: liveDriverIcon,
          zIndexOffset: 1000,
        });
        if (truckStatus) {
          const updated =
            truckStatus.lastUpdated != null
              ? `<div style="font-size:10px;color:#64748b;margin-top:6px;">Updated ${new Date(truckStatus.lastUpdated).toLocaleString()}</div>`
              : '';
          const popupContent = `
            <div style="font-family:system-ui,sans-serif;padding:4px;min-width:200px;">
              <div style="font-weight:600;margin-bottom:4px;font-size:14px;">${truckStatus.truckNo ?? 'Driver'}</div>
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;color:${(truckStatus.speed ?? 0) > 0 ? '#16a34a' : '#666'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${(truckStatus.speed ?? 0) > 0 ? '#16a34a' : '#666'};"></span>
                <span style="font-size:12px;">${truckStatus.speed ?? 0} km/h</span>
              </div>
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;color:${truckStatus.ignitionStatus ? '#16a34a' : '#666'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${truckStatus.ignitionStatus ? '#16a34a' : '#666'};"></span>
                <span style="font-size:12px;">Engine ${truckStatus.ignitionStatus ? 'On' : 'Off'}</span>
              </div>
              ${truckStatus.location ? `<div style="font-size:11px;color:#666;margin-top:4px;">📍 ${truckStatus.location}</div>` : ''}
              ${updated}
            </div>
          `;
          truckMarker.bindPopup(popupContent, { closeButton: false, maxWidth: 300, minWidth: 200 });
          truckMarker.openPopup();
        } else {
          truckMarker.bindPopup(
            '<div style="font-family:system-ui,sans-serif;font-size:12px;padding:6px;"><strong>Live driver</strong><br/><span style="color:#64748b;">GPS position</span></div>',
            { closeButton: true },
          );
        }
        truckMarker.addTo(map);
      }

      // ── Trail markers shared by live + completed trails ──────────────────
      /** Tap card whose place name is looked up only when it first opens. */
      const bindTrailCard = (
        layer: import('leaflet').Layer,
        latitude: number,
        longitude: number,
        render: (place: string | null | undefined) => string,
      ) => {
        let looked = false;
        layer.bindPopup(render(undefined), { closeButton: true, minWidth: 200, maxWidth: 280 });
        layer.on('popupopen', () => {
          if (looked) return;
          looked = true;
          void resolveMapLocationLabel(latitude, longitude)
            .then((label) => {
              if (!isRunActive()) return;
              try { layer.setPopupContent(render(label ?? null)); } catch { /* layer gone */ }
            })
            .catch(() => {
              try { layer.setPopupContent(render(null)); } catch { /* layer gone */ }
            });
        });
      };

      /**
       * Halt pills with HALT cards. The pill turns route-orange while its card is
       * open; `onSelect` lets the trip card highlight the same row.
       */
      const addHaltMarkers = (
        target: import('leaflet').LayerGroup,
        halts: TripHalt[],
        trailLength: number,
        withDate: boolean,
        onSelect?: (index: number | null) => void,
      ): import('leaflet').Marker[] =>
        halts.map((h, i) => {
          const lifted = h.firstIndex === 0 || h.lastIndex === trailLength - 1;
          const marker = L.marker([h.latitude, h.longitude], {
            icon: L.divIcon({
              html: haltPillHtml(h, lifted),
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 0],
              popupAnchor: [0, lifted ? -40 : -14],
            }),
            zIndexOffset: 400 + Math.min(200, Math.round(h.durationMs / 60_000)),
            title: `Halt · ${formatStopDuration(h.durationMs)}`,
          });
          bindTrailCard(marker, h.latitude, h.longitude, (place) =>
            haltCardHtml(h, i, halts.length, withDate, place),
          );
          marker.on('popupopen', () => {
            setHaltPillSelected(marker.getElement(), true);
            onSelect?.(i);
          });
          marker.on('popupclose', () => {
            setHaltPillSelected(marker.getElement(), false);
            onSelect?.(null);
          });
          marker.addTo(target);
          return marker;
        });

      /**
       * Keep GPS ping dots readable at every zoom: a dot closer than
       * TRAIL_PING_MIN_SPACING_PX on screen to the last shown one is hidden;
       * zooming in brings it back. Re-run on every zoom.
       */
      const thinPingDots = (
        target: import('leaflet').FeatureGroup,
        dots: import('leaflet').CircleMarker[],
      ): (() => void) => {
        const sync = () => {
          try {
            let lastShown: import('leaflet').Point | null = null;
            for (const d of dots) {
              const pt = map.latLngToLayerPoint(d.getLatLng());
              const keep = !lastShown || pt.distanceTo(lastShown) >= TRAIL_PING_MIN_SPACING_PX;
              if (keep) {
                lastShown = pt;
                if (!target.hasLayer(d)) target.addLayer(d);
              } else if (target.hasLayer(d)) {
                target.removeLayer(d);
              }
            }
          } catch { /* map torn down */ }
        };
        sync();
        return sync;
      };

      /**
       * Top-left trip card: status, route, Moving / Stopped / GPS pings, and a
       * collapsible timeline (start → halts → end). Tapping a halt row zooms to it
       * and opens its card. Place names are looked up only while it is open.
       */
      const mountTripCard = (opts: {
        status: 'completed' | 'tracking';
        pts: { latitude: number; longitude: number; recorded_at?: string }[];
        halts: TripHalt[];
        haltMarkers: import('leaflet').Marker[];
        withDate: boolean;
        showGapKey: boolean;
        defaultExpanded: boolean;
      }): { el: HTMLElement; setSelected: (index: number | null) => void } => {
        const { status, pts, halts, haltMarkers, withDate } = opts;
        const first = pts[0];
        const last = pts[pts.length - 1];
        const { stoppedMs, movingMs } = summarizeTripHalts(pts, halts);
        const src = shortPlaceName(source);
        const dst = shortPlaceName(destination);
        const rows: TripCardRow[] = [
          { kind: 'start', title: 'Started', iso: first?.recorded_at, placeKey: 'start' },
          ...halts.map((halt, index) => ({ kind: 'halt' as const, halt, index, placeKey: `h${index}` })),
          ...(status === 'completed'
            ? [{ kind: 'end' as const, title: 'Ended', iso: last?.recorded_at, placeKey: 'end' }]
            : []),
        ];
        const coordsFor = (key: string): { latitude: number; longitude: number } | null => {
          if (key === 'start') return first ?? null;
          if (key === 'end') return last ?? null;
          return halts[Number(key.slice(1))] ?? null;
        };
        const places: Record<string, string | null | undefined> = {};
        let expanded = opts.defaultExpanded;
        let selected: number | null = null;

        const el = document.createElement('div');
        el.style.cssText =
          'position:absolute;top:10px;left:10px;z-index:1000;width:300px;max-width:calc(100% - 20px);' +
          'background:#ffffff;border-radius:12px;overflow:hidden;' +
          'box-shadow:0 4px 20px rgba(15,23,42,0.10),0 1px 3px rgba(15,23,42,0.06);';

        const lookUpPlaces = () => {
          for (const r of rows.slice(0, 15)) {
            if (r.placeKey in places) continue;
            const c = coordsFor(r.placeKey);
            if (!c) continue;
            places[r.placeKey] = undefined;
            void resolveMapLocationLabel(c.latitude, c.longitude)
              .then((label) => {
                places[r.placeKey] = label ?? null;
                if (!isRunActive()) return;
                const node = el.querySelector(`[data-place-key="${r.placeKey}"]`);
                if (node) node.textContent = label ?? '';
              })
              .catch(() => {
                places[r.placeKey] = null;
              });
          }
        };

        const render = () => {
          el.innerHTML = tripCardHtml({
            status,
            dateLabel: formatTrailDate(first?.recorded_at),
            title: src && dst ? `${src} → ${dst}` : src || dst,
            subtitle:
              status === 'completed'
                ? `${formatTrailTime(first?.recorded_at, withDate)} – ${formatTrailTime(last?.recorded_at, withDate)}`
                : `Since ${formatTrailTime(first?.recorded_at, withDate)}`,
            stats: [
              ...(movingMs != null ? [{ label: 'Moving', value: formatStatDuration(movingMs) }] : []),
              { label: 'Stopped', value: formatStatDuration(stoppedMs) },
              { label: 'GPS pings', value: String(pts.length) },
            ],
            rows,
            withDate,
            expanded,
            selectedHaltIndex: selected,
            places,
            showGapKey: opts.showGapKey,
          });
          if (expanded) lookUpPlaces();
        };
        render();

        el.addEventListener('click', (ev) => {
          const target = ev.target as HTMLElement | null;
          if (!target) return;
          if (target.closest('[data-trip-card-toggle]')) {
            expanded = !expanded;
            render();
            return;
          }
          const row = target.closest('[data-halt-index]') as HTMLElement | null;
          if (!row) return;
          const idx = Number(row.getAttribute('data-halt-index'));
          const h = halts[idx];
          const m = haltMarkers[idx];
          if (!h || !m || !isRunActive()) return;
          try {
            map.setView([h.latitude, h.longitude], Math.max(map.getZoom(), 14), { animate: false });
            m.openPopup();
          } catch { /* map torn down */ }
        });
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
        map.getContainer().appendChild(el);
        return {
          el,
          setSelected: (index) => {
            if (selected === index) return;
            selected = index;
            render();
          },
        };
      };

      // ── Completed trip: driven route (+ road snap), GPS pings, halts, gaps ──
      const paintCompletedPath = (
        pts: { latitude: number; longitude: number; recorded_at?: string }[],
      ) => {
        const seq = ++trailPaintSeqRef.current;
        const withDate = trailSpansDays(pts);
        const halts = pts.length > 1 ? detectTripHalts(pts) : [];
        const inHalt = haltIndexSet(halts);
        const gaps = pts.length > 1 ? detectTrackingGaps(pts) : [];
        const gapAfter = new Set(gaps.map((g) => g.fromIndex));

        const group = L.featureGroup();
        const lineGroup = L.featureGroup().addTo(group);
        const pingGroup = L.featureGroup().addTo(group);
        const pingDots: import('leaflet').CircleMarker[] = [];
        const gapTags: import('leaflet').Marker[] = [];
        const drawLine = (latlngs: [number, number][], gapLines: [number, number][][]) => {
          lineGroup.clearLayers();
          if (latlngs.length < 2) return;
          // White casing under a solid line — readable on any basemap.
          L.polyline(latlngs, {
            color: '#ffffff', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
          }).addTo(lineGroup);
          L.polyline(latlngs, {
            color: TRAIL_COLORS.route, weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round',
          }).addTo(lineGroup);
          // No-signal stretches: same road path, drawn dashed slate (no GPS saved there).
          gapLines.forEach((seg, i) => {
            if (seg.length < 2) return;
            L.polyline(seg, {
              color: '#ffffff', weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round',
            }).addTo(lineGroup);
            L.polyline(seg, {
              color: TRAIL_COLORS.slate, weight: 3, opacity: 1, dashArray: '5 6', lineCap: 'round', lineJoin: 'round',
            }).addTo(lineGroup);
            try { gapTags[i]?.setLatLng(midpointAlong(seg)); } catch { /* ignore */ }
          });
          try { pingGroup.bringToFront(); } catch { /* ignore */ }
        };
        const straightGapLines = (): [number, number][][] =>
          gaps.map((g) => {
            const a = pts[g.fromIndex];
            const b = pts[g.fromIndex + 1];
            return [[a.latitude, a.longitude], [b.latitude, b.longitude]];
          });

        const first = pts[0];
        const last = pts[pts.length - 1];

        // GPS pings: white beads with a dark-orange ring. Hover = time, tap = card.
        pts.slice(1, -1).forEach((p, k) => {
          if (inHalt.has(k + 1)) return;
          const dot = L.circleMarker([p.latitude, p.longitude], {
            radius: 4, color: TRAIL_COLORS.routeDark, weight: 2, fillColor: '#ffffff', fillOpacity: 1,
          });
          dot.bindTooltip(formatTrailTime(p.recorded_at, withDate), {
            direction: 'top', offset: [0, -4], opacity: 0.95,
          });
          bindTrailCard(dot, p.latitude, p.longitude, (place) =>
            trailCardHtml({
              label: 'GPS ping',
              value: formatTrailTime(p.recorded_at, withDate),
              lines: ['Driver passed here'],
              place,
            }),
          );
          pingDots.push(dot);
        });
        const syncPings = thinPingDots(pingGroup, pingDots);

        if (pts.length > 1) {
          const startTime = formatTrailTime(first.recorded_at, withDate);
          const startMarker = L.marker([first.latitude, first.longitude], {
            icon: L.divIcon({
              html: startMarkerHtml(startTime),
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 0],
              popupAnchor: [0, -10],
            }),
            zIndexOffset: 300,
            title: 'Tracking started',
          });
          bindTrailCard(startMarker, first.latitude, first.longitude, (place) =>
            trailCardHtml({ label: 'Tracking started', value: startTime, lines: [], place }),
          );
          startMarker.addTo(group);

          const endTime = formatTrailTime(last.recorded_at, withDate);
          const endMarker = L.marker([last.latitude, last.longitude], {
            icon: L.divIcon({
              html: endMarkerHtml(endTime),
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 0],
              popupAnchor: [0, -11],
            }),
            zIndexOffset: 350,
            title: 'Trip ended',
          });
          bindTrailCard(endMarker, last.latitude, last.longitude, (place) =>
            trailCardHtml({ label: 'Trip ended', value: endTime, lines: ['Last GPS fix of the trip'], place }),
          );
          endMarker.addTo(group);

          straightGapLines().forEach((seg, i) => {
            gapTags.push(
              L.marker(midpointAlong(seg), {
                icon: L.divIcon({ html: gapTagHtml(gaps[i].durationMs), className: '', iconSize: [0, 0], iconAnchor: [0, 0] }),
                interactive: false,
                keyboard: false,
                zIndexOffset: 200,
              }),
            );
          });
        } else {
          // Driver never moved: single "last location" dot (unchanged).
          const lastDot = L.circleMarker([last.latitude, last.longitude], {
            radius: 8, color: '#ffffff', weight: 3, fillColor: TRAIL_COLORS.routeDark, fillOpacity: 1,
          });
          bindTrailCard(lastDot, last.latitude, last.longitude, (place) =>
            trailCardHtml({
              label: 'Last location',
              value: formatTrailTime(last.recorded_at, withDate),
              lines: [],
              place,
            }),
          );
          lastDot.addTo(group);
        }

        let card: { el: HTMLElement; setSelected: (index: number | null) => void } | null = null;
        const haltMarkers = addHaltMarkers(
          group as unknown as import('leaflet').LayerGroup,
          halts,
          pts.length,
          withDate,
          (index) => card?.setSelected(index),
        );
        drawLine(pts.map((p) => [p.latitude, p.longitude] as [number, number]), straightGapLines());

        // "No signal" tags: hidden while they would sit on the start/end tags,
        // a halt pill or another tag (they come back as you zoom in).
        const tagGroup = L.featureGroup().addTo(group);
        const syncGapTags = () => {
          try {
            const busy: import('leaflet').Point[] = [first, last, ...halts].map((p) =>
              map.latLngToLayerPoint([p.latitude, p.longitude]),
            );
            gapTags.forEach((tag) => {
              const pt = map.latLngToLayerPoint(tag.getLatLng());
              const clash = busy.some((b) => Math.abs(b.x - pt.x) < 110 && Math.abs(b.y - pt.y) < 26);
              if (clash) {
                if (tagGroup.hasLayer(tag)) tagGroup.removeLayer(tag);
              } else {
                if (!tagGroup.hasLayer(tag)) tagGroup.addLayer(tag);
                busy.push(pt);
              }
            });
          } catch { /* map torn down */ }
        };
        syncGapTags();
        const syncTrailLabels = () => {
          syncPings();
          syncGapTags();
        };
        map.on('zoomend', syncTrailLabels);
        trailZoomHandlerRef.current = syncTrailLabels;
        group.addTo(map);
        trailLayerRef.current = group as unknown as import('leaflet').LayerGroup;

        if (pts.length > 1) {
          card = mountTripCard({
            status: 'completed',
            pts,
            halts,
            haltMarkers,
            withDate,
            showGapKey: gaps.length > 0,
            defaultExpanded: !compactMapPreview,
          });
          trailLegendElRef.current = card.el;
        }

        if (pts.length < 2) return;
        void snapDrivenPathToRoads(pts, gapAfter)
          .then((roadLatLngs) => {
            if (!roadLatLngs) return;
            if (seq !== trailPaintSeqRef.current) return;
            if (!isRunActive()) return;
            if (trailLayerRef.current !== (group as unknown)) return;
            drawLine(roadLatLngs.latlngs, roadLatLngs.gapLines);
            syncGapTags();
          })
          .catch(() => {
            /* keep the straight driven line */
          });
      };

      // ── DB GPS trail — only this layer is replaced when points change ─────
      const paintGpsTrail = (
        points: { latitude: number; longitude: number; recorded_at?: string }[],
      ) => {
        if (trailLayerRef.current) {
          try { map.removeLayer(trailLayerRef.current); } catch { /* map may be gone */ }
          trailLayerRef.current = null;
        }
        if (trailEtaElRef.current) {
          trailEtaElRef.current.remove();
          trailEtaElRef.current = null;
        }
        if (trailLegendElRef.current) {
          trailLegendElRef.current.remove();
          trailLegendElRef.current = null;
        }
        if (trailZoomHandlerRef.current) {
          try { map.off('zoomend', trailZoomHandlerRef.current); } catch { /* map may be gone */ }
          trailZoomHandlerRef.current = null;
        }
        const validTrailPoints = (Array.isArray(points) ? points : []).filter((p) =>
          isValidCoordinatePair(p),
        );
        if (validTrailPoints.length === 0) return;
        if (completedTripRef.current) {
          paintCompletedPath(validTrailPoints);
          return;
        }
        const total = validTrailPoints.length;
        const trailGroup = L.layerGroup();
        // Clumps of pings where the driver stayed ≥5 min become one halt pill.
        const liveHalts = total > 1 ? detectTripHalts(validTrailPoints) : [];
        const liveInHalt = haltIndexSet(liveHalts);
        const liveWithDate = trailSpansDays(validTrailPoints);

        // Dashed polyline connecting all pings in order
        if (validTrailPoints.length > 1) {
          L.polyline(
            validTrailPoints.map((p) => [p.latitude, p.longitude] as [number, number]),
            { color: '#fb923c', weight: 2, dashArray: '4 6', opacity: 0.65 },
          ).addTo(trailGroup);
        }

        // Directional arrows at midpoints between consecutive pings
        validTrailPoints.forEach((p, idx) => {
          if (idx === 0) return;
          const prev = validTrailPoints[idx - 1];
          const midLat = (prev.latitude + p.latitude) / 2;
          const midLng = (prev.longitude + p.longitude) / 2;
          const bearing = bearingDeg(prev.latitude, prev.longitude, p.latitude, p.longitude);
          const arrowIcon = L.divIcon({
            html: `<div style="transform:rotate(${bearing}deg);color:#c2410c;font-size:10px;line-height:1;">▲</div>`,
            className: '',
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([midLat, midLng], { icon: arrowIcon }).addTo(trailGroup);
        });

        // Ping dots with enhanced popups (no raw lat/lng)
        validTrailPoints.forEach((p, idx) => {
          if (liveInHalt.has(idx)) return;
          const timeStr = p.recorded_at
            ? new Date(p.recorded_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '—';
          const relativeTime = (() => {
            if (!p.recorded_at) return '';
            const diffMs = Date.now() - new Date(p.recorded_at).getTime();
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return 'just now';
            if (diffMin < 60) return `${diffMin} min ago`;
            const diffH = Math.floor(diffMin / 60);
            if (diffH < 24) return `${diffH} hour${diffH !== 1 ? 's' : ''} ago`;
            const diffD = Math.floor(diffH / 24);
            return `${diffD} day${diffD !== 1 ? 's' : ''} ago`;
          })();
          L.circleMarker([p.latitude, p.longitude], {
            // GPS ping bead (same as completed trips): white with dark-orange ring.
            radius: 5,
            fillColor: '#ffffff',
            color: TRAIL_COLORS.routeDark,
            weight: 2.5,
            opacity: 1,
            fillOpacity: 1,
          })
            .bindPopup(
              `<div style="font-family:system-ui,sans-serif;font-size:12px;padding:4px;min-width:160px;">` +
              `<strong>GPS ping ${idx + 1} of ${total}</strong><br/>` +
              `<span style="color:#64748b;">Time: ${timeStr}</span>` +
              (relativeTime ? `<br/><span style="color:#94a3b8;font-size:11px;">${relativeTime}</span>` : '') +
              `</div>`,
            )
            .addTo(trailGroup);
        });

        let liveCard: { el: HTMLElement; setSelected: (index: number | null) => void } | null = null;
        const liveHaltMarkers = addHaltMarkers(
          trailGroup,
          liveHalts,
          total,
          liveWithDate,
          (index) => liveCard?.setSelected(index),
        );

        trailGroup.addTo(map);
        trailLayerRef.current = trailGroup;
        // Trip card only when the driver has halted so far (collapsed by default).
        if (liveHalts.length > 0) {
          liveCard = mountTripCard({
            status: 'tracking',
            pts: validTrailPoints,
            halts: liveHalts,
            haltMarkers: liveHaltMarkers,
            withDate: liveWithDate,
            showGapKey: false,
            defaultExpanded: false,
          });
          trailLegendElRef.current = liveCard.el;
        }

        // ETA panel — from last trail point to destination (straight-line estimate)
        if (validTrailPoints.length > 0 && isValidCoordinatePair({ latitude: dstCoords[0], longitude: dstCoords[1] })) {
          const lastPt = validTrailPoints[validTrailPoints.length - 1];
          const eta = etaFromLatLng(lastPt.latitude, lastPt.longitude, dstCoords[0], dstCoords[1]);
          const etaH = Math.floor(eta.etaMinutes / 60);
          const etaM = eta.etaMinutes % 60;
          const etaStr = etaH > 0 ? `~${etaH}h ${etaM}m` : `~${etaM} min`;
          // Append ETA panel directly to map container to avoid Leaflet Control type issues.
          const etaPanelEl = document.createElement('div');
          etaPanelEl.style.cssText =
            'position:absolute;bottom:28px;left:10px;z-index:1000;pointer-events:none;';
          etaPanelEl.innerHTML =
            `<div style="background:rgba(255,255,255,0.95);border:1px solid rgba(5,150,105,0.3);border-radius:8px;padding:6px 10px;font-family:system-ui;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">` +
            `<span style="color:#047857;font-weight:700;">ETA</span> ` +
            `<span style="color:#1e293b;">${etaStr}</span>` +
            `<span style="color:#94a3b8;margin-left:6px;">(${eta.distanceKm.toFixed(0)} km)</span>` +
            `</div>`;
          map.getContainer().appendChild(etaPanelEl);
          trailEtaElRef.current = etaPanelEl;
        }
      };
      paintTrailRef.current = paintGpsTrail;
      paintGpsTrail(trailPointsRef.current);

      const bringDbTrailToFront = () => {
        if (!trailLayerRef.current) return;
        try {
          const trailLayer = trailLayerRef.current as { bringToFront?: () => void };
          if (typeof trailLayer.bringToFront === 'function') {
            trailLayer.bringToFront();
          }
        } catch {
          /* map may be torn down */
        }
      };

      // ── Road routing via routingService.ts (OSRM → Netlify proxy → Mapbox → Google) ──
      const isMapReadyForDrawing = () => {
        if (unmountedRef.current) return false;
        if (mapInstanceRef.current !== map) return false;
        try {
          const container =
            typeof map.getContainer === 'function' ? map.getContainer() : null;
          return !!container && container.isConnected;
        } catch {
          return false;
        }
      };

      let routedPolylineCoords: [number, number][] = [];
      let previewRouteLine: import('leaflet').Polyline | null = null;

      const collectViewportCoords = (): [number, number][] => {
        const coords: [number, number][] = [
          srcCoords,
          dstCoords,
          ...stopCoords.map((s) => s.coords),
          ...routedPolylineCoords,
        ];
        if (isLatLngObject(truckLocation)) {
          coords.push(toLatLngTuple(truckLocation));
        }
        for (const p of (Array.isArray(trailPointsRef.current) ? trailPointsRef.current : []).filter(
          (point) => isValidCoordinatePair(point),
        )) {
          coords.push([p.latitude, p.longitude]);
        }
        return coords;
      };

      const fitMapToFullRoute = () => {
        if (!isMapReadyForDrawing()) return;
        const coords = collectViewportCoords();
        if (coords.length === 0) return;
        try {
          if (coords.length === 1) {
            map.setView(coords[0], 11, { animate: false });
            return;
          }
          if (compactMapPreview) {
            map.fitBounds(coords as LatLngTuple[], {
              paddingTopLeft: [40, 40],
              paddingBottomRight: [fitPaddingRight, fitPaddingBottom],
              maxZoom: 13,
              animate: false,
            });
            return;
          }
          map.fitBounds(coords as LatLngTuple[], {
            paddingTopLeft: [48, 72],
            paddingBottomRight: [fitPaddingRight, fitPaddingBottom],
            maxZoom: 14,
            animate: false,
          });
        } catch {
          // Map torn down while fitting
        }
      };

      const createFallbackRoute = () => {
        if (!isMapReadyForDrawing()) return;
        const allPoints = [srcCoords, ...stopCoords.map((s) => s.coords), dstCoords];
        const R = 6371;
        let totalDist = 0;
        for (let i = 0; i < allPoints.length - 1; i++) {
          const [lat1, lng1] = allPoints[i];
          const [lat2, lng2] = allPoints[i + 1];
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(lat2 - lat1);
          const dLng = toRad(lng2 - lng1);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
          totalDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        if (onDistanceCalculated) onDistanceCalculated((totalDist * 1.3).toFixed(1));
        try {
          if (previewRouteLine) {
            try { map.removeLayer(previewRouteLine); } catch { /* ignore */ }
            previewRouteLine = null;
          }
          previewRouteLine = L.polyline(allPoints, {
            color: '#2196F3',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10',
          }).addTo(map);
          bringDbTrailToFront();
          routedPolylineCoords = allPoints;
          fitMapToFullRoute();
        } catch {
          // Map can be torn down while async routing callbacks are still in flight.
        }
      };

      // Build ordered waypoints: source → intermediate stops → destination
      const routePoints: { latitude: number; longitude: number }[] = [
        { latitude: srcCoords[0], longitude: srcCoords[1] },
        ...stopCoords.map((s) => ({ latitude: s.coords[0], longitude: s.coords[1] })),
        { latitude: dstCoords[0], longitude: dstCoords[1] },
      ];

      void (async () => {
        try {
          // Fetch each segment in parallel; null means that segment failed
          const segments = await Promise.all(
            routePoints.slice(0, -1).map((from, i) =>
              getOptimalRoute(from, routePoints[i + 1]).catch(() => null),
            ),
          );
          if (!isRunActive()) return;
          if (!isMapReadyForDrawing()) return;

          const validSegments = segments.filter((s): s is RouteResult => !!s);
          if (validSegments.length === routePoints.length - 1) {
            const allLatLngs = validSegments.flatMap((s) =>
              s.coordinates.map((c) => [c.latitude, c.longitude] as [number, number]),
            );
            const totalDistM = validSegments.reduce((sum, s) => sum + s.distance, 0);
            if (allLatLngs.length > 1) {
              try {
                if (previewRouteLine) {
                  try { map.removeLayer(previewRouteLine); } catch { /* ignore */ }
                  previewRouteLine = null;
                }
                // Completed trip: wide soft band so it stays visible under the driven line.
                previewRouteLine = L.polyline(allLatLngs, {
                  color: '#2196F3',
                  weight: completedTripRef.current ? 14 : 4,
                  opacity: completedTripRef.current ? 0.6 : 0.85,
                  lineCap: 'round',
                  lineJoin: 'round',
                }).addTo(map);
                bringDbTrailToFront();
                onDistanceCalculated?.((totalDistM / 1000).toFixed(1));
                routedPolylineCoords = allLatLngs;
                fitMapToFullRoute();
              } catch {
                // Map torn down
              }
              return;
            }
          }
          createFallbackRoute();
        } catch {
          createFallbackRoute();
        }
      })();

      // Straight-line preview first — road geometry replaces it when OSRM returns.
      createFallbackRoute();

      // ── Fit bounds (endpoints until routed polyline loads) ───────────────
      fitMapToFullRoute();

      map.whenReady(() => {
        if (!isRunActive()) return;
        const kickLayout = () => {
          if (unmountedRef.current) return;
          if (runId !== initRunIdRef.current) return;
          if (mapInstanceRef.current !== map) return;
          try {
            map.invalidateSize(true);
            fitMapToFullRoute();
          } catch {
            /* ignore */
          }
        };
        kickLayout();
        const rafId = requestAnimationFrame(kickLayout);
        const t1 = window.setTimeout(kickLayout, 100);
        const t2 = window.setTimeout(kickLayout, 400);
        mapRafIdRef.current = rafId;
        mapTimeoutIdsRef.current = [t1, t2];
        if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
          const ro = new ResizeObserver(() => kickLayout());
          ro.observe(mapRef.current);
          mapResizeObserverRef.current = ro;
        }
      });
    } catch (err) {
      console.error('TripMap initialize failed', err);
      if (!unmountedRef.current) {
        setError('Failed to load map. Please check your internet connection and try again.');
        setIsLoading(false);
      }
    }
  };

  const mapStructureKey = tripMapStructureKey({
    source,
    destination,
    sourceLat: sourceCoords?.latitude,
    sourceLng: sourceCoords?.longitude,
    destLat: destCoords?.latitude,
    destLng: destCoords?.longitude,
    tripId,
    trackingEnabled,
    stops: intermediateStops,
  });

  useEffect(() => {
    const hasSource = sourceCoords ?? source;
    const hasDest = destCoords ?? destination;
    if (!hasSource || !hasDest) {
      setError('Source and destination are required to display the map.');
      setIsLoading(false);
      return;
    }
    initializeMap();
    return () => {
      unmountedRef.current = true;
      initRunIdRef.current += 1;
      liveLayerRef.current?.detach();
      liveLayerRef.current = null;
      mapTimeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      mapTimeoutIdsRef.current = [];
      if (mapRafIdRef.current !== null) {
        window.cancelAnimationFrame(mapRafIdRef.current);
        mapRafIdRef.current = null;
      }
      if (mapResizeObserverRef.current) {
        try { mapResizeObserverRef.current.disconnect(); } catch { /* ignore */ }
        mapResizeObserverRef.current = null;
      }
      paintTrailRef.current = null;
      if (trailEtaElRef.current) {
        trailEtaElRef.current.remove();
        trailEtaElRef.current = null;
      }
      if (trailLegendElRef.current) {
        trailLegendElRef.current.remove();
        trailLegendElRef.current = null;
      }
      trailZoomHandlerRef.current = null; // listener dies with map.remove()
      trailLayerRef.current = null;
      const m = mapInstanceRef.current;
      if (m) {
        // Order matters. `off()` with no args strips Leaflet's OWN internal
        // listeners (including the zoom-transition handler that map.remove()
        // relies on to unwind an in-flight animation), so calling it first left
        // a half-torn-down map whose pane was already detached — the source of
        // `_leaflet_pos` of undefined (GX-PULSE-X). stop() cancels any running
        // pan/zoom, remove() does the real teardown, and only then is dropping
        // any residual app listeners safe.
        try { m.stop(); } catch { /* ignore */ }
        try { m.remove(); } catch { /* ignore */ }
        try { m.off(); } catch { /* ignore */ }
        mapInstanceRef.current = null;
      }
    };
    // Route, trip, and stops rebuild the map. GPS pings and trail points do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStructureKey]);

  const trailSignature = liveTrailSignature(dbLocationTrail);
  useEffect(() => {
    // Appended GPS points replace only the trail layer. The map, tiles, and
    // route stay mounted. LeafletLiveTruckLayer moves the truck on its own.
    paintTrailRef.current?.(trailPointsRef.current);
  }, [trailSignature]);

  const containerHeightStyle =
    typeof resolvedHeight === 'string'
      ? { height: resolvedHeight, minHeight: resolvedHeight === '100%' ? 320 : undefined }
      : { height: resolvedHeight };

  const zoomMap = (delta: number) => {
    const m = mapInstanceRef.current;
    if (!m) return;
    try {
      // `animate: false` — an animated zoom schedules Leaflet's internal
      // _onZoomTransitionEnd timer, which `map.stop()`/`map.remove()` cannot
      // cancel. Unmounting mid-transition then crashes on a detached pane
      // (TypeError: reading '_leaflet_pos').
      m.setZoom(m.getZoom() + delta, { animate: false });
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: resolvedHeight === '100%' ? 0 : 12,
        overflow: 'hidden',
        border: resolvedHeight === '100%' ? 'none' : '1px solid #e2e8f0',
        ...containerHeightStyle,
      }}
    >
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.92)', zIndex: 10, backdropFilter: 'blur(4px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #e5e7eb' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: '#111827', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <p style={{ fontSize: 14, color: '#4b5563', fontWeight: 500, margin: 0 }}>Loading map...</p>
            {geocodingProgress.total > 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                Loading locations... ({geocodingProgress.current}/{geocodingProgress.total})
              </p>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {error && !isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', zIndex: 10 }}>
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 280 }}>
            <div style={{ width: 48, height: 48, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', margin: '0 0 8px' }}>Map Loading Failed</p>
            <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 16px' }}>{error}</p>
            <button
              onClick={initializeMap}
              style={{ padding: '6px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ height: '100%', width: '100%', minHeight: typeof resolvedHeight === 'number' ? resolvedHeight : 320 }} />
      {!isLoading && !error ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomMap(1)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid rgba(15,23,42,0.12)',
              background: 'rgba(255,255,255,0.95)',
              cursor: 'pointer',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomMap(-1)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid rgba(15,23,42,0.12)',
              background: 'rgba(255,255,255,0.95)',
              cursor: 'pointer',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            −
          </button>
        </div>
      ) : null}
      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(255,255,255,0.85)', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#6b7280', zIndex: 5 }}>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          © OpenStreetMap
        </a>
      </div>
    </div>
  );
}
