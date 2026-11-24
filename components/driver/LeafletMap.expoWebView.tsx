/**
 * Expo Go cannot reliably render react-native-maps tiles on some iPhones.
 * Use a WebView + Leaflet OSM basemap (same tile network path that works on web).
 */
import { isExpoGo } from "@/lib/expoGoMaps";
import { mapboxLightRasterTileUrl } from "@/lib/maps/nativeBasemapStyle";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type {
  LeafletLatLng,
  LeafletMapProps,
  LeafletMapRef,
  LeafletPolylineLayer,
} from "./LeafletMap.types";

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildHtml(payload: {
  center: LeafletLatLng;
  zoom: number;
  markers: LeafletMapProps["markers"];
  polylines: LeafletPolylineLayer[];
  polylineColor: string;
}): string {
  const boot = escapeJsonForScript(payload);
  // Carto keyless tiles return "API KEY REQUIRED" watermarks inside a WebView
  // (no browser origin), so use Mapbox Light with the public token. Falls back
  // to Carto only when the token is missing.
  const mapboxTiles = mapboxLightRasterTileUrl(512);
  const tileLayer = escapeJsonForScript(
    mapboxTiles
      ? {
          url: mapboxTiles,
          options: {
            tileSize: 512,
            zoomOffset: -1,
            maxZoom: 20,
            attribution: "&copy; Mapbox &copy; OpenStreetMap",
          },
        }
      : {
          url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          options: { maxZoom: 19, attribution: "&copy; OSM &copy; CARTO" },
        },
  );
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#e2e8f0; }
    .leaflet-control-attribution { font-size:9px !important; }
    .pulse-pin { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .pulse-pin-chip { background:#fff; font:700 10px/1.2 system-ui,sans-serif; padding:3px 8px; border-radius:999px; border:1px solid #d1d5db; white-space:nowrap; max-width:108px; overflow:hidden; text-overflow:ellipsis; }
    .pulse-pin-chip.pickup { color:#059669; border-color:#a7f3d0; }
    .pulse-pin-chip.drop { color:#b45309; border-color:#fcd34d; }
    .pulse-pin-head { width:28px; height:28px; border-radius:14px; border:2px solid #fff; color:#fff; font:800 12px/24px system-ui,sans-serif; text-align:center; box-shadow:0 2px 8px rgba(15,23,42,.18); }
    .pulse-pin-head.pickup { background:#10b981; }
    .pulse-pin-head.drop { background:#f59e0b; }
    .pulse-pin-tail { width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:8px solid #10b981; margin-top:-1px; }
    .pulse-pin-tail.drop { border-top-color:#f59e0b; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const boot = ${boot};
    const map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([boot.center.latitude, boot.center.longitude], boot.zoom || 12);
    const tileLayer = ${tileLayer};
    L.tileLayer(tileLayer.url, tileLayer.options).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    const lineLayer = L.layerGroup().addTo(map);

    function paint(data) {
      markerLayer.clearLayers();
      lineLayer.clearLayers();
      (data.polylines || []).forEach((layer) => {
        const latlngs = (layer.coordinates || []).map((c) => [c.latitude, c.longitude]);
        if (latlngs.length < 2) return;
        L.polyline(latlngs, {
          color: layer.color || data.polylineColor || '#059669',
          weight: layer.width || 5,
          opacity: 0.9,
        }).addTo(lineLayer);
      });
      (data.markers || []).forEach((m) => {
        if (!m || !m.coordinate) return;
        const id = String(m.id || '');
        const isYou = id === 'you' || id === 'driver';
        const isDrop = id === 'drop' || id.indexOf('drop-') === 0;
        const isPickup = id === 'pickup' || id.indexOf('pickup-') === 0;
        const kindMatch = /^(?:pickup|drop)-(\\d+)$/.exec(id);
        const n = m.kindIndex != null ? m.kindIndex : (kindMatch ? kindMatch[1] : '');
        if ((isPickup || isDrop) && !isYou) {
          const kind = isDrop ? 'drop' : 'pickup';
          const fallback = n ? (isDrop ? 'Drop ' : 'Pickup ') + n : (isDrop ? 'Drop' : 'Pickup');
          const caption = String(m.label || fallback).replace(/[<>]/g, '');
          const html = '<div class="pulse-pin"><div class="pulse-pin-chip ' + kind + '">' + caption + '</div><div class="pulse-pin-head ' + kind + '">' + (n || '') + '</div><div class="pulse-pin-tail ' + kind + '"></div></div>';
          L.marker([m.coordinate.latitude, m.coordinate.longitude], {
            icon: L.divIcon({ className: '', html: html, iconSize: [108, 56], iconAnchor: [54, 56] }),
          }).addTo(markerLayer);
          return;
        }
        const color = m.color || '#059669';
        const circle = L.circleMarker([m.coordinate.latitude, m.coordinate.longitude], {
          radius: isYou ? 8 : 7,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        });
        if (m.label) circle.bindTooltip(String(m.label), { permanent: false, direction: 'top' });
        circle.addTo(markerLayer);
      });
    }

    paint(boot);
    setTimeout(() => map.invalidateSize(), 80);
    setTimeout(() => map.invalidateSize(), 320);

    window.__pulseMap = {
      focus: (lat, lng, zoom) => {
        map.setView([lat, lng], zoom != null ? zoom : map.getZoom(), { animate: true });
      },
      zoomBy: (delta) => {
        map.setZoom(Math.max(3, Math.min(18, map.getZoom() + delta)), { animate: true });
      },
      fit: (neLat, neLng, swLat, swLng, pad) => {
        map.fitBounds([[swLat, swLng], [neLat, neLng]], { padding: [pad || 48, pad || 48], maxZoom: 14, animate: true });
      },
      paint: (data) => paint(data),
      resize: () => map.invalidateSize(),
    };

    document.addEventListener('message', onMsg);
    window.addEventListener('message', onMsg);
    function onMsg(event) {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!msg || !window.__pulseMap) return;
        if (msg.type === 'focus') window.__pulseMap.focus(msg.lat, msg.lng, msg.zoom);
        if (msg.type === 'zoomBy') window.__pulseMap.zoomBy(msg.delta || 0);
        if (msg.type === 'fit') window.__pulseMap.fit(msg.neLat, msg.neLng, msg.swLat, msg.swLng, msg.pad);
        if (msg.type === 'paint') window.__pulseMap.paint(msg.data);
        if (msg.type === 'resize') window.__pulseMap.resize();
      } catch (e) {}
    }
  </script>
</body>
</html>`;
}

export const ExpoGoWebLeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(
  function ExpoGoWebLeafletMap(
    {
      style,
      center,
      zoom = 12,
      markers = [],
      polylines,
      polyline = [],
      polylineColor = "#059669",
    },
    ref,
  ) {
    const webRef = useRef<WebView>(null);

    const layers: LeafletPolylineLayer[] = useMemo(() => {
      if (polylines?.length) return polylines.filter((l) => (l.coordinates?.length ?? 0) >= 2);
      if (polyline.length >= 2) {
        return [{ id: "main", coordinates: polyline, color: polylineColor }];
      }
      return [];
    }, [polylines, polyline, polylineColor]);

    const html = useMemo(
      () =>
        buildHtml({
          center,
          zoom,
          markers,
          polylines: layers,
          polylineColor,
        }),
      // Initial document only — updates go through postMessage paint.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const run = (js: string) => {
      webRef.current?.injectJavaScript(`${js}; true;`);
    };

    useEffect(() => {
      run(
        `window.__pulseMap && window.__pulseMap.paint(${escapeJsonForScript({
          markers,
          polylines: layers,
          polylineColor,
        })})`,
      );
    }, [markers, layers, polylineColor]);

    useEffect(() => {
      run(`window.__pulseMap && window.__pulseMap.resize()`);
    }, [style]);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        run(
          `window.__pulseMap && window.__pulseMap.focus(${currentCenter.latitude},${currentCenter.longitude},${
            currentZoom ?? "null"
          })`,
        );
      },
      setMarkerCoordinate: () => {
        // Full paint covers marker moves on the next markers prop sync.
      },
      fitBounds: (ne, sw, paddingPx = 80) => {
        run(
          `window.__pulseMap && window.__pulseMap.fit(${ne.latitude},${ne.longitude},${sw.latitude},${sw.longitude},${paddingPx})`,
        );
      },
      zoomIn: () => run(`window.__pulseMap && window.__pulseMap.zoomBy(1)`),
      zoomOut: () => run(`window.__pulseMap && window.__pulseMap.zoomBy(-1)`),
    }));

    const onMessage = (_event: WebViewMessageEvent) => {
      // Reserved for future map → RN events.
    };

    return (
      <View style={[style, styles.host]}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={StyleSheet.absoluteFill}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onLoadEnd={() => {
            run(`window.__pulseMap && window.__pulseMap.resize()`);
            run(
              `window.__pulseMap && window.__pulseMap.paint(${escapeJsonForScript({
                markers,
                polylines: layers,
                polylineColor,
              })})`,
            );
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  host: {
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
});

export function shouldUseExpoGoWebMap(): boolean {
  return isExpoGo();
}
