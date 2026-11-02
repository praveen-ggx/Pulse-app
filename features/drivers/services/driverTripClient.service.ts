import {
  applyDcoPartyTagToNotes,
  parseDcoPartyTagFromNotes,
  stripDcoPartyTagFromNotes,
} from "@/features/drivers/utils/dcoTripPartyTag.util";
import {
  applyFleetTripMarkToNotes,
  parseFleetTripMarkFromNotes,
} from "@/features/drivers/utils/driverFleetTripMark.util";
import { supabase } from "@/lib/supabase";

function rpcMissing(error: { code?: string; message?: string } | null, name: string): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes(name) ||
    msg.includes("could not find the function")
  );
}

async function readDriverTripNotes(
  tripId: string,
): Promise<{ notes: string; error: Error | null }> {
  const db = supabase();
  const view = await db
    .from("trips_driver_view")
    .select("instructions")
    .eq("id", tripId)
    .maybeSingle();
  if (!view.error) {
    return { notes: String(view.data?.instructions ?? ""), error: null };
  }
  const row = await db.from("trips").select("notes").eq("id", tripId).maybeSingle();
  if (row.error) return { notes: "", error: mapTagError(row.error.message) };
  return { notes: String(row.data?.notes ?? ""), error: null };
}

async function writeDriverTripNotes(
  tripId: string,
  nextNotes: string,
): Promise<{ error: Error | null }> {
  const db = supabase();
  const rpc = await db.rpc("driver_save_offline_trip_notes", {
    p_trip_id: tripId,
    p_notes: nextNotes,
  });
  if (!rpc.error) return { error: null };
  if (!rpcMissing(rpc.error, "driver_save_offline_trip_notes")) {
    return { error: mapTagError(rpc.error.message) };
  }

  const updated = await db.from("trips").update({ notes: nextNotes }).eq("id", tripId).select("id");
  if (updated.error) return { error: mapTagError(updated.error.message) };
  if (!updated.data || updated.data.length === 0) {
    return { error: new Error("Could not save this trip. The database did not keep the update.") };
  }

  const saved = await readDriverTripNotes(tripId);
  if (saved.error) return saved;
  if (!saved.notes.includes("<!--pulse-")) {
    return { error: new Error("Could not save this trip. The database did not keep the update.") };
  }
  return { error: null };
}

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
 * Tag a Self party onto the driver's own trip.
 * The driver list reads notes, so the save is confirmed there.
 */
export async function tagTripWithDcoClient(
  tripId: string,
  client: { id: string; name: string },
  opts?: { billed?: number; source?: string | null },
): Promise<{ error: Error | null }> {
  const id = tripId.trim();
  if (!id) return { error: new Error("Missing trip.") };
  if (String(opts?.source ?? "").trim() === "market_bid") {
    return { error: mapTagError("dco_tag_marketplace_denied") };
  }
  const name = client.name.trim() || "Shipper";
  const billed = Math.max(0, Math.round(Number(opts?.billed) || 0));
  const db = supabase();
  const localOnly = String(client.id ?? "").trim().startsWith("local:");

  // Device-local parties never hit the Self RPC / clients FK path.
  if (!localOnly) {
    const rpc = await db.rpc("tag_dco_trip_party", {
      p_trip_id: id,
      p_client_id: client.id,
    });
    const rpcMsg = rpc.error?.message ?? "";
    const rpcMissing =
      !!rpc.error &&
      (rpc.error.code === "PGRST202" ||
        rpc.error.code === "42883" ||
        rpcMsg.toLowerCase().includes("tag_dco_trip_party"));

    // The driver trip list does not include client_id. Always keep the party
    // in notes so the trip shows under that party after a reload.
    if (rpc.error && !rpcMissing && !rpcMsg.includes("driver_direct_trip_write_denied")) {
      const soft = /client_not_found|dco_tag_client_denied|foreign key/i.test(rpcMsg);
      if (!soft) return { error: mapTagError(rpcMsg) };
    }
  }

  const existing = await readDriverTripNotes(id);
  if (existing.error) return existing;

  const nextNotes = applyDcoPartyTagToNotes(existing.notes, {
    id: client.id,
    name,
    ...(billed > 0 ? { billed } : {}),
  });
  const noted = await writeDriverTripNotes(id, nextNotes);
  if (noted.error) return noted;

  const confirmed = parseDcoPartyTagFromNotes(nextNotes);
  if (!confirmed) return { error: new Error("Could not tag this trip. Try again.") };
  return { error: null };
}

/** Mark an offline trip as fleet work for the assigning business. Notes only — no client book write. */
export async function markTripAsFleetTrip(
  tripId: string,
  fleet: { name: string; orgId?: string | null },
): Promise<{ error: Error | null }> {
  const id = tripId.trim();
  const name = fleet.name.trim();
  if (!id) return { error: new Error("Missing trip.") };
  if (!name) return { error: new Error("Missing fleet.") };

  const existing = await readDriverTripNotes(id);
  if (existing.error) return existing;

  const orgId = String(fleet.orgId ?? "").trim();
  const nextNotes = applyFleetTripMarkToNotes(stripDcoPartyTagFromNotes(existing.notes), {
    name,
    ...(orgId ? { orgId } : {}),
  });
  const noted = await writeDriverTripNotes(id, nextNotes);
  if (noted.error) return noted;
  if (!parseFleetTripMarkFromNotes(nextNotes)) {
    return { error: new Error("Could not mark this fleet trip. Try again.") };
  }
  return { error: null };
}
