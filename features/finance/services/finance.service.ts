/**
 * Finance / ledger service — Supabase.
 * Uses public.transactions table (pulse schema: amount_in, amount_out, party_name, transaction_date).
 * When connected to pulse-unified-base DB with cash_entries, that table can be used instead; this keeps compatibility with pulse migrations.
 *
 * Double-entry interpretation: every row maps to a debit/credit pair per docs/CORE_ACCOUNTING_MODEL.md.
 * Use getDoubleEntryFromLedgerRow (features/finance/accounting/accountingModel.ts) for consistent interpretation.
 * Service-layer validation: amount cap, date format, string length.
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { runSingleflight } from "@/lib/cache/singleflight";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";
import { getDriverProfileDisplay, getDriverProfileDisplayBatch } from "@/features/drivers/services/drivers.service";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import {
  isMissingPaymentReferenceColumnError,
  omitPaymentReferenceField,
} from "@/features/finance/utils/ledgerWriteCompat.util";
import {
  AVATAR_BUCKET,
  extractPathFromStorageUrl,
  getSignedAvatarUrl,
  LEGACY_AVATAR_BUCKET,
  resolveAvatarPublicUrl,
} from "@/lib/avatarUpload";
import { LEDGER_PAGE_SIZE, toRange, type PageOpts } from "@/lib/pagination";
import { AUTH_TIMEOUT_MS, withTimeout } from "@/lib/authEngine";
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { VALIDATION, dateISO } from "@/lib/validation";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { recordTripWorkflowEvent } from "@/features/trips/services/tripWorkflow.service";

/**
 * Join trips via trip_id (not booking_ref).
 * `transactions_booking_ref_fkey` also points at trips — unqualified `trips(...)` is ambiguous.
 */
/**
 * Explicit column list for ledger reads — replaces `select("*")`.
 *
 * Every name here must be a REAL column on `transactions`. PostgREST rejects the
 * whole request with HTTP 400 if any one of them does not exist — unlike
 * `select("*")`, which silently tolerated the difference.
 *
 * toLedgerRow() also accepts trip_number / vehicle_number / driver_name, but
 * those are NOT columns on this table: they arrive from joins or from the
 * description meta blob, and toLedgerRow already types them optional. Listing
 * them here is what broke the Finance ledger with a 400.
 *
 * These are the fields toLedgerRow() consumes. Transactions is a wide
 * table; `*` pulled columns no ledger screen renders, inflating egress and
 * PostgREST serialization on the hottest read in the app.
 * Keep in sync with the toLedgerRow() parameter type below.
 */
const LEDGER_TX_COLUMNS =
  "id, organization_id, trip_id, party_name, description, " +
  "amount_in, amount_out, transaction_date, created_at, contact_id, " +
  "contact_type, ledger_entity_type, ledger_flow_type, ledger_category, " +
  "payment_ref, created_by, booking_ref, is_opening_balance";

const LEDGER_TX_TRIP_EMBED = "trips!trip_id";
const LEDGER_TX_SELECT_WITH_TRIPS =
  `*, ${LEDGER_TX_TRIP_EMBED}(trip_number, display_trip_id, trip_code, trip_operational_code)` as const;
const LEDGER_TX_SELECT_WITH_TRIPS_LEGACY =
  `*, ${LEDGER_TX_TRIP_EMBED}(trip_number)` as const;

export interface TripLedgerEmbed {
  trip_number: string;
  display_trip_id?: string | null;
  trip_code?: string | null;
  trip_operational_code?: string | null;
}

/**
 * Single-row trip embed lookup. Lets a realtime-pushed transaction row (which only
 * carries transactions' own columns) be completed locally via toLedgerRow instead of
 * refetching the whole org transactions list.
 */
/**
 * Trip label embed for a ledger row.
 *
 * Called from the realtime hot path (applyTransactionRealtimeEvent), once per
 * transaction event. Under a burst of inserts across distinct trips that was one
 * round-trip per event, so it is wrapped in singleflight: concurrent callers for
 * the same trip share a single in-flight request.
 *
 * Trip labels are effectively immutable, which is what makes sharing safe here.
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
export async function getTripLedgerEmbed(
  tripId: string,
): Promise<{ error: Error | null; embed: TripLedgerEmbed | null }> {
  return runSingleflight(`trip-ledger-embed:${tripId}`, async () => {
    const { data, error } = await supabase()
      .from("trips")
      .select("trip_number, display_trip_id, trip_code, trip_operational_code")
      .eq("id", tripId)
      .maybeSingle();
    if (error) return { error: new Error(error.message), embed: null };
    return { error: null, embed: (data as TripLedgerEmbed) ?? null };
  });
}

function isMissingTripsDisplayTripIdError(
  error: {
    message?: string;
    code?: string;
  } | null,
): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  if (!msg.includes("display_trip_id")) return false;
  return (
    error.code === "42703" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("column")
  );
}

/** DB / PostgREST rejects linking a ledger row to a trip the tenant cannot anchor (cross-org, no local mirror). */
function isLedgerTripIdRejectedError(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
): boolean {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`
    .toLowerCase()
    .trim();
  if (!msg) return false;
  if (
    msg.includes("selected trip was not found") ||
    (msg.includes("selected trip") && msg.includes("not found")) ||
    (msg.includes("trip") && msg.includes("not found") && msg.includes("selected"))
  ) {
    return true;
  }
  // Postgres FK / CHECK often surface as 23503 or "violates foreign key" / "is not present in table \"trips\"".
  if (error?.code === "23503") {
    return msg.includes("trip") || msg.includes("trips");
  }
  if (msg.includes("violates foreign key") && (msg.includes("trip") || msg.includes("trips"))) {
    return true;
  }
  if (msg.includes("is not present in table") && msg.includes("trips")) {
    return true;
  }
  return false;
}

/**
 * Resolve avatar_url (path or full URL) + avatar_seed to a single display URI.
 * Supabase storage URLs and paths use signed URLs for the private avatar bucket.
 */
async function resolveDriverAvatarFromProfileFields(
  avatarUrlRaw: string | null | undefined,
  avatarSeedRaw: string | null | undefined,
): Promise<string | null> {
  const raw = (avatarUrlRaw ?? "").trim();
  const seed = (avatarSeedRaw ?? "").trim();

  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const ref = extractPathFromStorageUrl(raw);
      if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
        const signed = await getSignedAvatarUrl(ref.path);
        if (signed) return signed;
      } else {
        return raw;
      }
    } else {
      const signed = await getSignedAvatarUrl(raw);
      if (signed) return signed;
      const publicUrl = resolveAvatarPublicUrl(raw);
      if (publicUrl) return publicUrl;
    }
  }

  if (seed) return getAvatarUriForSeed(seed);
  return null;
}

export async function getProfileImage(
  contactId: string | null | undefined,
  contactType: "client" | "supplier" | "driver" | null | undefined,
): Promise<string | null> {
  if (!contactId || !contactType) return null;
  if (contactType !== "driver") return null;
  const { profile, error } = await getDriverProfileDisplay(String(contactId).trim());
  if (error || !profile) return null;
  return resolveDriverAvatarFromProfileFields(profile.avatarUrl, profile.avatarSeed);
}

/** Batch version: fetch avatar URLs for multiple driver IDs in one RPC call. */
export async function getProfileImageBatch(
  driverIds: string[],
): Promise<Record<string, string>> {
  const ids = driverIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return {};

  const profileMap = await getDriverProfileDisplayBatch(ids);
  const entries = Object.entries(profileMap);
  const urls = await Promise.all(
    entries.map(([, profile]) =>
      resolveDriverAvatarFromProfileFields(profile.avatarUrl, profile.avatarSeed),
    ),
  );
  const result: Record<string, string> = {};
  for (let i = 0; i < entries.length; i++) {
    const url = urls[i];
    if (url) result[entries[i][0]] = url;
  }
  return result;
}

export interface LedgerRow {
  id: string;
  organization_id: string;
  profileImageUrl?: string | null;
  trip_id: string | null;
  /** Resolved from joined trips.trip_number or trip list */
  trip_number?: string | null;
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  /** From cash_entries for entity tab aggregation */
  contact_id?: string | null;
  contact_type?: "client" | "supplier" | "driver" | "dco" | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  primary_category?: string | null;
  payment_mode?: string | null;
  payment_reference?: string | null;
  reconciliation_status?: "match_found" | "reconciled" | "mismatch" | null;
  reconciliation_label?: string | null;
  reconciliation_action_label?: string | null;
  reconciliation_helper_text?: string | null;
  /** Set when migration 20260423190000 is applied; else derived in UI. */
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
  /** Chat "Add to book" mirror — source transaction id (dedupe); migration 20260601100000. */
  chat_mirror_of_transaction_id?: string | null;
  /** User who recorded the entry (profiles.id). */
  created_by?: string | null;
  /**
   * Synthetic row for money that is REQUESTED but not yet paid (e.g. a pending
   * driver_salary_requests row surfaced in Cash Flow so the header total matches the
   * list). No cash has moved, so receipt UI must not label it "Payment sent" — see
   * ledgerReceiptFromRow in features/finance/utils/ledgerTransactionReceipt.util.ts.
   * Absent/false on real transactions.
   */
  is_pending_request?: boolean;
}

export interface CreateLedgerEntryData {
  trip_id?: string | null;
  trip_number?: string | null;
  /**
   * When true (Ledger Sync only): use pulse-unified-base / qunifiedbase-style write — no
   * `resolveTripContextForLedgerWrite`, no trip-id retry, description not augmented with QMETA.
   * For cross-org integrated getLoad (indent) flows where the DB expects the owner trip UUID as sent from the UI.
   */
  ledgerWritePassthroughTripContext?: boolean;
  /** Party display name; stored as contact_name */
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date?: string;
  /** When provided, stored on cash_entries for aggregation and auto-tag */
  contact_id?: string | null;
  contact_type?: "client" | "supplier" | "driver" | "dco" | null;
  category?: string | null;
  indent_id?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
  /** Structured payment reference/UTR (transactions.payment_reference). When omitted, derived from `description` for backward compatibility. */
  payment_reference?: string | null;
}

type LedgerContactType = "client" | "supplier" | "driver" | "dco";

const GENERIC_PARTY_LABELS = new Set([
  "",
  "-",
  "—",
  "party",
  "client",
  "supplier",
  "driver",
]);

function normalizePartyName(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

function isGenericPartyName(raw: string | null | undefined): boolean {
  return GENERIC_PARTY_LABELS.has(normalizePartyName(raw).toLowerCase());
}

/** UI already picked trip + number (Ledger Sync) — skip pre-insert trip lookup. */
function ledgerWriteHasUiTripContext(entry: CreateLedgerEntryData): boolean {
  if (entry.ledgerWritePassthroughTripContext === true) return true;
  return (
    String(entry.trip_id ?? "").trim().length > 0 &&
    String(entry.trip_number ?? "").trim().length > 0
  );
}

function shouldResolveLedgerContactName(
  contactType: LedgerContactType | null,
  contactId: string | null | undefined,
  fallbackPartyName: string,
): boolean {
  const id = normalizePartyName(contactId);
  return (
    !!contactType &&
    id.length > 0 &&
    isGenericPartyName(fallbackPartyName)
  );
}

function scheduleLedgerInsertSideEffects(
  orgId: string,
  row: InsertedTxnRowForChat,
): void {
  void syncTripAmountPaidFromLedger(orgId, row.trip_id ?? null);
  void tryNotifyLinkedPartyChatAfterLedgerInsert(orgId, row);
  notifyTripChatMessagesChanged();
  if (row.trip_id) {
    if (row.contact_type === "client" && Number(row.amount_in) > 0) {
      void recordTripWorkflowEvent({
        tripId: row.trip_id,
        orgId,
        eventType: "client.payment_received",
      }).catch((err) => {
        console.warn("[finance] recordTripWorkflowEvent (client) failed:", err);
      });
    } else if (row.contact_type === "supplier" && Number(row.amount_out) > 0) {
      void recordTripWorkflowEvent({
        tripId: row.trip_id,
        orgId,
        eventType: "supplier.payment_recorded",
      }).catch((err) => {
        console.warn("[finance] recordTripWorkflowEvent (supplier) failed:", err);
      });
    }
  }
}

async function resolveContactDisplayName(
  orgId: string,
  contactType: LedgerContactType,
  contactId: string,
): Promise<string | null> {
  const trimmedContactId = contactId.trim();
  if (!trimmedContactId) return null;

  if (contactType === "client") {
    const { data } = await supabase()
      .from("clients")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", trimmedContactId)
      .maybeSingle();
    return (
      normalizePartyName((data as { name?: string | null } | null)?.name) ||
      null
    );
  }

  if (contactType === "supplier") {
    const { data } = await supabase()
      .from("suppliers")
      .select("name, company_name")
      .eq("organization_id", orgId)
      .eq("id", trimmedContactId)
      .maybeSingle();
    const row = data as {
      name?: string | null;
      company_name?: string | null;
    } | null;
    return (
      normalizePartyName(row?.name) ||
      normalizePartyName(row?.company_name) ||
      null
    );
  }

  if (contactType === "dco") {
    // dco_payees has no organization_id (a DCO is a global, person-owned
    // identity, not an org-owned record like suppliers/drivers) — cannot
    // filter by orgId here. Name itself lives on profiles, not dco_payees.
    const { data: payee } = await supabase()
      .from("dco_payees")
      .select("user_id")
      .eq("id", trimmedContactId)
      .maybeSingle();
    const userId = (payee as { user_id?: string | null } | null)?.user_id;
    if (!userId) return null;
    const { data: profile } = await supabase()
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    return (
      normalizePartyName((profile as { full_name?: string | null } | null)?.full_name) ||
      null
    );
  }

  const { data } = await supabase()
    .from("drivers")
    .select("name")
    .eq("organization_id", orgId)
    .eq("id", trimmedContactId)
    .maybeSingle();
  return (
    normalizePartyName((data as { name?: string | null } | null)?.name) || null
  );
}

async function resolveTripContextForLedgerWrite(params: {
  orgId: string;
  tripId?: string | null;
  tripNumber?: string | null;
  indentId?: string | null;
}): Promise<{ tripId: string | null; tripNumber: string | null }> {
  const { orgId } = params;
  const requestedTripId = String(params.tripId ?? "").trim();
  const requestedTripNumber = String(params.tripNumber ?? "").trim();
  const requestedIndentId = String(params.indentId ?? "").trim();
  const looksLikeUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  if (!requestedTripId) {
    return {
      tripId: null,
      tripNumber: requestedTripNumber || null,
    };
  }

  const resolveLocalTripByIndent = async (
    candidateIndentId: string,
  ): Promise<{ tripId: string | null; tripNumber: string | null }> => {
    const normalized = String(candidateIndentId ?? "").trim();
    if (!normalized) return { tripId: null, tripNumber: null };
    const { data: localTripByIndent, error: localTripByIndentError } =
      await supabase()
        .from("trips")
        .select("id, trip_number")
        .eq("organization_id", orgId)
        .eq("indent_id", normalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (localTripByIndentError) {
      console.warn("[finance] trip context mapping by indent failed", {
        orgId,
        indentId: normalized,
        detail: localTripByIndentError.message,
      });
      return { tripId: null, tripNumber: null };
    }
    if (!localTripByIndent) return { tripId: null, tripNumber: null };
    return {
      tripId: String((localTripByIndent as { id: string }).id),
      tripNumber: String(
        (localTripByIndent as { trip_number?: string | null }).trip_number ?? "",
      ).trim() || null,
    };
  };

  const resolveLocalTripByNumber = async (
    candidateTripNumber: string,
  ): Promise<{ tripId: string | null; tripNumber: string | null }> => {
    const normalized = String(candidateTripNumber ?? "").trim();
    if (!normalized) return { tripId: null, tripNumber: null };
    const { data: localTrip, error: localTripError } = await supabase()
      .from("trips")
      .select("id, trip_number")
      .eq("organization_id", orgId)
      .eq("trip_number", normalized)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (localTripError) {
      console.warn("[finance] trip context mapping by number failed", {
        orgId,
        tripNumber: normalized,
        detail: localTripError.message,
      });
      return { tripId: null, tripNumber: normalized };
    }
    if (!localTrip) return { tripId: null, tripNumber: normalized };
    return {
      tripId: String((localTrip as { id: string }).id),
      tripNumber: String(
        (localTrip as { trip_number?: string | null }).trip_number ?? normalized,
      ),
    };
  };

  const { data: tripById, error: tripByIdError } = await supabase()
    .from("trips")
    .select("id, organization_id, trip_number")
    .eq("id", requestedTripId)
    .maybeSingle();

  if (tripByIdError) {
    const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
    if (mappedByIndent.tripId) return mappedByIndent;
    const mappedByNumber = await resolveLocalTripByNumber(requestedTripNumber);
    if (mappedByNumber.tripId || mappedByNumber.tripNumber) return mappedByNumber;
    if (looksLikeUuid(requestedTripId)) {
      return {
        tripId: requestedTripId,
        tripNumber: requestedTripNumber || null,
      };
    }
    return {
      tripId: null,
      tripNumber: requestedTripNumber || null,
    };
  }

  if (!tripById) {
    // Cross-org / restricted RLS: trip row may be unreadable; map by indent or trip_number in this org when possible.
    const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
    if (mappedByIndent.tripId) return mappedByIndent;
    const mappedByNumber = await resolveLocalTripByNumber(requestedTripNumber);
    if (mappedByNumber.tripId) return mappedByNumber;
    if (mappedByNumber.tripNumber) return mappedByNumber;
    if (requestedTripNumber) {
      return {
        tripId: null,
        tripNumber: requestedTripNumber,
      };
    }
    if (looksLikeUuid(requestedTripId)) {
      return {
        tripId: requestedTripId,
        tripNumber: null,
      };
    }
    return {
      tripId: null,
      tripNumber: null,
    };
  }

  const row = tripById as {
    id: string;
    organization_id: string;
    trip_number: string | null;
  };
  if (row.organization_id === orgId) {
    return {
      tripId: row.id,
      tripNumber: requestedTripNumber || (row.trip_number ?? null),
    };
  }

  const candidateTripNumber =
    requestedTripNumber || String(row.trip_number ?? "").trim();

  const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
  if (mappedByIndent.tripId) {
    return {
      tripId: mappedByIndent.tripId,
      tripNumber: mappedByIndent.tripNumber ?? (candidateTripNumber || null),
    };
  }

  if (!candidateTripNumber) {
    return {
      // Cross-org trips can still be the intended anchor for shared-ledger entries.
      tripId: row.id,
      tripNumber: requestedTripNumber || null,
    };
  }

  const mappedByNumber = await resolveLocalTripByNumber(candidateTripNumber);
  if (mappedByNumber.tripId) return mappedByNumber;

  // No local mirrored trip row: do not reference the owner-org trip_id from this org's ledger.
  // DB policies / checks often require transactions.trip_id to belong to organization_id; trip_number in meta preserves linkage.
  return {
    tripId: null,
    tripNumber: candidateTripNumber,
  };
}

async function syncTripAmountPaidFromLedger(
  orgId: string,
  tripId: string | null | undefined,
): Promise<void> {
  const normalizedTripId = String(tripId ?? "").trim();
  if (!normalizedTripId) return;
  const { data: sums, error: sumsError } = await supabase()
    .from("transactions")
    .select("amount_in")
    .eq("organization_id", orgId)
    .eq("trip_id", normalizedTripId);
  if (sumsError) {
    console.warn("[finance] trip amount_paid sync read failed", {
      organizationId: orgId,
      tripId: normalizedTripId,
      message: sumsError.message,
    });
    return;
  }
  const totalIn = (sums ?? []).reduce(
    (sum, row) => sum + Number((row as { amount_in?: number | null }).amount_in ?? 0),
    0,
  );
  const amountPaid = Math.max(0, Math.round(totalIn * 100) / 100);
  const { error: updateError } = await supabase()
    .from("trips")
    .update({
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedTripId)
    .eq("organization_id", orgId);
  if (updateError) {
    console.warn("[finance] trip amount_paid sync write failed", {
      organizationId: orgId,
      tripId: normalizedTripId,
      message: updateError.message,
    });
  }
}

function enrichLedgerMetaFromRow(
  entry: CreateLedgerEntryData,
): CreateLedgerEntryData {
  const s = interpretLedgerRowStructured({
    contact_id: entry.contact_id ?? null,
    contact_type: entry.contact_type ?? null,
    trip_id: entry.trip_id ?? null,
    description: entry.description ?? null,
    amount_in: entry.amount_in ?? 0,
    amount_out: entry.amount_out ?? 0,
    vehicle_number: entry.vehicle_number ?? null,
  });
  return {
    ...entry,
    ledger_entity_type: entry.ledger_entity_type ?? s.entity_type,
    ledger_flow_type: entry.ledger_flow_type ?? s.transaction_type,
    ledger_category: entry.ledger_category ?? s.category,
    payment_reference: entry.payment_reference ?? s.reference_number,
  };
}

type LedgerDescriptionMeta = {
  trip_number?: string | null;
  indent_id?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  payment_mode?: string | null;
  payment_reference?: string | null;
  category?: string | null;
};

const LEDGER_META_PREFIX = "[[QMETA:";
const LEDGER_META_SUFFIX = "]]";

function cleanTextValue(raw: string | null | undefined): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLedgerMeta(
  meta: LedgerDescriptionMeta,
): LedgerDescriptionMeta | null {
  const normalized: LedgerDescriptionMeta = {
    trip_number: cleanTextValue(meta.trip_number),
    indent_id: cleanTextValue(meta.indent_id),
    vehicle_number: cleanTextValue(meta.vehicle_number),
    driver_name: cleanTextValue(meta.driver_name),
    payment_mode: cleanTextValue(meta.payment_mode),
    payment_reference: cleanTextValue(meta.payment_reference),
    category: cleanTextValue(meta.category),
  };
  const hasAnyValue = Object.values(normalized).some((v) => v != null);
  return hasAnyValue ? normalized : null;
}

function stripLedgerMeta(description: string | null | undefined): string {
  const raw = String(description ?? "");
  const idx = raw.lastIndexOf(LEDGER_META_PREFIX);
  if (idx < 0) return raw.trim();
  return raw.slice(0, idx).trim();
}

function extractLedgerMeta(
  description: string | null | undefined,
): LedgerDescriptionMeta {
  const raw = String(description ?? "");
  const idx = raw.lastIndexOf(LEDGER_META_PREFIX);
  if (idx < 0) return {};
  const start = idx + LEDGER_META_PREFIX.length;
  const end = raw.indexOf(LEDGER_META_SUFFIX, start);
  if (end < 0) return {};
  const encoded = raw.slice(start, end);
  try {
    const parsed = JSON.parse(encoded) as LedgerDescriptionMeta;
    return normalizeLedgerMeta(parsed) ?? {};
  } catch {
    return {};
  }
}

function buildDescriptionWithMeta(
  baseDescription: string,
  meta: LedgerDescriptionMeta,
  maxLength?: number,
): string {
  const normalizedMeta = normalizeLedgerMeta(meta);
  const cleanDescription = stripLedgerMeta(baseDescription);
  if (!normalizedMeta) return cleanDescription;
  const metaSuffix = ` ${LEDGER_META_PREFIX}${JSON.stringify(normalizedMeta)}${LEDGER_META_SUFFIX}`;
  if (!maxLength || maxLength <= 0) return `${cleanDescription}${metaSuffix}`;
  if (metaSuffix.length >= maxLength)
    return cleanDescription.slice(0, maxLength);
  const baseAllowed = Math.max(0, maxLength - metaSuffix.length);
  return `${cleanDescription.slice(0, baseAllowed)}${metaSuffix}`;
}

/** After DB rejects trip_id: null anchor + QMETA trip_number (needed when first attempt used passthrough plain text). */
function buildUnanchoredLedgerRetryDescription(
  payloadDescription: string,
  entry: CreateLedgerEntryData,
  tripNumber: string | null | undefined,
): string {
  const clean =
    stripLedgerMeta(payloadDescription).trim() ||
    String(entry.description ?? "ENTRY").trim() ||
    "ENTRY";
  const baseLine = clean.split("|")[0]?.trim() || clean;
  return buildDescriptionWithMeta(
    baseLine,
    {
      trip_number: cleanTextValue(tripNumber),
      indent_id: entry.indent_id,
      vehicle_number: entry.vehicle_number,
      driver_name: entry.driver_name,
      payment_mode: parsePaymentMode(entry.description),
      payment_reference: parsePaymentReference(entry.description),
      category: normalizePrimaryCategory(entry.description),
    },
    VALIDATION.DESCRIPTION_MAX_LENGTH,
  );
}

function normalizePrimaryCategory(raw: string | null | undefined): string {
  const firstPart = stripLedgerMeta(raw).split("|")[0]?.trim();
  return firstPart || "ENTRY";
}

function parsePaymentMode(raw: string | null | undefined): string | null {
  const meta = extractLedgerMeta(raw);
  if (meta.payment_mode) return meta.payment_mode;
  const match = stripLedgerMeta(raw).match(/(?:^|\|)\s*Mode:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function parsePaymentReference(raw: string | null | undefined): string | null {
  const meta = extractLedgerMeta(raw);
  if (meta.payment_reference) return meta.payment_reference;
  const match = stripLedgerMeta(raw).match(/(?:^|\|)\s*UTR:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function deriveReconciliationMeta(row: {
  description?: string | null;
  /** Full description before stripLedgerMeta — used to read QMETA trip_number when trip_id is null. */
  descriptionRaw?: string | null;
  trip_id?: string | null;
  contact_id?: string | null;
  contact_type?: LedgerRow["contact_type"];
  amount_in?: number;
  amount_out?: number;
}): Pick<
  LedgerRow,
  | "reconciliation_status"
  | "reconciliation_label"
  | "reconciliation_action_label"
  | "reconciliation_helper_text"
> {
  const description = String(row.description ?? "").toLowerCase();
  if (description.includes("shared ledger sync")) {
    return {
      reconciliation_status: "reconciled",
      reconciliation_label: "Reconciled",
      reconciliation_action_label: "View linked entry",
      reconciliation_helper_text: "Linked using shared ledger reconciliation.",
    };
  }

  const hasCounterparty = !!row.contact_id && !!row.contact_type;
  const metaTrip = extractLedgerMeta(row.descriptionRaw ?? row.description ?? "");
  const hasTripAnchor =
    !!row.trip_id ||
    !!(metaTrip.trip_number && String(metaTrip.trip_number).trim());
  const hasMoney =
    Number(row.amount_in ?? 0) > 0 || Number(row.amount_out ?? 0) > 0;
  if (hasCounterparty && hasTripAnchor && hasMoney) {
    return {
      reconciliation_status: "match_found",
      reconciliation_label: "Match found",
      reconciliation_action_label:
        Number(row.amount_out ?? 0) > 0 ? "Edit & link" : "Validate & link",
      reconciliation_helper_text:
        "Trip, party, and amount are ready for reconciliation.",
    };
  }

  return {
    reconciliation_status: null,
    reconciliation_label: null,
    reconciliation_action_label: null,
    reconciliation_helper_text: null,
  };
}

export function toLedgerRow(row: {
  id: string;
  organization_id: string;
  trip_id: string | null;
  trip_number?: string | null;
  party_name: string | null;
  description: string | null;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  contact_id: string | null;
  contact_type: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
  payment_reference?: string | null;
  created_by?: string | null;
}): LedgerRow {
  const descriptionRaw = row.description ?? "ENTRY";
  const description = stripLedgerMeta(descriptionRaw) || "ENTRY";
  const meta = extractLedgerMeta(descriptionRaw);
  const tripNumber = getTripOperationalDisplay({
    trip_operational_code: row.trips?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? null,
    display_trip_id: row.trips?.display_trip_id ?? null,
    trip_number: row.trips?.trip_number ?? row.trip_number ?? meta.trip_number ?? null,
  });
  const interpreted = interpretLedgerRowStructured({
    contact_id: row.contact_id,
    contact_type: row.contact_type,
    trip_id: row.trip_id,
    description: descriptionRaw,
    amount_in: row.amount_in,
    amount_out: row.amount_out,
    vehicle_number: row.vehicle_number ?? null,
  });
  return {
    id: row.id,
    organization_id: row.organization_id,
    trip_id: row.trip_id ?? null,
    trip_number: tripNumber === "—" ? null : tripNumber,
    party_name: row.party_name ?? "—",
    description,
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    contact_id: row.contact_id ?? null,
    contact_type: (row.contact_type as LedgerRow["contact_type"]) ?? null,
    vehicle_number: row.vehicle_number ?? meta.vehicle_number ?? null,
    driver_name: row.driver_name ?? meta.driver_name ?? null,
    trips: row.trips
      ? {
          trip_number: getTripOperationalDisplay({
            trip_operational_code: row.trips.trip_operational_code ?? null,
            trip_code: row.trips.trip_code ?? null,
            display_trip_id: row.trips.display_trip_id ?? null,
            trip_number: row.trips.trip_number,
          }),
          display_trip_id: getTripOperationalDisplay({
            trip_operational_code: row.trips.trip_operational_code ?? null,
            trip_code: row.trips.trip_code ?? null,
            display_trip_id: row.trips.display_trip_id ?? null,
            trip_number: row.trips.trip_number,
          }),
          trip_code: row.trips.trip_code ?? null,
          trip_operational_code: row.trips.trip_operational_code ?? null,
        }
      : null,
    profileImageUrl: null,
    primary_category:
      (row.ledger_category ?? "").trim() ||
      normalizePrimaryCategory(descriptionRaw),
    payment_mode: parsePaymentMode(descriptionRaw),
    payment_reference: row.payment_reference ?? parsePaymentReference(descriptionRaw),
    ...deriveReconciliationMeta({
      description,
      descriptionRaw,
      trip_id: row.trip_id,
      contact_id: row.contact_id,
      contact_type: (row.contact_type as LedgerRow["contact_type"]) ?? null,
      amount_in: row.amount_in,
      amount_out: row.amount_out,
    }),
    ledger_entity_type: row.ledger_entity_type ?? interpreted.entity_type,
    ledger_flow_type: row.ledger_flow_type ?? interpreted.transaction_type,
    ledger_category: row.ledger_category ?? interpreted.category,
    created_by: row.created_by ?? null,
  };
}

export async function getTransactionsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{
  error: Error | null;
  transactions: LedgerRow[];
  hasMore?: boolean;
}> {
  // No nested `trips!trip_id` embed: that PostgREST join was 8–12s on this
  // project and timed out the 12s client fetch, leaving Finance on "Loading…".
  // Trip labels still resolve from `trip_number` / description meta in toLedgerRow.
  const base = () =>
    supabase()
      .from("transactions")
      .select(LEDGER_TX_COLUMNS)
      .eq("organization_id", orgId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

  type Row = Parameters<typeof toLedgerRow>[0];

  if (opts != null) {
    const limit = opts.limit ?? LEDGER_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { from, to } = toRange(offset, limit);
    const { data, error } = await base().range(from, to);
    if (error) return { error: new Error(error.message), transactions: [] };
    const transactions: LedgerRow[] = ((data ?? []) as unknown as Row[]).map(toLedgerRow);
    return { error: null, transactions, hasMore: transactions.length === limit };
  }

  const { data, error } = await base().limit(500);
  if (error) return { error: new Error(error.message), transactions: [] };

  const transactions: LedgerRow[] = ((data ?? []) as unknown as Row[]).map(toLedgerRow);

  return { error: null, transactions };
}

/**
 * Same base query as getTransactionsByOrganization, but with NO row cap — used
 * ONLY to compute the Cash tab's headline totals so they stay correct for
 * organizations with more than 500 transactions. The capped list above remains
 * the source for the displayed/paginated ledger; this is a separate,
 * aggregate-only fetch. Still join-free (the nested `trips!trip_id` embed, not
 * row count, was what caused the original 8-12s timeout removed in c61f7d3d).
 *
 * DO NOT add .limit()/.range() here. The grand total must reflect every
 * matching row; capping it silently truncates the headline figure for large
 * orgs, which was a confirmed release blocker. Filtered totals are computed by
 * narrowing this set client-side, so the unfiltered fetch must stay complete.
 * getAllTransactionsByOrganizationForTotals.test.ts guards this.
 *
 * It does select an explicit column list rather than `*`: that cuts egress and
 * PostgREST serialization on the widest table in the app without changing which
 * rows come back. The remaining row-count cost is best solved by a server-side
 * SUM aggregate (a DB change, deliberately out of scope here).
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
export async function getAllTransactionsByOrganizationForTotals(
  orgId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  type Row = Parameters<typeof toLedgerRow>[0];
  const { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_COLUMNS)
    .eq("organization_id", orgId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { error: new Error(error.message), transactions: [] };
  const transactions: LedgerRow[] = ((data ?? []) as unknown as Row[]).map(toLedgerRow);
  return { error: null, transactions };
}

export async function getTransactionsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<LedgerRow> }> {
  const { data, error } = await supabase().rpc("get_transactions_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: LedgerRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as LedgerRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncTransactionsWithCache(
  orgId: string,
  currentRows: LedgerRow[],
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  try {
    const transactions = await syncDomainRows<LedgerRow>({
      domain: "transactions",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 4 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getTransactionsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.transactions;
      },
      getDelta: async (cursor) => {
        const res = await getTransactionsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) =>
            new Date(b.transaction_date).getTime() -
            new Date(a.transaction_date).getTime(),
        }),
    });
    return { error: null, transactions };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      transactions: currentRows,
    };
  }
}

/** Fetch ledger transactions for a specific party (client/entity level). */
export async function getTransactionsByOrganizationAndParty(
  orgId: string,
  partyName: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!partyName?.trim()) return getTransactionsByOrganization(orgId);
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .ilike("party_name", `%${partyName.trim()}%`)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .ilike("party_name", `%${partyName.trim()}%`)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
}

/** Fetch ledger transactions for a specific contact (client/supplier id). */
export async function getTransactionsByOrganizationAndContactId(
  orgId: string,
  contactId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!contactId?.trim()) return { error: null, transactions: [] };
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
}

/** Fetch ledger transactions for a driver (contact_type=driver, contact_id=driverId). Used for driver LEDGER tab. */
export async function getTransactionsByOrganizationAndDriver(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!driverId?.trim()) return { error: null, transactions: [] };
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .eq("contact_type", "driver")
    .eq("contact_id", driverId.trim())
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_type", "driver")
      .eq("contact_id", driverId.trim())
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  }>;
  const transactions: LedgerRow[] = rows.map(toLedgerRow);
  return { error: null, transactions };
}

type InsertedTxnRowForChat = {
  id: string;
  trip_id: string | null;
  party_name: string | null;
  description: string | null;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  contact_id: string | null;
  contact_type: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
};

/**
 * Integrated client/supplier: post ledger_event after insert. Errors are swallowed
 * (ledger succeeded); must run to completion — do not detach as untracked promises.
 */
async function tryNotifyLinkedPartyChatAfterLedgerInsert(
  orgId: string,
  row: InsertedTxnRowForChat,
): Promise<void> {
  const ct = (row.contact_type ?? "").toLowerCase();
  if (
    !row.trip_id ||
    !(ct === "client" || ct === "supplier") ||
    !row.contact_id
  )
    return;

  const isIn = row.amount_in > 0;
  try {
    const { data: linkedOrg, error: linkErr } =
      ct === "client"
        ? await supabase()
            .from("clients")
            .select("linked_organization_id, name")
            .eq("id", row.contact_id!)
            .maybeSingle()
        : await supabase()
            .from("suppliers")
            .select("linked_organization_id, company_name, name")
            .eq("id", row.contact_id!)
            .maybeSingle();

    if (linkErr) {
      console.warn(
        "[finance] linked party lookup failed (ledger_event skipped)",
        {
          transactionId: row.id,
          contactType: ct,
          contactId: row.contact_id,
          message: linkErr.message,
        },
      );
      return;
    }

    if (!linkedOrg?.linked_organization_id) return;

    // RLS: users can SELECT only organizations they belong to. Receiver (linked tenant) is blocked,
    // so receiver org name must fall back to the client/supplier record we already read.
    const receiverOrgId = linkedOrg.linked_organization_id;
    const receiverPartyFallback =
      ct === "client"
        ? normalizePartyName((linkedOrg as { name?: string | null }).name)
        : normalizePartyName(
            (
              linkedOrg as {
                company_name?: string | null;
                name?: string | null;
              }
            ).company_name,
          ) || normalizePartyName((linkedOrg as { name?: string | null }).name);

    const [{ data: senderOrg }, { data: receiverOrgRow }] = await Promise.all([
      supabase()
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .maybeSingle(),
      supabase()
        .from("organizations")
        .select("id, name")
        .eq("id", receiverOrgId)
        .maybeSingle(),
    ]);

    if (!senderOrg?.id) {
      console.warn("[finance] sender org missing for ledger_event", {
        transactionId: row.id,
      });
      return;
    }

    const receiverOrgNameResolved =
      normalizePartyName(receiverOrgRow?.name) ||
      receiverPartyFallback ||
      receiverOrgId;

    const { postLedgerEventToChat } = await import("@/features/chat/services/chatLedgerBridge.service");
    await postLedgerEventToChat({
      tripId: row.trip_id!,
      transactionId: row.id,
      amount: isIn ? row.amount_in : row.amount_out,
      flow: isIn ? "in" : "out",
      contactType: ct as "client" | "supplier",
      contactId: row.contact_id!,
      category: normalizePrimaryCategory(row.description) ?? "Payment",
      paymentMode: parsePaymentMode(row.description) ?? "Cash",
      referenceNumber: parsePaymentReference(row.description),
      notes: null,
      senderOrgId: senderOrg.id,
      senderOrgName: senderOrg.name ?? orgId,
      receiverOrgId,
      receiverOrgName: receiverOrgNameResolved,
    });
  } catch (e) {
    console.warn("[finance] ledger_event chat post failed", {
      transactionId: row.id,
      tripId: row.trip_id,
      organizationId: orgId,
      contactType: ct,
      contactId: row.contact_id,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Postgres error `code` (e.g. '23505' unique_violation) is otherwise dropped
 * on the floor by `new Error(error.message)` — callers that need to
 * distinguish a duplicate-key violation (e.g. postCompliancePayment's
 * "already processed" translation) need it preserved.
 */
function ledgerWriteError(error: { message: string; code?: string }): Error {
  const err = new Error(error.message) as Error & { code?: string };
  if (error.code) err.code = error.code;
  return err;
}

export async function createLedgerEntry(
  orgId: string,
  entry: CreateLedgerEntryData,
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const passthroughTripContext = entry.ledgerWritePassthroughTripContext === true;
  const enriched = enrichLedgerMetaFromRow(entry);
  const amountIn = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_in ?? 0),
  );
  const amountOut = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_out ?? 0),
  );
  const rawDate = (
    enriched.transaction_date ?? new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const dateErr = dateISO()(rawDate);
  const date = dateErr ? new Date().toISOString().slice(0, 10) : rawDate;
  const contactIdTrimmed = normalizePartyName(enriched.contact_id);
  if (enriched.contact_type && !contactIdTrimmed) {
    return {
      error: new Error(
        "Pick a customer/supplier before confirming sync. This trip has no linked party id.",
      ),
      row: null,
    };
  }
  const normalizedContactType = (enriched.contact_type ??
    null) as LedgerContactType | null;
  const normalizedContactId = contactIdTrimmed;
  const fallbackPartyName =
    normalizePartyName(enriched.party_name || "—") || "—";
  const usePassthroughTrip = ledgerWriteHasUiTripContext(entry);
  const resolveContactName = shouldResolveLedgerContactName(
    normalizedContactType,
    normalizedContactId,
    fallbackPartyName,
  );

  const [resolvedPartyName, tripContext] = await Promise.all([
    resolveContactName
      ? resolveContactDisplayName(
          orgId,
          normalizedContactType!,
          normalizedContactId!,
        )
      : Promise.resolve(null),
    usePassthroughTrip
      ? Promise.resolve({
          tripId: enriched.trip_id ?? null,
          tripNumber: enriched.trip_number ?? null,
        })
      : resolveTripContextForLedgerWrite({
          orgId,
          tripId: enriched.trip_id,
          tripNumber: enriched.trip_number,
          indentId: enriched.indent_id,
        }),
  ]);
  if (
    normalizedContactType &&
    normalizedContactId &&
    !resolvedPartyName &&
    resolveContactName
  ) {
    return {
      error: new Error(
        `Missing ${normalizedContactType} name for selected contact.`,
      ),
      row: null,
    };
  }
  // Client trip receipts must never push total received past the trip's billed sales —
  // this is how a ₹45,000 trip once showed ₹66,720 received (Ajio/AJI862AJITRIP000004 incident).
  if (normalizedContactType === "client" && tripContext.tripId && amountIn > 0) {
    const { data: tripRow } = await supabase()
      .from("trips")
      .select("id, client_price, supplier_rate, organization_id, indent_id")
      .eq("id", tripContext.tripId)
      .maybeSingle();
    if (tripRow) {
      // Mirror computeTripEntryFinancialSnapshot's sales basis: the trip owner
      // collects its client_price; a partner org on an indent-linked trip
      // collects the supplier_rate. Using owner === orgId here (as before)
      // inverted this and blocked valid owner receipts up to client_price.
      const isOwner = tripRow.organization_id === orgId;
      const isPartnerIndentReceipt = tripRow.indent_id != null && !isOwner;
      const sales = Number(
        (isPartnerIndentReceipt
          ? tripRow.supplier_rate
          : tripRow.client_price) ?? 0,
      );
      if (sales > 0) {
        const { data: existingTx } = await supabase()
          .from("transactions")
          .select("amount_in")
          .eq("trip_id", tripContext.tripId)
          .eq("organization_id", orgId);
        const alreadyReceived = (existingTx ?? []).reduce(
          (sum, tx) => sum + Number(tx.amount_in ?? 0),
          0,
        );
        if (alreadyReceived + amountIn > sales) {
          return {
            error: new Error(
              `This payment (₹${amountIn}) would take total received (₹${alreadyReceived + amountIn}) past the trip's billed sales (₹${sales}).`,
            ),
            row: null,
          };
        }
      }
    }
  }
  const partyName = (
    (resolvedPartyName || fallbackPartyName).trim() || "—"
  ).slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const description = passthroughTripContext
    ? String(enriched.description ?? "ENTRY").slice(
        0,
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      )
    : buildDescriptionWithMeta(
        entry.description ?? "ENTRY",
        {
          trip_number: tripContext.tripNumber,
          indent_id: entry.indent_id,
          vehicle_number: entry.vehicle_number,
          driver_name: entry.driver_name,
          payment_mode: parsePaymentMode(entry.description),
          payment_reference: parsePaymentReference(entry.description),
          category: normalizePrimaryCategory(entry.description),
        },
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      );
  // DB CHECK: exactly one of amount_in or amount_out must be positive
  const isCashIn = amountIn > 0;

  const payload = {
    organization_id: orgId,
    trip_id: tripContext.tripId,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: normalizedContactId || null,
    contact_type: enriched.contact_type ?? null,
    ledger_entity_type: enriched.ledger_entity_type ?? null,
    ledger_flow_type: enriched.ledger_flow_type ?? null,
    ledger_category: enriched.ledger_category ?? null,
    payment_reference: enriched.payment_reference ?? null,
  };

  // Prefer getSession (local) over getUser (network). Never block Confirm Sync
  // if auth is slow — insert without created_by rather than hang the spinner.
  let createdBy: string | null = null;
  try {
    const { data } = await withTimeout(
      () => supabase().auth.getSession(),
      AUTH_TIMEOUT_MS,
      { jitter: false },
    );
    createdBy = data.session?.user?.id ?? null;
  } catch {
    createdBy = null;
  }
  let insertPayload: Record<string, unknown> = {
    ...payload,
    ...(createdBy ? { created_by: createdBy } : {}),
  };

  let { data, error } = await supabase()
    .from("transactions")
    .insert(insertPayload)
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .single();

  if (error && isMissingPaymentReferenceColumnError(error)) {
    insertPayload = omitPaymentReferenceField(insertPayload);
    ({ data, error } = await supabase()
      .from("transactions")
      .insert(insertPayload)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
  }

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .insert(insertPayload)
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .single());
  }

  if (
    error &&
    isLedgerTripIdRejectedError(error) &&
    (enriched.contact_type === "supplier" ||
      enriched.contact_type === "client" ||
      enriched.ledger_entity_type === "vehicle") &&
    payload.trip_id != null
  ) {
    // Integrated / getLoad: trip_id may be rejected (incl. after passthrough first attempt). Retry unanchored + QMETA trip_number.
    const unanchoredPayload = {
      ...insertPayload,
      trip_id: null,
      description: buildUnanchoredLedgerRetryDescription(
        payload.description,
        entry,
        tripContext.tripNumber ?? enriched.trip_number,
      ),
    };
    ({ data, error } = await supabase()
      .from("transactions")
      .insert(unanchoredPayload)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await supabase()
        .from("transactions")
        .insert(unanchoredPayload)
        .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
        .single());
    }
  }

  if (error) return { error: ledgerWriteError(error), row: null };

  const row = data as InsertedTxnRowForChat & {
    organization_id: string;
  };

  scheduleLedgerInsertSideEffects(orgId, row);

  return { error: null, row: toLedgerRow(row) };
}

export async function updateLedgerEntry(
  orgId: string,
  entryId: string,
  entry: CreateLedgerEntryData,
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const passthroughTripContext = entry.ledgerWritePassthroughTripContext === true;
  const enriched = enrichLedgerMetaFromRow(entry);
  const amountIn = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_in ?? 0),
  );
  const amountOut = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_out ?? 0),
  );
  const rawDate = (
    enriched.transaction_date ?? new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const date = dateISO()(rawDate)
    ? new Date().toISOString().slice(0, 10)
    : rawDate;
  const isCashIn = amountIn > 0;
  const contactIdTrimmed = normalizePartyName(enriched.contact_id);
  if (enriched.contact_type && !contactIdTrimmed) {
    return {
      error: new Error(
        "Pick a customer/supplier before confirming sync. This trip has no linked party id.",
      ),
      row: null,
    };
  }
  const normalizedContactType = (enriched.contact_type ??
    null) as LedgerContactType | null;
  const normalizedContactId = contactIdTrimmed;
  const fallbackPartyName =
    normalizePartyName(enriched.party_name || "—") || "—";
  const usePassthroughTrip = ledgerWriteHasUiTripContext(entry);
  const resolveContactName = shouldResolveLedgerContactName(
    normalizedContactType,
    normalizedContactId,
    fallbackPartyName,
  );

  const [resolvedPartyName, tripContext] = await Promise.all([
    resolveContactName
      ? resolveContactDisplayName(
          orgId,
          normalizedContactType!,
          normalizedContactId!,
        )
      : Promise.resolve(null),
    usePassthroughTrip
      ? Promise.resolve({
          tripId: enriched.trip_id ?? null,
          tripNumber: enriched.trip_number ?? null,
        })
      : resolveTripContextForLedgerWrite({
          orgId,
          tripId: enriched.trip_id,
          tripNumber: enriched.trip_number,
          indentId: enriched.indent_id,
        }),
  ]);
  if (
    normalizedContactType &&
    normalizedContactId &&
    !resolvedPartyName &&
    resolveContactName
  ) {
    return {
      error: new Error(
        `Missing ${normalizedContactType} name for selected contact.`,
      ),
      row: null,
    };
  }
  const partyName = (
    (resolvedPartyName || fallbackPartyName).trim() || "—"
  ).slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const description = passthroughTripContext
    ? String(enriched.description ?? "ENTRY").slice(
        0,
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      )
    : buildDescriptionWithMeta(
        entry.description ?? "ENTRY",
        {
          trip_number: tripContext.tripNumber,
          indent_id: entry.indent_id,
          vehicle_number: entry.vehicle_number,
          driver_name: entry.driver_name,
          payment_mode: parsePaymentMode(entry.description),
          payment_reference: parsePaymentReference(entry.description),
          category: normalizePrimaryCategory(entry.description),
        },
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      );

  const payload = {
    trip_id: tripContext.tripId,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: normalizedContactId || null,
    contact_type: enriched.contact_type ?? null,
    ledger_entity_type: enriched.ledger_entity_type ?? null,
    ledger_flow_type: enriched.ledger_flow_type ?? null,
    ledger_category: enriched.ledger_category ?? null,
    payment_reference: enriched.payment_reference ?? null,
  };

  let updatePayload: Record<string, unknown> = { ...payload };

  let { data, error } = await supabase()
    .from("transactions")
    .update(updatePayload)
    .eq("id", entryId)
    .eq("organization_id", orgId)
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .single();

  if (error && isMissingPaymentReferenceColumnError(error)) {
    updatePayload = omitPaymentReferenceField(updatePayload);
    ({ data, error } = await supabase()
      .from("transactions")
      .update(updatePayload)
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
  }

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .update(updatePayload)
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .single());
  }

  if (
    error &&
    isLedgerTripIdRejectedError(error) &&
    (enriched.contact_type === "supplier" ||
      enriched.contact_type === "client" ||
      enriched.ledger_entity_type === "vehicle") &&
    payload.trip_id != null
  ) {
    const unanchoredPayload = {
      ...updatePayload,
      trip_id: null,
      description: buildUnanchoredLedgerRetryDescription(
        payload.description,
        entry,
        tripContext.tripNumber ?? enriched.trip_number,
      ),
    };
    ({ data, error } = await supabase()
      .from("transactions")
      .update(unanchoredPayload)
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await supabase()
        .from("transactions")
        .update(unanchoredPayload)
        .eq("id", entryId)
        .eq("organization_id", orgId)
        .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
        .single());
    }
  }

  if (error) return { error: ledgerWriteError(error), row: null };
  if (!data) return { error: new Error("Update returned no row"), row: null };

  const row = data as {
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: {
      trip_number: string;
      display_trip_id?: string | null;
      trip_code?: string | null;
      trip_operational_code?: string | null;
    } | null;
    ledger_entity_type?: string | null;
    ledger_flow_type?: string | null;
    ledger_category?: string | null;
  };

  void syncTripAmountPaidFromLedger(orgId, row.trip_id ?? null);
  // updateLedgerEntry intentionally does not post to chat to avoid duplicate events.
  return { error: null, row: toLedgerRow(row) };
}

/**
 * Create an opening balance entry for a client or supplier.
 * Called during onboarding when a company migrates from another system.
 *
 * For a CLIENT with outstanding RECEIVABLE: amount_in = outstanding (they owe us)
 * For a SUPPLIER with outstanding PAYABLE: amount_out = outstanding (we owe them)
 *
 * The entry is flagged is_opening_balance=true so it's excluded from normal P&L.
 */
export async function createOpeningBalance(
  orgId: string,
  params: {
    contactType: 'client' | 'supplier';
    contactId: string;
    partyName: string;
    amount: number;
    direction: 'receivable' | 'payable';  // receivable = they owe us; payable = we owe them
    asOnDate: string;  // YYYY-MM-DD
  },
): Promise<{ error: Error | null }> {
  const isReceivable = params.direction === 'receivable';
  const { error } = await supabase()
    .from('transactions')
    .insert({
      organization_id: orgId,
      party_name: params.partyName,
      description: `Opening balance as on ${params.asOnDate}`,
      amount_in:   isReceivable ? params.amount : 0,
      amount_out:  isReceivable ? 0 : params.amount,
      transaction_date: params.asOnDate,
      contact_id:   params.contactId,
      contact_type: params.contactType,
      ledger_flow_type: 'opening_balance',
      is_opening_balance: true,
    });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
