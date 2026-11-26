import { Linking } from 'react-native';

/**
 * Opens turn-by-turn navigation to a coordinate in the device's map app.
 * Uses Google Maps' universal web link (not a custom `googlemaps://`/`maps://`
 * scheme) so it works without any `LSApplicationQueriesSchemes` / Android
 * package-visibility config: it opens the Google Maps app when installed,
 * and falls back to the browser otherwise. Works on iOS, Android, and web.
 */
export function openExternalNavigation(
  latitude: number,
  longitude: number,
): Promise<void> {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  return Linking.openURL(url).then(() => undefined);
}

/** Opens driving directions between two coordinates in the device map app. */
export function openExternalRouteDirections(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
): Promise<void> {
  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${originLatitude},${originLongitude}` +
    `&destination=${destinationLatitude},${destinationLongitude}` +
    `&travelmode=driving`;
  return Linking.openURL(url).then(() => undefined);
}
