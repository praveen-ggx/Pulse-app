function mapTagError(message: string): Error {
  const raw = message.toLowerCase();
  if (raw.includes("dco_tag_marketplace_denied") || raw.includes("dco_self_marketplace_denied")) {
    return new Error("Marketplace trips collect from the shipper. They are not tagged to a Self party.");
  }
  if (raw.includes("dco_tag_fleet_denied")) {
    return new Error("Fleet trips stay with the assigning business. Tag Self parties on your offline DCO trips only.");
  }
  if (raw.includes("dco_tag_client_denied") || raw.includes("client_not_found") || raw.includes("dco_self_party_denied")) {
    return new Error("That party is not in your Self book.");
  }
  if (raw.includes("dco_tag_denied") || raw.includes("trip_not_found") || raw.includes("dco_self_denied")) {
    return new Error("DCO Self is available only to an approved DCO who is not on an active fleet seat.");
  }
  if (raw.includes("driver_direct_trip_write_denied")) {
    return new Error("Could not tag this trip. Try again.");
  }
  return new Error(message);
}

/**
 * Legacy trip-column tag. DCO Self money no longer uses this path.
 * Kept only so old callers fail closed instead of writing notes.
 */
export async function tagTripWithDcoClient(
  tripId: string,
  _client: { id: string; name: string },
  opts?: { billed?: number; source?: string | null },
): Promise<{ error: Error | null }> {
  const id = tripId.trim();
  if (!id) return { error: new Error("Missing trip.") };
  if (String(opts?.source ?? "").trim() === "market_bid") {
    return { error: mapTagError("dco_tag_marketplace_denied") };
  }
  return {
    error: new Error(
      "Issue this receivable on the DCO Self book. Trip notes and organisation customer fields are not the commercial path.",
    ),
  };
}
