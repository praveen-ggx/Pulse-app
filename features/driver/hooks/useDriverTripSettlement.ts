import { useAuth } from "@/contexts/AuthContext";
import {
  buildDriverTripSettlementView,
  type DriverTripSettlementView,
} from "@/features/driver/tripSettlement/driverTripSettlement.util";
import * as driversService from "@/features/drivers/services/drivers.service";
import {
  buildSettlementShareMessage,
  buildTripClaimWhatsappMessage,
} from "@/features/driver/utils/driverCommunication.util";
import { phonePeMetaDate } from "@/features/driver/utils/driverGpayTransactions.util";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import { isCompleted as isTripCompleted } from "@/features/driver/tripHistory/tripHistoryDetail.util";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { injectPulseWatermarkIntoHtml } from "@/lib/reportWatermark.util";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform, Share } from "react-native";
import { resolveAgreedPayTerms } from "@/features/drivers/utils/driverPayTerms.util";

function openWhatsAppReminder(message: string) {
  const encoded = encodeURIComponent(message);
  const waWeb = `https://wa.me/?text=${encoded}`;
  const waNative = `whatsapp://send?text=${encoded}`;
  void (async () => {
    try {
      if (Platform.OS !== "web") {
        const can = await Linking.canOpenURL(waNative);
        await Linking.openURL(can ? waNative : waWeb);
      } else {
        await Linking.openURL(waWeb);
      }
    } catch {
      // ignore
    }
  })();
}

function buildTripClaimHtml(p: {
  fleetName: string;
  displayId: string;
  amount: number;
  from: string;
  to: string;
  status: string;
  capturedAt: string;
  driverName?: string | null;
  driverPhone?: string | null;
  tripDate?: string | null;
  paymentRequestId?: string | null;
}) {
  const safe = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const driverLine = [p.driverName?.trim() || null, p.driverPhone?.trim() || null]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;margin:0;color:#0f172a}
    .page{padding:24px}.card{border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}
    .hero{padding:22px;background:#0b1220;color:#fff}.eyebrow{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:10px}
    .title{font-size:20px;font-weight:700;margin:0 0 8px}.sub{font-size:12px;color:rgba(255,255,255,.62);margin:0}
    .amount{font-size:38px;font-weight:800;margin:14px 0 0;color:#fb923c}
    .rows{padding:18px}.row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px dashed #e2e8f0}
    .k{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748b}.v{font-size:14px;font-weight:600;text-align:right}
  </style></head><body><div class="page"><div class="card"><div class="hero">
    <div class="eyebrow">Payment request · Trip settlement</div>
    <p class="title">${safe(p.displayId)}</p><p class="sub">${safe(p.fleetName)}</p>
    <p class="sub">${safe(p.from)} → ${safe(p.to)}</p>
    ${driverLine ? `<p class="sub">${safe(driverLine)}</p>` : ""}
    ${p.tripDate ? `<p class="sub">${safe(p.tripDate)}</p>` : ""}
    <p class="amount">₹${Math.round(p.amount).toLocaleString("en-IN")}</p>
  </div><div class="rows">
    ${p.paymentRequestId ? `<div class="row"><div class="k">Request reference</div><div class="v">${safe(p.paymentRequestId)}</div></div>` : ""}
    <div class="row"><div class="k">Status</div><div class="v">${safe(p.status)}</div></div>
    <div class="row"><div class="k">Captured at</div><div class="v">${safe(p.capturedAt)}</div></div>
  </div></div></div></body></html>`;
}

function buildTripSettlementHtml(p: {
  fleetName: string;
  displayId: string;
  amount: number;
  transactionId: string;
  utr: string;
  paymentMode: string;
  capturedAt: string;
  route: string;
}) {
  const safe = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;margin:0;color:#0f172a}
    .page{padding:24px}.card{border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}
    .hero{padding:28px 22px 20px;text-align:center;background:#f8fafc}
    .eyebrow{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#16a34a;margin-bottom:10px}
    .amount{font-size:44px;font-weight:700;margin:0}
    .rows{padding:18px}.row{display:flex;justify-content:space-between;gap:14px;padding:10px 0}
    .k{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748b}
    .v{font-size:14px;font-weight:600;text-align:right}
  </style></head><body><div class="page"><div class="card"><div class="hero">
    <div class="eyebrow">Settlement received</div>
    <p class="amount">₹${Math.round(p.amount).toLocaleString("en-IN")}</p>
  </div><div class="rows">
    <div class="row"><div class="k">Transaction ID</div><div class="v">${safe(p.transactionId)}</div></div>
    <div class="row"><div class="k">UTR</div><div class="v">${safe(p.utr)}</div></div>
    <div class="row"><div class="k">Payment mode</div><div class="v">${safe(p.paymentMode)}</div></div>
    <div class="row"><div class="k">Captured at</div><div class="v">${safe(p.capturedAt)}</div></div>
    <div class="row"><div class="k">Route</div><div class="v">${safe(p.route)}</div></div>
  </div></div></div></body></html>`;
}

async function sharePdf(html: string, dialogTitle: string) {
  const file = await Print.printToFileAsync({ html: injectPulseWatermarkIntoHtml(html) });
  if (Platform.OS === "web") {
    window.open(file.uri, "_blank");
    return;
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert("Share unavailable", "Sharing is not available on this device.");
    return;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle,
    UTI: "com.adobe.pdf",
  });
}

export function useDriverTripSettlement(
  trip: TripRow | null,
  opts?: { isFleetLinked?: boolean },
) {
  const { profile } = useAuth();
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>["invites"]
  >([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestPaymentLoading, setRequestPaymentLoading] = useState(false);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [markPaidConfirmState, setMarkPaidConfirmState] = useState<{
    trip: TripRow;
    amount: number;
    sourceLedger?: driversService.DriverLedgerRow | null;
  } | null>(null);
  const [settledSuccessState, setSettledSuccessState] = useState<{
    tripDisplay: string;
    amount: number;
    writeOffAmount?: number;
  } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const tripId = trip?.id?.trim() ?? "";
    if (!profile?.uid || !tripId) {
      if (mountedRef.current) setLoading(false);
      return;
    }
    if (mountedRef.current) setLoading(true);
    const [linkedRes, ledgerRes, invitesRes] = await Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverLedgerByTripId(tripId),
      driversService.getDriverInvitesReceived(),
    ]);
    if (!mountedRef.current) return;
    setLinkedDrivers(linkedRes.drivers ?? []);
    setLedgerEntries(ledgerRes.entries ?? []);
    if (!invitesRes.error) setInvites(invitesRes.invites);
    setLoading(false);
  }, [profile?.uid, trip?.id]);

  useEffect(() => {
    void reload();
  }, [reload, trip?.id]);

  const driverTripNumberById = useMemo(
    () => (trip ? buildDriverTripNumberMap([trip]) : {}),
    [trip],
  );

  const fleetOrgName = useMemo(() => {
    if (!trip) return "Fleet";
    const accepted = invites.filter((i) => (i.status || "").toLowerCase() === "accepted");
    const inv = accepted.find(
      (i) => String(i.from_organization_id || "") === String(trip.organization_id || ""),
    );
    const rawName =
      (inv as { from_org_name?: string | null; fromOrgName?: string | null } | undefined)
        ?.from_org_name ||
      (inv as { from_org_name?: string | null; fromOrgName?: string | null } | undefined)
        ?.fromOrgName ||
      null;
    return rawName && String(rawName).trim() ? String(rawName).trim() : "Fleet";
  }, [trip, invites]);

  const payoutTerms = useMemo(() => {
    if (!trip?.organization_id) return null;
    const orgId = String(trip.organization_id);
    const acceptedInvite = invites.find(
      (inv) =>
        (inv.status || "").toLowerCase() === "accepted" &&
        String(inv.from_organization_id ?? "") === orgId,
    );
    const linkedDriver =
      linkedDrivers.find(
        (d) =>
          String(d.organization_id ?? "") === orgId &&
          String(d.id ?? "") === String(trip.driver_id ?? ""),
      ) ??
      linkedDrivers.find((d) => String(d.organization_id ?? "") === orgId) ??
      null;
    return resolveAgreedPayTerms(linkedDriver, acceptedInvite ?? null);
  }, [trip, invites, linkedDrivers]);

  const isFleetLinkedFromDrivers = useMemo(() => {
    if (!trip?.organization_id) return false;
    const orgId = String(trip.organization_id);
    return linkedDrivers.some((d) => String(d.organization_id ?? "") === orgId);
  }, [trip?.organization_id, linkedDrivers]);

  const isFleetLinked = opts?.isFleetLinked ?? isFleetLinkedFromDrivers;

  const settlementView: DriverTripSettlementView | null = useMemo(() => {
    if (!trip) return null;
    return buildDriverTripSettlementView({
      trip,
      ledgerEntries,
      fleetOrgName,
      driverTripNumberById,
      tripCompleted: isTripCompleted(trip.status),
      payoutTerms,
      isFleetLinked,
    });
  }, [trip, ledgerEntries, fleetOrgName, driverTripNumberById, payoutTerms, isFleetLinked]);

  const requestPayment = useCallback(async () => {
    if (!trip || !settlementView) return;
    const driverId = trip.driver_id ?? linkedDrivers[0]?.id ?? null;
    // Route to the driver's OWN fleet-owner org, not trip.organization_id —
    // on an aggregator/subcontracted trip those can be different orgs.
    const orgId =
      linkedDrivers.find((d) => String(d.id) === String(driverId))?.organization_id ??
      trip.organization_id ??
      null;
    // Only claimable trips (completed, not settled, not already marked paid by
    // the fleet, real agreed terms), and only for what is still owed — the old
    // code asked for the full amount even on part-paid or unfinished trips.
    if (!settlementView.canRequestPayment) {
      const why =
        settlementView.status === "settled"
          ? "This trip is already paid."
          : settlementView.status === "fleet_marked"
            ? "The fleet has marked this trip paid. Confirm the payment instead."
            : settlementView.status === "incomplete"
              ? "Complete the trip before requesting payment."
              : "This trip has nothing to request yet.";
      if (Platform.OS === "web") window.alert(why);
      else Alert.alert("Can't request payment", why);
      return;
    }
    const reqAmount = Math.round(settlementView.outstandingAmount);
    if (!driverId || !orgId || reqAmount <= 0) return;

    setRequestPaymentLoading(true);
    try {
      const { error, request } = await salaryRequestsService.createSalaryRequest(
        driverId,
        orgId,
        "trip_based",
        reqAmount,
        {
          createdBy: profile?.uid ?? null,
          tripIds: [trip.id],
          note: `Request for payment (trip detail): ${settlementView.displayId}`,
        },
      );
      if (error) {
        if (Platform.OS === "web") window.alert(`Could not create claim: ${error.message}`);
        else Alert.alert("Could not create claim", error.message);
        return;
      }

      const capturedAt = phonePeMetaDate(trip.completed_at ?? trip.updated_at ?? trip.created_at);
      const driverRow = linkedDrivers.find((d) => String(d.id) === String(driverId)) ?? linkedDrivers[0] ?? null;
      const tripDate = new Date(trip.completed_at ?? trip.updated_at ?? trip.created_at ?? "").toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        },
      );
      await sharePdf(
        buildTripClaimHtml({
          fleetName: settlementView.fleetName,
          displayId: settlementView.displayId,
          amount: reqAmount,
          from: settlementView.from,
          to: settlementView.to,
          status: settlementView.statusLabel,
          capturedAt,
          driverName: driverRow?.name ?? null,
          driverPhone: driverRow?.phone ?? null,
          tripDate,
          paymentRequestId: request?.id ? String(request.id) : null,
        }),
        "Share payment request (PDF)",
      );

      const msg = buildTripClaimWhatsappMessage({
        fleetName: settlementView.fleetName,
        tripId: settlementView.displayId,
        amount: reqAmount,
        status: settlementView.statusLabel,
        from: settlementView.from,
        to: settlementView.to,
        tripDate,
        driverName: driverRow?.name ?? null,
        driverPhone: driverRow?.phone ?? null,
      });
      openWhatsAppReminder(msg);
    } finally {
      if (mountedRef.current) setRequestPaymentLoading(false);
    }
  }, [trip, settlementView, linkedDrivers, profile?.uid]);

  const markTripAsPaid = useCallback(
    async (
      targetTrip: TripRow,
      amount: number,
      sourceLedger?: driversService.DriverLedgerRow | null,
    ) => {
      const driverId = targetTrip.driver_id ?? linkedDrivers[0]?.id;
      if (!driverId || !targetTrip.organization_id) {
        Alert.alert("Error", "Missing driver or organization.");
        return;
      }

      const rawDescription =
        sourceLedger?.description ??
        `Trip ${getDriverTripDisplayNumber(targetTrip, driverTripNumberById)}`;
      const settledDescription = rawDescription
        .replace(/\s*\|\s*Sync\s*:\s*FLEET_PAID_PENDING\s*/i, "")
        .trim();

      setMarkPaidLoading(true);
      const { error, row } = await driversService.confirmFleetPaidSettlement({
        orgId: targetTrip.organization_id,
        driverId,
        amount,
        tripId: targetTrip.id,
        createdBy: profile?.uid ?? null,
        description: settledDescription,
        sourceLedgerId: sourceLedger?.id ?? null,
      });
      if (!mountedRef.current) return;
      setMarkPaidLoading(false);

      if (error) {
        const message = error.message;
        if (Platform.OS === "web") window.alert(`Could not mark as paid: ${message}`);
        else Alert.alert("Could not mark as paid", message);
        return;
      }

      if (row) setLedgerEntries((prev) => [row!, ...prev]);
      await reload();
      if (!mountedRef.current) return;

      const tripDisplay = getDriverTripDisplayNumber(targetTrip, driverTripNumberById);
      const roundedAmount = Math.round(amount);
      const expectedAmt = settlementView?.expectedAmount ?? Math.round(amount);
      const writeOffAmt = expectedAmt > roundedAmount ? expectedAmt - roundedAmount : 0;
      if (sourceLedger) {
        setSettledSuccessState({
          tripDisplay,
          amount: roundedAmount,
          writeOffAmount: writeOffAmt > 0 ? writeOffAmt : undefined,
        });
      } else if (Platform.OS === "web") {
        window.alert(`${tripDisplay} · ₹${roundedAmount.toLocaleString("en-IN")} recorded as received.`);
      } else {
        Alert.alert(
          "Payment recorded",
          `${tripDisplay} · ₹${roundedAmount.toLocaleString("en-IN")} has been marked as received.`,
        );
      }
    },
    [linkedDrivers, profile?.uid, reload, driverTripNumberById, settlementView],
  );

  const confirmMarkAsPaid = useCallback(
    (sourceLedger?: driversService.DriverLedgerRow | null) => {
      if (!trip || !settlementView) return;
      setMarkPaidConfirmState({
        trip,
        amount: settlementView.amount,
        sourceLedger: sourceLedger ?? null,
      });
    },
    [trip, settlementView],
  );

  const shareSettlementReceipt = useCallback(async () => {
    if (!trip || !settlementView?.settlementLedger) return;
    const ledger = settlementView.settlementLedger;
    const msg = buildSettlementShareMessage({
      fleetName: settlementView.fleetName,
      tripId: settlementView.displayId,
      amount: settlementView.amount,
      transactionId: String(ledger.id),
      utr: settlementView.utr ?? "—",
    });
    await Share.share({ message: msg }).catch(() => {});
  }, [trip, settlementView]);

  const shareSettlementPdf = useCallback(async () => {
    if (!trip || !settlementView?.settlementLedger) return;
    const ledger = settlementView.settlementLedger;
    const capturedAt = phonePeMetaDate(
      ledger.created_at ?? trip.completed_at ?? trip.updated_at ?? trip.created_at,
    );
    await sharePdf(
      buildTripSettlementHtml({
        fleetName: settlementView.fleetName,
        displayId: settlementView.displayId,
        amount: settlementView.amount,
        transactionId: String(ledger.id),
        utr: settlementView.utr ?? "—",
        paymentMode: settlementView.paymentMode ?? "—",
        capturedAt,
        route: `${settlementView.from} → ${settlementView.to}`,
      }),
      "Share receipt PDF",
    );
  }, [trip, settlementView]);


  return {
    settlementView,
    loading,
    reload,
    requestPaymentLoading,
    markPaidLoading,
    requestPayment,
    confirmMarkAsPaid,
    markTripAsPaid,
    shareSettlementReceipt,
    shareSettlementPdf,
    markPaidConfirmState,
    setMarkPaidConfirmState,
    settledSuccessState,
    setSettledSuccessState,
    fleetOrgName,
  };
}
