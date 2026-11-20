/**
 * Basemap for every driver map: native MapLibre (dev client / APK), the Expo Go
 * WebView (Leaflet, via mapboxLightRasterTileUrl) and web (maplibre-gl).
 *
 * Carto's keyless basemaps (basemaps.cartocdn.com) now return
 * "API KEY REQUIRED" watermark tiles to non-browser clients, so all maps use
 * Mapbox Light raster tiles with the existing public token
 * (EXPO_PUBLIC_MAPBOX_TOKEN, also used for geocoding / routing).
 *
 * EXPO_PUBLIC_* values are inlined at bundle time: the token must be in .env
 * when Metro bundles / the APK is built. Without it we render a plain light
 * background instead of watermark tiles.
 */
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

const BACKGROUND_COLOR = "#f2f3f0";

function mapboxToken(): string {
  return process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
}

/**
 * Mapbox Light raster tile URL template ({z}/{x}/{y}), or null without a token.
 * `size` 256 → 256px logical tiles (@2x images); 512 → 512px tiles (Leaflet:
 * pair with tileSize 512 + zoomOffset -1).
 */
export function mapboxLightRasterTileUrl(size: 256 | 512): string | null {
  const token = mapboxToken();
  if (!token) return null;
  const path = size === 256 ? "tiles/256/{z}/{x}/{y}@2x" : "tiles/{z}/{x}/{y}";
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/${path}?access_token=${encodeURIComponent(token)}`;
}

function buildNativeBasemapStyle(): StyleSpecification {
  const tileUrl = mapboxLightRasterTileUrl(256);
  const background = {
    id: "background",
    type: "background" as const,
    paint: { "background-color": BACKGROUND_COLOR },
  };
  if (!tileUrl) {
    return { version: 8, sources: {}, layers: [background] };
  }
  return {
    version: 8,
    sources: {
      "mapbox-light": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© Mapbox © OpenStreetMap contributors",
      },
    },
    layers: [
      background,
      { id: "mapbox-light", type: "raster", source: "mapbox-light" },
    ],
  };
}

/** Stable object — pass straight to `<Map mapStyle={...} />`. */
export const NATIVE_BASEMAP_STYLE: StyleSpecification = buildNativeBasemapStyle();
