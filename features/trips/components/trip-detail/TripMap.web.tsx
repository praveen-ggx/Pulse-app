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
        const validTrailPoints = (Array.isArray(points) ? points : []).filter((p) =>
          isValidCoordinatePair(p),
        );
        if (validTrailPoints.length === 0) return;
        const total = validTrailPoints.length;
        const trailGroup = L.layerGroup();

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
            radius: 6,
            fillColor: '#fb923c',
            color: '#c2410c',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95,
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

        trailGroup.addTo(map);
        trailLayerRef.current = trailGroup;

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
                previewRouteLine = L.polyline(allLatLngs, {
                  color: '#2196F3',
                  weight: 4,
                  opacity: 0.85,
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
