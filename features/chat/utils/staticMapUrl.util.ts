/**
 * Non-interactive static map thumbnail URLs (Mapbox preferred, then Google Static Maps).
 * Uses public client tokens only — suitable for image URLs in list/chat UI.
 */
function readMapboxToken(): string {
  if (typeof process === "undefined") return "";
  return (
    process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ||
    process.env?.MAPBOX_TOKEN?.trim() ||
    ""
  );
}

function readGoogleMapsKey(): string {
  if (typeof process === "undefined") return "";
  return process.env?.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY?.trim() || "";
}

export function isUsableMapCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
}

export function buildStaticMapImageUrl(
  lat: number,
  lng: number,
  width = 320,
  height = 160,
): string | null {
  if (!isUsableMapCoordinate(lat, lng)) return null;
  const mapbox = readMapboxToken();
  if (mapbox) {
    const lon = lng;
    const la = lat;
    const params = new URLSearchParams({
      access_token: mapbox,
      worldview: "IN",
    });
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+1a237e(${lon},${la})/${lon},${la},14/${width}x${height}@2x?${params.toString()}`;
  }
  const googleKey = readGoogleMapsKey();
  if (googleKey) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=${width}x${height}&scale=2&markers=color:0x1a237e%7C${lat},${lng}&key=${encodeURIComponent(googleKey)}`;
  }
  return null;
}
