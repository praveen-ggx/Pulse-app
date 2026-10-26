/**
 * Party / driver display metadata for Trips hub (cards + table).
 * Avatars: raw `avatar_url` from DB (PartyAvatar / resolvePartyDisplayUri handles public URLs).
 */
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "../services/trips.service";
import { overlayViewerTripSubcontract } from "./overlayViewerTripSubcontract.util";
import { driverAvatarSeedFromId } from "@/lib/partyAvatarDisplay";

export function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export type TripHubPartyMeta = {
  displaySupplierName: string;
  displayDriverName: string;
  clientAvatarUrl: string | null;
  clientAvatarSeed: string | null;
  supplierAvatarUrl: string | null;
  supplierAvatarSeed: string | null;
  clientFallbackSeed: string;
  supplierFallbackSeed: string;
  clientLinkedOrgId: string | null;
  supplierLinkedOrgId: string | null;
  clientIntegrated: boolean;
  supplierIntegrated: boolean;
  driverAvatarUrl: string | null;
  driverAvatarSeed: string | null;
  /** From drivers.tracking_only — OTP/ad-hoc lane for trip-kind pill only. */
  driverTrackingOnly?: boolean | null;
};

function isGenericSupplierLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  if (
    v === "supplier" ||
    v === "partner" ||
    v === "aggregate supplier" ||
    v === "asset / own vehicle" ||
    v === "own vehicle" ||
    v === "awaiting data"
  ) {
    return true;
  }
  return false;
}

function resolveSupplierName(
  t: TripRow,
  entries: LedgerRow[],
  supplierById: Map<string, SupplierRow>,
  supplierNameByIdFallback?: Record<string, string>,
): string {
  const raw = (t.supplier_name ?? "").trim();
  const clientName = (t.client_name ?? "").trim().toLowerCase();
  if (
    raw &&
    !isUuidLikeString(raw) &&
    !isGenericSupplierLabel(raw) &&
    raw.toLowerCase() !== clientName
  ) {
    return raw;
  }
  const sid = (t.supplier_id ?? "").trim().toLowerCase();
  if (sid) {
    const row = supplierById.get(sid);
    const label = (
      row?.name ??
      row?.company_name ??
      row?.contact_person ??
      ""
    ).trim();
    if (label) return label;
    const fallbackLabel = (supplierNameByIdFallback?.[sid] ?? "").trim();
    if (fallbackLabel) return fallbackLabel;
  }
  for (const tx of entries) {
    if (tx.contact_type !== "supplier") continue;
    const pn = (tx.party_name ?? "").trim();
    if (
      pn &&
      !isUuidLikeString(pn) &&
      !isGenericSupplierLabel(pn) &&
      pn.toLowerCase() !== clientName
    ) {
      return pn;
    }
  }
  return "";
}

function isGenericDriverLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "driver" || v === "—" || v === "-";
}

function findPartyByIdOrUniqueName<
  T extends { name?: string | null; company_name?: string | null },
>(
  byId: Map<string, T>,
  id: string,
  name: string,
): T | undefined {
  const idKey = id.trim().toLowerCase();
  if (idKey) {
    const row = byId.get(idKey);
    if (row) return row;
  }
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  let match: T | undefined;
  let hits = 0;
  for (const row of byId.values()) {
    const label = (row.name ?? row.company_name ?? "").trim().toLowerCase();
    if (label !== wanted) continue;
    hits += 1;
    match = row;
  }
  return hits === 1 ? match : undefined;
}

function resolveDriverName(
  t: TripRow,
  driverById: Map<string, DriverRow>,
): string {
  const fromTrip = (t.driver_display_name ?? "").trim();
  if (fromTrip && !isUuidLikeString(fromTrip) && !isGenericDriverLabel(fromTrip)) {
    return fromTrip;
  }
  const did = (t.driver_id ?? "").trim().toLowerCase();
  if (!did) return "";
  const row = driverById.get(did);
  const fromRow = (row?.name ?? "").trim();
  if (fromRow && !isGenericDriverLabel(fromRow)) return fromRow;
  return "";
}

/** Supplier / client / driver avatar fields for hub cards and table (org logos resolved in UI via linked-org map). */
export function buildTripHubPartyMetaByTripId(
  tripsList: TripRow[],
  clients: ClientRow[],
  suppliers: SupplierRow[],
  drivers: DriverRow[],
  transactions: LedgerRow[],
  supplierNameByIdFallback?: Record<string, string>,
  opts?: {
    viewerOrgId?: string | null;
    subcontracts?: Array<{
      trip_id: string;
      supplier_id: string;
      rate: number;
    }>;
    /** Signed/public URLs from `get_driver_profile_display_batch`. */
    driverImageById?: Record<string, string>;
  },
): Map<string, TripHubPartyMeta> {
  const clientById = new Map(
    clients.map((c) => [String(c.id).trim().toLowerCase(), c] as const),
  );
  const supplierById = new Map(
    suppliers.map((s) => [String(s.id).trim().toLowerCase(), s] as const),
  );
  const driverById = new Map(
    drivers.map((d) => [String(d.id).trim().toLowerCase(), d] as const),
  );
  const txByTripId = new Map<string, LedgerRow[]>();
  for (const tx of transactions) {
    const tid = (tx.trip_id ?? "").trim();
    if (!tid) continue;
    const k = tid.toLowerCase();
    const list = txByTripId.get(k);
    if (list) list.push(tx);
    else txByTripId.set(k, [tx]);
  }

  const subcontractByTripId = new Map<
    string,
    { supplier_id: string; rate: number }
  >();
  for (const row of opts?.subcontracts ?? []) {
    const tid = String(row.trip_id ?? "").trim();
    if (!tid || !row.supplier_id) continue;
    subcontractByTripId.set(tid, {
      supplier_id: row.supplier_id,
      rate: Number(row.rate) || 0,
    });
  }

  const meta = new Map<string, TripHubPartyMeta>();
  for (const raw of tripsList) {
    const sub = subcontractByTripId.get(raw.id);
    const subName = sub
      ? (
          supplierById.get(String(sub.supplier_id).trim().toLowerCase())
        )
      : undefined;
    const t = overlayViewerTripSubcontract(
      raw,
      opts?.viewerOrgId ?? null,
      sub,
      (
        subName?.name ??
        subName?.company_name ??
        subName?.contact_person ??
        ""
      ).trim() || null,
    );
    const tidKey = String(t.id).trim().toLowerCase();
    const entries = txByTripId.get(tidKey) ?? [];
    const displayDriverName = resolveDriverName(t, driverById);
    const viewerOrgId = String(opts?.viewerOrgId ?? "").trim();
    const tripOwnerOrgId = String(t.organization_id ?? "").trim();
    const viewerIsAwardedSupplier =
      !!viewerOrgId &&
      !!String(t.supplier_id ?? "").trim() &&
      !!tripOwnerOrgId &&
      viewerOrgId !== tripOwnerOrgId;
    let displaySupplierName = resolveSupplierName(
      t,
      entries,
      supplierById,
      supplierNameByIdFallback,
    );
    if (viewerIsAwardedSupplier) {
      // Awarded carrier: never label themselves as the supplier (or "Awaiting
      // data") after they assigned a roster driver on the shipper trip.
      displaySupplierName = displayDriverName;
    }

    const clientIdKey = (t.client_id ?? "").trim().toLowerCase();
    const clientRow = findPartyByIdOrUniqueName(
      clientById,
      clientIdKey,
      t.client_name ?? "",
    );

    const supplierIdKey = (t.supplier_id ?? "").trim().toLowerCase();
    const supplierRow = findPartyByIdOrUniqueName(
      supplierById,
      supplierIdKey,
      displaySupplierName || (t.supplier_name ?? ""),
    );

    const driverIdKey = (t.driver_id ?? "").trim().toLowerCase();
    const driverRow = findPartyByIdOrUniqueName(
      driverById,
      driverIdKey,
      t.driver_display_name ?? "",
    );
    const driverImageId = (driverRow?.id ?? t.driver_id ?? "").trim();
    const driverImage =
      (opts?.driverImageById?.[driverImageId] ??
        opts?.driverImageById?.[driverImageId.toLowerCase()] ??
        "")
        .trim() || null;

    const clientFallbackSeed = clientIdKey
      ? `client-entity:${clientIdKey}`
      : `client-trip:${t.id}`;
    const supplierFallbackSeed = supplierIdKey
      ? `supplier-entity:${supplierIdKey}`
      : displaySupplierName
        ? `supplier-name:${tidKey}:${displaySupplierName}`
        : `supplier-trip:${t.id}`;

    meta.set(t.id, {
      displaySupplierName,
      displayDriverName,
      clientAvatarUrl: (clientRow?.avatar_url ?? "").trim() || null,
      clientAvatarSeed: (clientRow?.avatar_seed ?? "").trim() || null,
      supplierAvatarUrl: (supplierRow?.avatar_url ?? "").trim() || null,
      supplierAvatarSeed: (supplierRow?.avatar_seed ?? "").trim() || null,
      clientFallbackSeed,
      supplierFallbackSeed,
      clientLinkedOrgId: (clientRow?.linked_organization_id ?? "").trim() || null,
      supplierLinkedOrgId: (supplierRow?.linked_organization_id ?? "").trim() || null,
      clientIntegrated: Boolean(
        clientRow?.is_integrated || clientRow?.linked_organization_id,
      ),
      supplierIntegrated: Boolean(
        supplierRow?.is_integrated ||
          supplierRow?.linked_organization_id ||
          supplierRow?.supplier_type === "integrated",
      ),
      driverAvatarUrl:
        driverImage || (driverRow?.avatar_url ?? "").trim() || null,
      driverAvatarSeed:
        (driverRow?.avatar_seed ?? "").trim() ||
        (driverImageId ? driverAvatarSeedFromId(driverImageId) : null),
      driverTrackingOnly: driverRow?.tracking_only === true ? true : driverRow ? false : null,
    });
  }
  return meta;
}
