import {
  applyDcoPartyTagToNotes,
  parseDcoPartyTagFromNotes,
} from "@/features/drivers/utils/dcoTripPartyTag.util";
import { supabase } from "@/lib/supabase";

function mapTagError(message: string): Error {
  const raw = message.toLowerCase();
  if (raw.includes("dco_tag_marketplace_denied")) {
    return new Error("Marketplace trips collect from the shipper. They are not tagged to a Self party.");
  }
  if (raw.includes("dco_tag_client_denied") || raw.includes("client_not_found")) {
    return new Error("That party is not in your Self book.");
  }
  if (raw.includes("dco_tag_denied") || raw.includes("trip_not_found")) {
    return new Error("You can only tag parties on your own trips.");
  }
  if (raw.includes("driver_direct_trip_write_denied")) {
    return new Error("Could not tag this trip. Try again.");
  }
  return new Error(message);
}

/** Tag a trip with a DCO workspace client so offline work rolls up to that shipper. */
export async function tagTripWithDcoClient(
  tripId: string,
  client: { id: string; name: string },
  opts?: { billed?: number },
): Promise<{ error: Error | null }> {
  const id = tripId.trim();
  if (!id) return { error: new Error("Missing trip.") };
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
    if (!rpc.error && billed <= 0) return { error: null };

    const rpcMsg = rpc.error?.message ?? "";
    const rpcMissing =
      !!rpc.error &&
      (rpc.error.code === "PGRST202" ||
        rpc.error.code === "42883" ||
        rpcMsg.toLowerCase().includes("tag_dco_trip_party"));

    if (rpc.error && !rpcMissing && !rpcMsg.includes("driver_direct_trip_write_denied")) {
      return { error: mapTagError(rpcMsg) };
    }

    const patch: Record<string, unknown> = {
      client_id: client.id,
      client_name: name,
    };
    if (billed > 0) patch.supplier_rate = billed;

    const direct = await db.from("trips").update(patch).eq("id", id);
    if (!direct.error) return { error: null };

    if (!String(direct.error.message ?? "").includes("driver_direct_trip_write_denied")) {
      // Fall through to notes for FK / column denies on environments without the RPC.
      const soft =
        /foreign key|invalid input syntax|column|permission|rls|policy/i.test(
          String(direct.error.message ?? ""),
        );
      if (!soft) return { error: mapTagError(direct.error.message) };
    }
  }

  const existing = await db.from("trips").select("notes").eq("id", id).maybeSingle();
  if (existing.error) return { error: mapTagError(existing.error.message) };

  const nextNotes = applyDcoPartyTagToNotes(existing.data?.notes, {
    id: client.id,
    name,
    ...(billed > 0 ? { billed } : {}),
  });
  const noted = await db.from("trips").update({ notes: nextNotes }).eq("id", id);
  if (noted.error) return { error: mapTagError(noted.error.message) };

  const confirmed = parseDcoPartyTagFromNotes(nextNotes);
  if (!confirmed) return { error: new Error("Could not tag this trip. Try again.") };
  return { error: null };
}
