import { Avatar } from "@/components/Avatar";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  FullPageWizardFooter,
  FullPageWizardShell,
  fullPageWizardStyles,
  WIZARD_PARTY_GRID_COLUMNS_DESKTOP,
  WizardClientPicker,
  WizardContextSummary,
  WizardNumericKeypadFlow,
  WizardPartyContextRow,
} from "@/components/full-page-wizard";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getClientsByOrganization,
  type ClientRow,
} from "@/features/clients/services/clients.service";
import { manuallySelectableClients } from "@/features/marketplace/utils/marketplaceParty.util";
import * as driversService from "@/features/drivers/services/drivers.service";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { buildAttributedFleetTripNotes } from "@/features/trips/utils/attributedFleetTrip.util";
import { getFleetAvatarUriForOrg } from "@/features/vehicles/utils/fleetAvatar.util";
import { resolvePartyDisplayUri } from "@/lib/partyAvatarDisplay";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AttributionBundle = {
  request: salaryRequestsService.SalaryRequestWithDriverRow;
  sourceTrip: tripsService.TripRow;
  driver: driversService.DriverRow | null;
};

type WizardStep = "client" | "sale" | "review";

function formatTripDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AttributionTripCreateModal() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= Layout.wizardSteppedMaxWidth;
  const { currentOrganization } = useOrganization();
  const { user, profile } = useAuth();

  const orgId = currentOrganization?.id ?? null;
  const userId = profile?.uid ?? user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bundle, setBundle] = useState<AttributionBundle | null>(null);
  const [driverProfile, setDriverProfile] = useState<{
    avatarUrl?: string;
    avatarSeed?: string;
  } | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("client");
  const [clientMode, setClientMode] = useState<"shipper" | "existing">("shipper");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  /** Search filter only — never mirrors the selected client name. */
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [saleValue, setSaleValue] = useState("");

  const loadClients = useCallback(async () => {
    if (!orgId) return;
    setClientsLoading(true);
    const res = await getClientsByOrganization(orgId);
    if (!res.error) {
      setClients(manuallySelectableClients(res.clients ?? []));
    }
    setClientsLoading(false);
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId || !requestId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestRes = await salaryRequestsService.getSalaryRequestByIdForOrganization(
      orgId,
      requestId,
    );
    if (requestRes.error || !requestRes.request) {
      setLoading(false);
      return;
    }
    const request = requestRes.request;
    const sourceTripId = String(request.trip_ids?.[0] ?? "").trim();
    if (!sourceTripId) {
      setLoading(false);
      return;
    }
    const [tripRes, driverRes, profileRes] = await Promise.all([
      tripsService.getTripById(sourceTripId),
      driversService.getDriverById(orgId, request.driver_id),
      driversService.getDriverProfileDisplay(request.driver_id),
    ]);
    if (!tripRes.trip) {
      setLoading(false);
      return;
    }
    setBundle({
      request,
      sourceTrip: tripRes.trip,
      driver: driverRes.driver ?? null,
    });
    setDriverProfile(
      profileRes.profile
        ? {
            avatarUrl: profileRes.profile.avatarUrl,
            avatarSeed: profileRes.profile.avatarSeed,
          }
        : null,
    );
    await loadClients();
    setLoading(false);
  }, [orgId, requestId, loadClients]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void loadClients();
    }, [loadClients]),
  );

  const shipperName = useMemo(() => {
    if (!bundle) return "Shipper";
    return String(bundle.sourceTrip.client_name ?? "").trim() || "Shipper";
  }, [bundle]);

  const shipperAvatarUri = useMemo(() => {
    if (!bundle) return null;
    const shipperOrgId = String(bundle.sourceTrip.organization_id ?? "");
    return getFleetAvatarUriForOrg(shipperOrgId, shipperName);
  }, [bundle, shipperName]);

  const driverAvatarUrl =
    (driverProfile?.avatarUrl ?? "").trim() ||
    (bundle?.driver?.avatar_url ?? "").trim() ||
    null;
  const driverAvatarSeed =
    (driverProfile?.avatarSeed ?? "").trim() ||
    (bundle?.driver?.avatar_seed ?? "").trim() ||
    null;

  const matchedShipperClient = useMemo(() => {
    const shipper = shipperName.trim().toLowerCase();
    if (!shipper) return null;
    return (
      clients.find((c) => String(c.name ?? "").trim().toLowerCase() === shipper) ?? null
    );
  }, [clients, shipperName]);

  useEffect(() => {
    if (clientMode !== "shipper") return;
    setSelectedClientId(matchedShipperClient?.id ?? null);
  }, [clientMode, matchedShipperClient?.id]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const openAddClientFlow = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: {
        returnTo: `/(modals)/attribution-trip-create?requestId=${encodeURIComponent(
          String(requestId ?? ""),
        )}`,
        prefillOrganizationName: shipperName,
      },
    } as never);
  }, [router, requestId, shipperName]);

  const handleSubmit = useCallback(async () => {
    if (!bundle || !orgId || !userId || submitting) return;
    const effectiveClientName = String(selectedClient?.name ?? "").trim();
    const sale = Number(saleValue);
    if (!effectiveClientName) {
      Alert.alert(
        "Client required",
        "Select an existing client. If shipper is new, add it in Add Client with contact details first.",
      );
      return;
    }
    if (!Number.isFinite(sale) || sale <= 0) {
      Alert.alert("Sale value required", "Enter a valid sale value greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const source = bundle.sourceTrip;
      const historicalStartedAt =
        source.started_at ??
        source.pickup_date ??
        source.created_at ??
        null;
      const historicalCompletedAt =
        source.completed_at ??
        (tripsService.isTripCompleted(source) ? source.updated_at : null) ??
        source.pickup_date ??
        source.created_at ??
        null;
      const fleetDriverId =
        bundle.request.driver_id ??
        bundle.driver?.id ??
        source.driver_id ??
        undefined;
      const createRes = await tripsService.createTrip(orgId, userId, {
        pickup_area: source.pickup_area,
        drop_location: source.drop_location,
        pickup_lat: source.pickup_lat ?? undefined,
        pickup_lon: source.pickup_lon ?? undefined,
        drop_lat: source.drop_lat ?? undefined,
        drop_lon: source.drop_lon ?? undefined,
        distance:
          source.distance != null && Number.isFinite(Number(source.distance))
            ? Number(source.distance)
            : undefined,
        estimated_duration: source.estimated_duration ?? undefined,
        pickup_date: source.pickup_date ?? undefined,
        load_tons: source.load_tons ?? undefined,
        load_type: source.load_type ?? undefined,
        client_name: effectiveClientName,
        client_id: selectedClient?.id ?? undefined,
        client_price: sale,
        supplier_rate: Number(source.supplier_rate ?? 0) || 0,
        supplier_id: source.supplier_id ?? undefined,
        driver_id: fleetDriverId,
        vehicle_id: source.vehicle_id ?? undefined,
        vehicle_display_number: source.vehicle_display_number ?? undefined,
        status: "completed",
        started_at: historicalStartedAt,
        completed_at: historicalCompletedAt,
        skipAssignmentConflictCheck: true,
        notes: buildAttributedFleetTripNotes(source.trip_number ?? source.id),
        owner_user_id: userId,
        created_by_user_id: userId,
        // Source TripRow types this as widened `string`; the create input only
        // accepts the "asset" | "market" literals. Runtime values are already
        // one of these, so narrow without changing behavior.
        trip_payout_mode: (source.trip_payout_mode ?? "asset") as
          | "asset"
          | "market",
      });
      if (createRes.error || !createRes.trip) {
        throw createRes.error ?? new Error("Could not create attributed trip.");
      }

      const sourcePrice = Number(source.client_price ?? 0);
      const explicitPercent = Number(bundle.driver?.commission_percent ?? 0);
      const derivedPercent =
        explicitPercent > 0
          ? explicitPercent
          : sourcePrice > 0
            ? (Number(bundle.request.amount ?? 0) / sourcePrice) * 100
            : 0;
      const driverCommission = Math.max(
        0,
        Math.round((sale * Math.max(0, derivedPercent)) / 100),
      );
      if (driverCommission > 0) {
        await tripsService.updateTripDriverCommission(createRes.trip.id, driverCommission);
      }

      const approveRes = await salaryRequestsService.updateSalaryRequestStatus(
        bundle.request.id,
        "approved",
      );
      if (approveRes.error) {
        throw approveRes.error;
      }

      Alert.alert("Trip created", "Attribution accepted and converted into a fleet trip.");
      router.replace("/(tabs)/trips");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not complete attribution.";
      Alert.alert("Could not complete", message);
    } finally {
      setSubmitting(false);
    }
  }, [
    bundle,
    orgId,
    userId,
    submitting,
    selectedClient?.id,
    selectedClient?.name,
    saleValue,
    router,
  ]);

  const canContinueFromClientStep =
    clientMode === "shipper" ? !!matchedShipperClient : !!selectedClientId;
  const canContinueFromSaleStep = Number(saleValue) > 0;

  const filteredClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => String(c.name ?? "").toLowerCase().includes(q))
      : clients;
    return list.slice(0, 40);
  }, [clients, clientSearchQuery]);

  const goBackInWizard = useCallback(() => {
    if (wizardStep === "review") {
      setWizardStep("sale");
      return;
    }
    if (wizardStep === "sale") {
      setWizardStep("client");
      return;
    }
    router.back();
  }, [wizardStep, router]);

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 24 }]}>
        <LoadingIndicator color={Theme.primary} />
        <Text style={styles.loadingText}>Loading attribution request...</Text>
      </View>
    );
  }

  if (!bundle || !orgId || !requestId) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.emptyTitle}>Attribution request not found</Text>
        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const source = bundle.sourceTrip;
  const driverName =
    String(bundle.driver?.name ?? "").trim() ||
    String(bundle.request.drivers?.name ?? "").trim() ||
    "Driver";
  const vehicleLabel =
    String(source.vehicle_display_number ?? "").trim() || "Assigned vehicle";
  const selectedClientNameForDisplay =
    selectedClient?.name ??
    (clientMode === "shipper" ? shipperName : "Select client");
  const clientAvatarUri = resolvePartyDisplayUri({
    avatarUrl: selectedClient?.avatar_url ?? null,
    avatarSeed: selectedClient?.avatar_seed ?? null,
    entityType: "client",
  });

  const driverPartyCell = {
    label: "Driver",
    name: driverName,
    entityType: "driver" as const,
    avatar: (
      <Avatar
        party={{
          type: "driver",
          name: driverName,
          avatarUrl: driverAvatarUrl,
          avatarSeed: driverAvatarSeed,
        }}
        size={34}
      />
    ),
  };

  const shipperPartyCell = {
    label: "Shipper",
    name: shipperName,
    entityType: "client" as const,
    avatarUrl: shipperAvatarUri,
  };

  const clientPartyCell = {
    label: "Client",
    name: selectedClientNameForDisplay,
    entityType: "client" as const,
    avatarUrl: clientAvatarUri,
    avatarSeed: selectedClient?.avatar_seed ?? null,
  };

  const stepProgress = (
    <View style={styles.wizardStepRow}>
      {[
        { id: "client" as const, label: "Client" },
        { id: "sale" as const, label: "Sale" },
        { id: "review" as const, label: "Review" },
      ].map((step, idx) => {
        const done =
          (wizardStep === "sale" && step.id === "client") ||
          (wizardStep === "review" && (step.id === "client" || step.id === "sale"));
        const active = wizardStep === step.id;
        return (
          <View key={step.id} style={styles.wizardStepItem}>
            <View
              style={[
                styles.wizardStepCircle,
                active && styles.wizardStepCircleActive,
                done && styles.wizardStepCircleDone,
              ]}
            >
              <Text
                style={[
                  styles.wizardStepCircleText,
                  (active || done) && styles.wizardStepCircleTextActive,
                ]}
              >
                {idx + 1}
              </Text>
            </View>
            <Text style={[styles.wizardStepText, active && styles.wizardStepTextActive]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const contextPanel = (
    <WizardContextSummary
      eyebrow="This request"
      title={`${source.pickup_area} → ${source.drop_location}`}
      lines={[
        `Driver · ${driverName}`,
        `Vehicle · ${vehicleLabel}`,
        `Date · ${formatTripDate(source.pickup_date ?? source.created_at)}`,
        wizardStep === "client"
          ? `Shipper · ${shipperName}`
          : `Sale · ₹${Math.max(0, Number(saleValue) || 0).toLocaleString("en-IN")}`,
      ]}
    />
  );

  const routeDetailsBlock = (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Route details</Text>
      <Text style={styles.blockLine}>
        {source.pickup_area} → {source.drop_location}
      </Text>
      <Text style={styles.blockMeta}>
        Date: {formatTripDate(source.pickup_date ?? source.created_at)} · Vehicle:{" "}
        {vehicleLabel}
      </Text>
    </View>
  );

  const selectClientBlock = (
    <View style={[styles.block, isWideLayout && styles.selectClientBlockWide]}>
      <Text style={styles.blockTitle}>Select client</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, clientMode === "shipper" && styles.modeChipActive]}
          onPress={() => setClientMode("shipper")}
        >
          <Text
            style={[
              styles.modeChipText,
              clientMode === "shipper" && styles.modeChipTextActive,
            ]}
          >
            Mark as shipper
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, clientMode === "existing" && styles.modeChipActive]}
          onPress={() => {
            setClientMode("existing");
            setClientSearchQuery("");
          }}
        >
          <Text
            style={[
              styles.modeChipText,
              clientMode === "existing" && styles.modeChipTextActive,
            ]}
          >
            Select existing client
          </Text>
        </Pressable>
      </View>

      {clientMode === "shipper" ? (
        <>
          <View style={styles.shipperMarkCard}>
            <PartyAvatar
              name={shipperName}
              avatarUrl={shipperAvatarUri}
              entityType="client"
              size={30}
              shape="rounded"
            />
            <View style={styles.partyTextWrap}>
              <Text style={styles.partyLabel}>Shipper</Text>
              <Text style={styles.partyName} numberOfLines={1}>
                {shipperName}
              </Text>
              {matchedShipperClient == null ? (
                <View style={styles.shipperNewBadge}>
                  <Text style={styles.shipperNewBadgeText}>CLIENT FROM SHIPPER (NEW)</Text>
                </View>
              ) : (
                <View style={styles.shipperMappedBadge}>
                  <Text style={styles.shipperMappedBadgeText}>MAPPED TO EXISTING CLIENT</Text>
                </View>
              )}
            </View>
          </View>
          {matchedShipperClient == null ? (
            <View style={styles.shipperWarningCard}>
              <Text style={styles.shipperWarningText}>
                This shipper is not in your clients. Add it with contact details to continue.
              </Text>
              <Pressable style={styles.addClientBtn} onPress={openAddClientFlow}>
                <Text style={styles.addClientBtnText}>+ Add shipper as client</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>
              Existing client matched automatically. Continue to sale value.
            </Text>
          )}
        </>
      ) : (
        <>
          <TextInput
            value={clientSearchQuery}
            onChangeText={setClientSearchQuery}
            placeholder="Search client"
            placeholderTextColor={Theme.textMuted}
            style={fullPageWizardStyles.wizardFieldInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <WizardClientPicker
            clients={filteredClients}
            loading={clientsLoading}
            selectedClientId={selectedClientId}
            onSelect={(client) => {
              setSelectedClientId(client.id);
            }}
            onAddClient={openAddClientFlow}
            listMaxHeight={isWideLayout ? 340 : 260}
            columns={isWideLayout ? WIZARD_PARTY_GRID_COLUMNS_DESKTOP : 2}
          />
        </>
      )}
    </View>
  );

  const stepTitle =
    wizardStep === "client"
      ? "Accept Attribution"
      : wizardStep === "sale"
        ? "Sale Value"
        : "Review & Create";

  const stepSubtitle =
    wizardStep === "client"
      ? "Select how this shipper maps to your client record."
      : wizardStep === "sale"
        ? "Enter the billed sale value for this attributed trip."
        : "Confirm details before creating attributed fleet trip.";

  const stepIndex = wizardStep === "client" ? 1 : wizardStep === "sale" ? 2 : 3;

  const stepContent =
    wizardStep === "client" ? (
      <>
        <WizardPartyContextRow left={driverPartyCell} right={shipperPartyCell} />
        {isWideLayout ? (
          <View style={styles.desktopStepStack}>
            {routeDetailsBlock}
            {selectClientBlock}
          </View>
        ) : (
          <>
            {routeDetailsBlock}
            {selectClientBlock}
          </>
        )}
      </>
    ) : wizardStep === "sale" ? (
      <>
        <WizardPartyContextRow left={driverPartyCell} right={clientPartyCell} />
        <View style={styles.saleKeypadWrap}>
          <WizardNumericKeypadFlow
            fields={[
              {
                id: "sale",
                label: "Sale value (INR)",
                rawValue: saleValue,
                onRawValueChange: setSaleValue,
              },
            ]}
          />
        </View>
      </>
    ) : (
      <>
        <WizardPartyContextRow left={driverPartyCell} right={clientPartyCell} />
        <View style={styles.reviewSummaryCard}>
          <Text style={styles.blockTitle}>Trip summary</Text>
          <Text style={styles.reviewLine}>
            Sale value: ₹{Math.max(0, Number(saleValue) || 0).toLocaleString("en-IN")}
          </Text>
          <Text style={styles.reviewLine}>
            Route: {source.pickup_area} → {source.drop_location}
          </Text>
          <Text style={styles.reviewLine}>Vehicle: {vehicleLabel}</Text>
          <Text style={styles.reviewLine}>
            Date: {formatTripDate(source.pickup_date ?? source.created_at)}
          </Text>
        </View>
      </>
    );

  const footer =
    wizardStep === "client" ? (
      <FullPageWizardFooter
        secondaryLabel="Close"
        onSecondaryPress={goBackInWizard}
        primaryLabel="Continue"
        onPrimaryPress={() => setWizardStep("sale")}
        primaryDisabled={!canContinueFromClientStep}
      />
    ) : wizardStep === "sale" ? (
      <FullPageWizardFooter
        secondaryLabel="Back"
        onSecondaryPress={goBackInWizard}
        primaryLabel="Review"
        onPrimaryPress={() => setWizardStep("review")}
        primaryDisabled={!canContinueFromSaleStep}
      />
    ) : (
      <FullPageWizardFooter
        secondaryLabel="Back"
        onSecondaryPress={goBackInWizard}
        primaryLabel={submitting ? "Creating…" : "Create trip & accept"}
        onPrimaryPress={handleSubmit}
        primaryDisabled={submitting}
        loading={submitting}
      />
    );

  return (
    <FullPageWizardShell
      keyboardAvoidOnAndroid
      title={stepTitle}
      subtitle={stepSubtitle}
      stepIndex={stepIndex}
      stepTotal={3}
      onBack={goBackInWizard}
      progress={stepProgress}
      fillBody={wizardStep === "sale"}
      scrollBody={wizardStep !== "sale"}
      insightPreset="attribution"
      contextPanel={contextPanel}
      footer={footer}
    >
      {stepContent}
    </FullPageWizardShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: Theme.textSecondary,
    fontSize: 13,
  },
  emptyTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 16,
    fontWeight: "700",
  },
  wizardStepRow: {
    ...fullPageWizardStyles.wizardStepRow,
  },
  wizardStepItem: {
    ...fullPageWizardStyles.wizardStepItem,
  },
  wizardStepCircle: {
    ...fullPageWizardStyles.wizardStepCircle,
  },
  wizardStepCircleActive: {
    ...fullPageWizardStyles.wizardStepCircleActive,
  },
  wizardStepCircleDone: {
    ...fullPageWizardStyles.wizardStepCircleDone,
  },
  wizardStepCircleText: {
    ...fullPageWizardStyles.wizardStepCircleText,
  },
  wizardStepCircleTextActive: {
    ...fullPageWizardStyles.wizardStepCircleTextActive,
  },
  wizardStepText: {
    ...fullPageWizardStyles.wizardStepText,
  },
  wizardStepTextActive: {
    ...fullPageWizardStyles.wizardStepTextActive,
  },
  desktopStepStack: {
    width: "100%",
    gap: 12,
  },
  selectClientBlockWide: {
    minHeight: 360,
  },
  partyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  partyLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "500",
  },
  partyName: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  block: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  blockTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "600",
  },
  blockLine: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "500",
  },
  blockMeta: {
    color: Theme.textSecondary,
    fontSize: 12,
  },
  modeRow: {
    ...fullPageWizardStyles.modeRow,
  },
  modeChip: {
    ...fullPageWizardStyles.modeChip,
  },
  modeChipActive: {
    ...fullPageWizardStyles.modeChipActive,
  },
  modeChipText: {
    ...fullPageWizardStyles.modeChipText,
  },
  modeChipTextActive: {
    ...fullPageWizardStyles.modeChipTextActive,
  },
  shipperMarkCard: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 10,
  },
  shipperNewBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shipperNewBadgeText: {
    color: "#4D3636",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  shipperMappedBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.30)",
    backgroundColor: "rgba(79, 70, 229, 0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shipperMappedBadgeText: {
    color: Theme.primary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  shipperWarningCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(238,242,255,0.9)",
    padding: 10,
    gap: 8,
  },
  shipperWarningText: {
    color: "#4D3636",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  saleKeypadWrap: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  reviewSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.22)",
    backgroundColor: "rgba(15,23,42,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  reviewLine: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  hint: {
    color: Theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  // TODO(types): these keys were referenced but never defined — the button
  // rendered unstyled at runtime. Kept empty to preserve current behavior;
  // supply real styling if/when the design intent is confirmed.
  addClientBtn: {},
  addClientBtnText: {},
});
