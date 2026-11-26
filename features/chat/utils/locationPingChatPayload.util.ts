import type { SystemLogLocationData } from "@/features/chat/utils/locationLogPayload.util";

/** Metadata for a shipper-requested or driver-shared location ping in trip chat. */
export function buildLocationPingChatMetadata(params: {
  location: SystemLogLocationData;
  shipperRequested?: boolean;
  simulated?: boolean;
}): Record<string, unknown> {
  const { location, shipperRequested = false, simulated = false } = params;
  return {
    event_payload: {
      location_ping: true,
      shipper_requested: shipperRequested ? true : null,
      simulated: simulated ? true : null,
      location_data: {
        lat: location.lat,
        lng: location.lng,
        address_name: location.address_name ?? null,
        odometer_km: location.odometer_km ?? null,
        recorded_at:
          location.recorded_at ?? new Date().toISOString(),
      },
    },
  };
}

export function buildLocationPingChatContent(cityLabel: string, simulated = false): string {
  const city = cityLabel.trim() || "En route";
  return simulated
    ? `Driver location update — ${city} (simulated)`
    : `Driver location update — ${city}`;
}
