import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DetailPageLayout } from "@/components/DetailPageLayout";
import { LedgerSettlementPctDock } from "@/components/ledger/LedgerSettlementPctDock";
import {
  LedgerProtocolStripModeTile,
  ledgerPaymentModeVisual,
} from "@/components/ledger/ledgerPaymentVisuals";
import { SmartInput } from "@/components/mobile-input";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { DriverCollectFromSheet } from "@/features/drivers/components/DriverCollectFromSheet";
import { captureDriverTripPayment } from "@/features/drivers/services/driverCapturePayment.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import {
  driverCaptureLaneForTrip,
  parseDriverCaptureLane,
} from "@/features/drivers/utils/driverCapturePayment.util";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import {
  isTripTaggedToParty,
  tripReceivablePartyName,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import * as tripsService from "@/features/trips/services/trips.service";
import { formatLedgerAmountInput } from "@/lib/format";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { showAppAlert } from "@/lib/appAlert";
import { useSafeBack } from "@/lib/useSafeBack";
import { Banknote, Hash } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CAPTURE_MODES = PAYMENT_MODES.filter((mode) =>
  ["CASH", "UPI", "BANK", "CHEQUE"].includes(mode.id),
);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "").trim();
}

export default function DriverCapturePaymentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const onBack = useSafeBack(ROUTES.driverWalletSelf());
  const { profile } = useAuth();
  const params = useLocalSearchParams<{
    tripId?: string;
    due?: string;
    lane?: string;
    partyName?: string;
    mode?: string;
    reference?: string;
  }>();

  const tripId = firstParam(params.tripId);
  const dueHint = Math.max(0, Math.round(Number(firstParam(params.due)) || 0));
  const partyHint = firstParam(params.partyName);
  const modeHint = firstParam(params.mode).toUpperCase();
  const referenceHint = firstParam(params.reference);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trip, setTrip] = useState<tripsService.TripRow | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [isFleetLinked, setIsFleetLinked] = useState(false);
  const [amount, setAmount] = useState(
    dueHint > 0 ? formatLedgerAmountInput(dueHint) : "",
  );
  const [modeId, setModeId] = useState(
    CAPTURE_MODES.some((m) => m.id === modeHint) ? modeHint : "UPI",
  );
  const [reference, setReference] = useState(referenceHint);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [tagOpen, setTagOpen] = useState(false);

  const load = useCallback(async () => {
    if (!tripId || !profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tripRes, driversRes] = await Promise.all([
        tripsService.getAccessibleTripById(tripId),
        driversService.getLinkedDriversForCurrentUser(profile.uid),
      ]);
      const nextTrip = tripRes.trip;
      setTrip(nextTrip);
      const drivers = driversRes.drivers ?? [];
      const match =
        drivers.find((row) => row.id === nextTrip?.driver_id) ??
        drivers.find(
          (row) =>
            String(row.organization_id ?? "") === String(nextTrip?.organization_id ?? "") &&
            !row.left_at,
        ) ??
        drivers[0] ??
        null;
      setDriverId(nextTrip?.driver_id ?? match?.id ?? null);
      const tripOrg = String(nextTrip?.organization_id ?? "").trim();
      setIsFleetLinked(
        !!tripOrg &&
          drivers.some((row) => {
            if (String(row.organization_id ?? "").trim() !== tripOrg) return false;
            if (row.tracking_only === true) return false;
            return driversService.isActiveFleetRelationshipDriver(row);
          }),
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lane =
    parseDriverCaptureLane(firstParam(params.lane)) ??
    (trip ? driverCaptureLaneForTrip(trip, isFleetLinked) : "shipper");
  const tripNumbers = useMemo(
    () => (trip ? buildDriverTripNumberMap([trip]) : {}),
    [trip],
  );
  const tripDisplay = trip ? getDriverTripDisplayNumber(trip, tripNumbers) : "Trip";
  const taggedParty = trip && isTripTaggedToParty(trip);
  const partyName = taggedParty
    ? tripReceivablePartyName(trip)
    : partyHint || (trip ? tripReceivablePartyName(trip) : "Party");
  const needsPartyTag =
    lane === "shipper" && !!trip && !isTripTaggedToParty(trip);
  const amountNum = Math.round(Number(String(amount).replace(/,/g, "")) || 0);
  const cap = dueHint > 0 ? dueHint : amountNum;
  const isCash = modeId === "CASH";
  const canSubmit =
    !!trip &&
    !!driverId &&
    !needsPartyTag &&
    amountNum > 0 &&
    (dueHint <= 0 || amountNum <= dueHint) &&
    (isCash || reference.trim().length > 0) &&
    !submitting;

  const kicker =
    lane === "marketplace"
      ? "Pulse Exchange"
      : lane === "fleet"
        ? "Fleet settlement"
        : "Shipper · Client";

  const submit = useCallback(async () => {
    if (!trip || !driverId || !canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await captureDriverTripPayment({
        trip,
        amount: amountNum,
        paymentModeId: modeId,
        reference,
        paidOn,
        lane,
        driverId,
        createdBy: profile?.uid ?? null,
        tripDisplay,
      });
      if (error) {
        showAppAlert("Could not capture payment", error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(trip.id) });
      showAppAlert(
        lane === "marketplace" ? "Sent for confirmation" : "Payment recorded",
        lane === "marketplace"
          ? "The shipper confirms it in Exchange; then it counts as received."
          : `${tripDisplay} · ${inr(amountNum)} captured.`,
      );
      if (router.canGoBack()) router.back();
      else onBack();
    } finally {
      setSubmitting(false);
    }
  }, [
    amountNum,
    canSubmit,
    driverId,
    lane,
    modeId,
    onBack,
    paidOn,
    profile?.uid,
    queryClient,
    reference,
    router,
    trip,
    tripDisplay,
  ]);

  if (loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.primary} />;
  }

  if (!tripId || !trip) {
    return (
      <DetailPageLayout title="Collect payment" onBack={onBack} titleAlign="left">
        <Text style={styles.empty}>This trip is not available.</Text>
      </DetailPageLayout>
    );
  }

  return (
    <DetailPageLayout
      title="Collect payment"
      titleAlign="left"
      onBack={onBack}
      titleSubline={<Text style={styles.kicker}>{kicker}</Text>}
    >
      <View style={styles.hero}>
        {needsPartyTag ? (
          <Text style={styles.heroLabel}>
            Tag a shipper or middleman on this trip before collecting.
          </Text>
        ) : (
          <Text style={styles.heroLabel}>Revenue from {partyName}</Text>
        )}
        <SmartInput
          type="currency"
          value={amountNum}
          onChange={(_, numeric) => {
            setAmount(formatLedgerAmountInput(numeric));
          }}
          label="Amount received"
          context={`${partyName} · ${tripDisplay}${dueHint > 0 ? ` · due ${inr(dueHint)}` : ""}`}
          submitLabel="Apply"
          variant="hero"
          density="compact"
          heroAccentColor={Theme.primary}
          placeholder="0"
          required={false}
          disabled={submitting}
          validation={{
            min: 0,
            max: dueHint > 0 ? dueHint : 100000000,
          }}
        />
        <Text style={styles.heroHint} numberOfLines={2}>
          {partyName} · {tripDisplay}
          {dueHint > 0 ? ` · due ${inr(dueHint)}` : ""}
        </Text>
        <LedgerSettlementPctDock
          dueTotalInr={dueHint}
          amountStr={amount}
          onAmountChange={setAmount}
          accentColor={Theme.primary}
          variant="light"
          compact
        />
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIcon, { backgroundColor: "#dcfce7" }]}>
            <Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionTitle}>Payment mode</Text>
            <Text style={styles.sectionHint}>How this money moved</Text>
          </View>
        </View>
        <View style={styles.modeRow}>
          {CAPTURE_MODES.map((item) => (
            <View key={item.id} style={styles.modeCell}>
              <LedgerProtocolStripModeTile
                modeId={item.id}
                label={ledgerPaymentModeVisual(item.id).shortLabel}
                selected={modeId === item.id}
                variant="compact"
                onPress={() => {
                  if (!submitting) setModeId(item.id);
                }}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIcon, { backgroundColor: Theme.avatarIndigo }]}>
            <Hash size={15} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionTitle}>Reference / UTR</Text>
            <Text style={styles.sectionHint}>
              {isCash ? "Optional for cash" : "NEFT / UPI / bank transaction reference"}
            </Text>
          </View>
        </View>
        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="UTR / reference"
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="characters"
          editable={!submitting}
        />
        <Text style={styles.dateLabel}>Paid on</Text>
        <TextInput
          style={styles.input}
          value={paidOn}
          onChangeText={setPaidOn}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Theme.textMuted}
          editable={!submitting}
        />
      </View>

      {lane === "marketplace" ? (
        <Text style={styles.exchangeNote}>
          Pulse Exchange records this as received after the shipper confirms.
        </Text>
      ) : null}

      {needsPartyTag ? (
        <TouchableOpacity
          style={styles.submit}
          onPress={() => setTagOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Tag party"
        >
          <Text style={styles.submitText}>Tag party first</Text>
        </TouchableOpacity>
      ) : null}

      <DriverCollectFromSheet
        visible={tagOpen}
        trip={trip}
        due={dueHint}
        lane="shipper"
        assignerName={partyHint || null}
        onClose={() => setTagOpen(false)}
        onTagged={() => {
          setTagOpen(false);
          void load();
        }}
      />

      <TouchableOpacity
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={() => void submit()}
        disabled={!canSubmit}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Capture payment"
      >
        {submitting ? (
          <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
        ) : (
          <Text style={styles.submitText}>
            Collect {amountNum > 0 ? inr(Math.min(amountNum, cap || amountNum)) : "payment"}
          </Text>
        )}
      </TouchableOpacity>
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  empty: {
    fontSize: 13,
    color: Theme.textMuted,
    paddingTop: 12,
  },
  hero: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  heroHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  card: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
  },
  sectionHint: {
    marginTop: 1,
    fontSize: 10,
    color: Theme.textMuted,
  },
  modeRow: {
    flexDirection: "row",
    gap: 6,
  },
  modeCell: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    minHeight: 44,
  },
  dateLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  exchangeNote: {
    fontSize: 11,
    color: Theme.textMuted,
    marginBottom: 12,
    lineHeight: 15,
  },
  submit: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
});
