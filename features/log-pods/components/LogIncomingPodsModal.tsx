import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { LogPodsTripView } from "@/features/log-pods/services/logPods.service";
import type {
  LogIncomingPodsListTab,
  LogPodsPartyKind,
  LogPodsPartyOption,
} from "@/features/log-pods/utils/logPodsListFilter.util";
import {
  driverOperatedLogPodTrips,
  filterLogPodTripsForTab,
  supplierOperatedLogPodTrips,
} from "@/features/log-pods/utils/logPodsListFilter.util";
import {
  useCourierPartnersQuery,
  useLogIncomingPodsDriversQuery,
  useLogIncomingPodsSuppliersQuery,
  useLogIncomingPodsTripsQuery,
  useMarkHardCopyPodsReceivedMutation,
} from "@/lib/queries/useLogIncomingPodsQueries";
import { getCategoryLabel } from "@/constants/courierCategories";
import {
  filterCourierPartners,
  hasExactCourierLabel,
  mergeCourierPartnerLists,
  resolveCourierDisplayName,
  TYPED_COURIER_VALUE,
} from "@/features/log-pods/utils/indiaCourierPartners";
import {
  formatPodReceivedDateLabel,
  podReceivedAtIso,
  type PodReceivedDatePreset,
} from "@/features/log-pods/utils/podReceivedDate.util";
import {
  displayOperationalField,
  fillMissingInvoiceTripLrNumbers,
  type InvoiceTripOperationalSeed,
} from "@/features/invoicing/utils/invoiceTripOperational.util";
import { TripCompletionStatusTag } from "@/features/trips/components/TripPodStatusTags";
import {
  countTripsByCompletion,
  tripIsDeliveredStatus,
} from "@/features/trips/services/tripDocumentLrPod.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function partyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

const TRIP_LIST_TABS: { id: LogIncomingPodsListTab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "not_completed", label: "Not completed" },
  { id: "all", label: "All" },
];

export function LogIncomingPodsModal({
  visible,
  onClose,
  preselectedTripIds,
  seedTrips,
}: {
  visible: boolean;
  onClose: () => void;
  preselectedTripIds?: string[];
  expectedClientId?: string | null;
  seedTrips?: InvoiceTripOperationalSeed[];
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSplit = width >= 768;
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const lockedTripKey = (preselectedTripIds ?? []).filter(Boolean).join(",");
  const lockedTripIds = useMemo(
    () => lockedTripKey.split(",").filter(Boolean),
    [lockedTripKey],
  );
  const lockToPreselected = lockedTripIds.length > 0;
  const suppliersQuery = useLogIncomingPodsSuppliersQuery(
    visible && !lockToPreselected ? orgId : null,
  );
  const driversQuery = useLogIncomingPodsDriversQuery(
    visible && !lockToPreselected ? orgId : null,
  );
  const tripsQuery = useLogIncomingPodsTripsQuery(
    visible && !lockToPreselected ? orgId : null,
    {
    includeReceived: true,
    },
  );
  const markReceived = useMarkHardCopyPodsReceivedMutation(orgId);

  const [partyKind, setPartyKind] = useState<LogPodsPartyKind>("supplier");
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState<LogPodsPartyOption | null>(
    null,
  );
  const [tab, setTab] = useState<LogIncomingPodsListTab>("pending");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [receiveStep, setReceiveStep] = useState<"trips" | "details" | "preview">(
    "trips",
  );
  const [receiveMethod, setReceiveMethod] = useState<"courier" | "in_hand">(
    "courier",
  );
  const [datePreset, setDatePreset] = useState<PodReceivedDatePreset>("today");
  const [courierValue, setCourierValue] = useState("");
  const [courierSearch, setCourierSearch] = useState("");
  const [typedCourierName, setTypedCourierName] = useState("");
  const [awb, setAwb] = useState("");
  const [remarks, setRemarks] = useState("");
  const [enrichedSeeds, setEnrichedSeeds] = useState<
    InvoiceTripOperationalSeed[]
  >([]);

  const couriersQuery = useCourierPartnersQuery();

  useEffect(() => {
    if (!visible) {
      setPartyKind("supplier");
      setPartySearch("");
      setSelectedParty(null);
      setTab("pending");
      setSelectedIds([]);
      setReceiveStep("trips");
      setReceiveMethod("courier");
      setDatePreset("today");
      setCourierValue("");
      setCourierSearch("");
      setTypedCourierName("");
      setAwb("");
      setRemarks("");
      setEnrichedSeeds([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !lockToPreselected) return;
    setSelectedIds(lockedTripIds);
    setReceiveStep("details");
  }, [lockToPreselected, lockedTripIds, visible]);

  useEffect(() => {
    if (!visible || !lockToPreselected) return;
    let cancelled = false;
    void fillMissingInvoiceTripLrNumbers(seedTrips ?? []).then((next) => {
      if (!cancelled) setEnrichedSeeds(next);
    });
    return () => {
      cancelled = true;
    };
  }, [lockToPreselected, seedTrips, visible]);

  const driverOptions = useMemo(() => {
    const byId = new Map<string, LogPodsPartyOption>();
    for (const driver of driversQuery.data ?? []) {
      if (driver.id) byId.set(driver.id, driver);
    }
    for (const trip of tripsQuery.data ?? []) {
      if (!trip.driver_id || trip.driver_name === "Unknown Driver") continue;
      if (!byId.has(trip.driver_id)) {
        byId.set(trip.driver_id, {
          id: trip.driver_id,
          name: trip.driver_name,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [driversQuery.data, tripsQuery.data]);

  const partyOptions = useMemo(() => {
    const source =
      partyKind === "driver" ? driverOptions : (suppliersQuery.data ?? []);
    const q = partySearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((item) => item.name.toLowerCase().includes(q));
  }, [driverOptions, partyKind, partySearch, suppliersQuery.data]);

  const partyTrips = useMemo(() => {
    const trips = tripsQuery.data ?? [];
    return partyKind === "driver"
      ? driverOperatedLogPodTrips(trips, selectedParty)
      : supplierOperatedLogPodTrips(trips, selectedParty);
  }, [partyKind, selectedParty, tripsQuery.data]);
  const pendingTrips = useMemo(
    () => filterLogPodTripsForTab(partyTrips, "pending"),
    [partyTrips],
  );
  const completionCounts = useMemo(
    () => countTripsByCompletion(partyTrips, (trip) => trip.status),
    [partyTrips],
  );
  const visibleTrips = useMemo(
    () => filterLogPodTripsForTab(partyTrips, tab),
    [partyTrips, tab],
  );

  const countForTab = (id: LogIncomingPodsListTab) => {
    if (id === "pending") return pendingTrips.length;
    if (id === "completed") return completionCounts.completed;
    if (id === "not_completed") return completionCounts.notCompleted;
    return partyTrips.length;
  };

  const selectedTripViews = useMemo(() => {
    if (lockToPreselected) {
      const source = enrichedSeeds.length > 0 ? enrichedSeeds : seedTrips ?? [];
      return source.map(
        (seed): LogPodsTripView => ({
          id: seed.id,
          internal_id: seed.internal_id,
          client: seed.client,
          supplier_id: "",
          supplier_name: seed.supplier_name,
          driver_id: "",
          driver_name: seed.driver_name ?? "",
          lane: "market",
          from: seed.from ?? "—",
          to: seed.to ?? "—",
          amount: null,
          status: "completed",
          lrNumbers: seed.lr_number ? [seed.lr_number] : [],
          receivedLRs: [],
          date: "",
          hardCopyReceived: false,
        }),
      );
    }
    return (tripsQuery.data ?? []).filter((trip) =>
      selectedIds.includes(trip.internal_id),
    );
  }, [
    enrichedSeeds,
    lockToPreselected,
    seedTrips,
    selectedIds,
    tripsQuery.data,
  ]);
  const courierDirectory = useMemo(
    () =>
      mergeCourierPartnerLists(
        (couriersQuery.data ?? []).map((row) => ({
          label: row.label,
          value: row.value,
          category: row.category || "other",
        })),
      ),
    [couriersQuery.data],
  );
  const courierOptions = useMemo(
    () => filterCourierPartners(courierDirectory, courierSearch),
    [courierDirectory, courierSearch],
  );
  const typedCourierQuery = courierSearch.trim();
  const canUseTypedCourier =
    typedCourierQuery.length > 0 &&
    !hasExactCourierLabel(courierDirectory, typedCourierQuery);
  const selectedCourierName = resolveCourierDisplayName(
    courierDirectory,
    courierValue,
    typedCourierName,
  );

  const toggleTrip = (trip: LogPodsTripView) => {
    if (trip.hardCopyReceived) return;
    setSelectedIds((prev) =>
      prev.includes(trip.internal_id)
        ? prev.filter((id) => id !== trip.internal_id)
        : [...prev, trip.internal_id],
    );
  };

  const toggleSelectAllPending = () => {
    const pendingIds = pendingTrips.map((t) => t.internal_id);
    const allSelected =
      pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : pendingIds);
  };

  const detailsReady =
    receiveMethod === "in_hand" ||
    (Boolean(selectedCourierName) && awb.trim().length > 0);

  const openReceiveDetails = () => {
    if (selectedIds.length === 0) {
      Alert.alert("Select trips", "Select at least one pending trip.");
      return;
    }
    setReceiveStep("details");
  };

  const openReceivePreview = () => {
    if (receiveMethod === "courier" && !selectedCourierName) {
      Alert.alert(
        "Courier required",
        "Select a courier or type a name and use it.",
      );
      return;
    }
    if (receiveMethod === "courier" && !awb.trim()) {
      Alert.alert("AWB required", "Enter the AWB / tracking number.");
      return;
    }
    setReceiveStep("preview");
  };

  const handleConfirmReceived = () => {
    markReceived.mutate(
      {
        tripInternalIds: selectedIds,
        receivedAt: podReceivedAtIso(datePreset),
        method: receiveMethod,
        courierName: selectedCourierName,
        trackingId: awb.trim(),
        comment: remarks.trim() || null,
      },
      {
        onSuccess: (result) => {
          Alert.alert(
            "Hard-copy POD received",
            `${result.updatedCount} trip${result.updatedCount === 1 ? "" : "s"} updated.`,
          );
          setSelectedIds([]);
          setReceiveStep("trips");
          onClose();
        },
        onError: (err) => {
          Alert.alert(
            "Could not update POD",
            err instanceof Error ? err.message : "Update failed.",
          );
        },
      },
    );
  };

  const handleFooterBack = () => {
    if (receiveStep === "preview") setReceiveStep("details");
    else if (receiveStep === "details" && !lockToPreselected) {
      setReceiveStep("trips");
    } else onClose();
  };

  const loading = lockToPreselected
    ? false
    : suppliersQuery.isLoading || driversQuery.isLoading || tripsQuery.isLoading;
  const errorMessage = lockToPreselected
    ? null
    : suppliersQuery.error instanceof Error
      ? suppliersQuery.error.message
      : driversQuery.error instanceof Error
        ? driversQuery.error.message
        : tripsQuery.error instanceof Error
          ? tripsQuery.error.message
          : null;
  const partyNoun = partyKind === "driver" ? "driver" : "supplier";
  const pendingSelected =
    pendingTrips.length > 0 &&
    pendingTrips.every((trip) => selectedIds.includes(trip.internal_id));
  const canSubmit = selectedIds.length > 0 && !markReceived.isPending;

  const switchPartyKind = (kind: LogPodsPartyKind) => {
    setPartyKind(kind);
    setSelectedParty(null);
    setSelectedIds([]);
    setPartySearch("");
    setTab("pending");
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={[styles.sheet, isSplit && styles.sheetSplit]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <FontAwesome name="inbox" size={15} color={Theme.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Log incoming PODs</Text>
              <Text style={styles.sub}>
                {receiveStep === "details"
                  ? "How did the hard-copy POD arrive?"
                  : receiveStep === "preview"
                    ? "Review and confirm before updating trips"
                    : `Pick a ${partyNoun}, then mark hard-copy PODs as received`}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={Layout.touchTargetHitSlop}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={14} color={Theme.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centeredState}>
              <LoadingIndicator color={Theme.primary} />
              <Text style={styles.emptySub}>Loading directory and trips…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centeredState}>
              <View style={styles.emptyGlyph}>
                <FontAwesome name="exclamation" size={16} color={Theme.primary} />
              </View>
              <Text style={styles.emptyTitle}>Could not load</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
            </View>
          ) : receiveStep !== "trips" ? (
            <View style={styles.wizardBody}>
              {receiveStep === "details" ? (
                <View style={styles.stepBody}>
                  {lockToPreselected
                    ? selectedTripViews.map((trip) => (
                        <View key={trip.internal_id} style={styles.previewCard}>
                          <Text style={styles.previewRow}>
                            Trip · {displayOperationalField(trip.id)}
                          </Text>
                          <Text style={styles.previewRow}>
                            Client · {displayOperationalField(trip.client)}
                          </Text>
                          <Text style={styles.previewRow}>
                            Supplier ·{" "}
                            {displayOperationalField(trip.supplier_name)}
                          </Text>
                          <Text style={styles.previewRow}>
                            Driver · {displayOperationalField(trip.driver_name)}
                          </Text>
                          <Text style={styles.previewRow}>
                            LR No ·{" "}
                            {displayOperationalField(trip.lrNumbers[0])}
                          </Text>
                          <Text style={styles.previewRow}>
                            Pickup · {displayOperationalField(trip.from)}
                          </Text>
                          <Text style={styles.previewRow}>
                            Drop · {displayOperationalField(trip.to)}
                          </Text>
                        </View>
                      ))
                    : null}
                  <View style={styles.wizardSegmentWrap}>
                    <Pressable
                      style={[
                        styles.segment,
                        receiveMethod === "courier" && styles.segmentActive,
                      ]}
                      onPress={() => setReceiveMethod("courier")}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          receiveMethod === "courier" && styles.segmentTextActive,
                        ]}
                      >
                        Courier
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.segment,
                        receiveMethod === "in_hand" && styles.segmentActive,
                      ]}
                      onPress={() => setReceiveMethod("in_hand")}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          receiveMethod === "in_hand" && styles.segmentTextActive,
                        ]}
                      >
                        In hand
                      </Text>
                    </Pressable>
                  </View>

                  {receiveMethod === "courier" ? (
                    <View style={styles.wizardPane}>
                      <Text style={styles.fieldLabel}>Courier</Text>
                      <View style={styles.searchWrap}>
                        <FontAwesome
                          name="search"
                          size={12}
                          color={Theme.textMuted}
                        />
                        <TextInput
                          style={styles.searchInput}
                          placeholder="Search or type a courier"
                          placeholderTextColor={Theme.textMuted}
                          value={courierSearch}
                          onChangeText={setCourierSearch}
                          autoCorrect={false}
                          autoCapitalize="words"
                        />
                      </View>
                      {selectedCourierName ? (
                        <Text style={styles.courierSelectedHint} numberOfLines={1}>
                          Selected · {selectedCourierName}
                        </Text>
                      ) : null}
                      <FlatList
                        style={styles.courierList}
                        data={courierOptions}
                        keyExtractor={(item) => item.value}
                        keyboardShouldPersistTaps="handled"
                        ListHeaderComponent={
                          <View>
                            {canUseTypedCourier ? (
                              <Pressable
                                style={[
                                  styles.partyCard,
                                  styles.typedCourierCard,
                                  courierValue === TYPED_COURIER_VALUE &&
                                    styles.partyCardActive,
                                ]}
                                onPress={() => {
                                  setCourierValue(TYPED_COURIER_VALUE);
                                  setTypedCourierName(typedCourierQuery);
                                }}
                              >
                                <FontAwesome
                                  name="plus-circle"
                                  size={16}
                                  color={Theme.primary}
                                />
                                <Text
                                  style={[
                                    styles.partyName,
                                    styles.partyNameActive,
                                  ]}
                                  numberOfLines={2}
                                >
                                  Use “{typedCourierQuery}”
                                </Text>
                              </Pressable>
                            ) : null}
                            <Text style={styles.paneEyebrow}>
                              Recommended · India
                            </Text>
                          </View>
                        }
                        renderItem={({ item }) => {
                          const active = courierValue === item.value;
                          return (
                            <Pressable
                              style={[
                                styles.partyCard,
                                active && styles.partyCardActive,
                              ]}
                              onPress={() => {
                                setCourierValue(item.value);
                                setTypedCourierName("");
                              }}
                            >
                              <View style={styles.courierCopy}>
                                <Text
                                  style={[
                                    styles.partyName,
                                    active && styles.partyNameActive,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {item.label}
                                </Text>
                                {item.category ? (
                                  <Text
                                    style={styles.courierCategory}
                                    numberOfLines={1}
                                  >
                                    {getCategoryLabel(item.category)}
                                  </Text>
                                ) : null}
                              </View>
                              {active ? (
                                <FontAwesome
                                  name="check-circle"
                                  size={16}
                                  color={Theme.primary}
                                />
                              ) : null}
                            </Pressable>
                          );
                        }}
                        ListEmptyComponent={
                          couriersQuery.isLoading ? (
                            <Text style={styles.emptySub}>Loading couriers…</Text>
                          ) : canUseTypedCourier ? null : (
                            <Text style={styles.emptySub}>
                              No matching couriers. Type a name to use it.
                            </Text>
                          )
                        }
                      />
                      <Text style={styles.fieldLabel}>AWB / tracking</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="Enter AWB number"
                        placeholderTextColor={Theme.textMuted}
                        value={awb}
                        onChangeText={setAwb}
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                    </View>
                  ) : (
                    <View style={styles.inHandHint}>
                      <Text style={styles.emptySub}>
                        In-hand receipt — set the date the POD was collected.
                      </Text>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>Received date</Text>
                  <View style={styles.dateTabs}>
                    <Pressable
                      style={[
                        styles.dateTab,
                        datePreset === "today" && styles.dateTabActive,
                      ]}
                      onPress={() => setDatePreset("today")}
                    >
                      <Text
                        style={[
                          styles.dateTabText,
                          datePreset === "today" && styles.dateTabTextActive,
                        ]}
                      >
                        Today · {formatPodReceivedDateLabel("today")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.dateTab,
                        datePreset === "yesterday" && styles.dateTabActive,
                      ]}
                      onPress={() => setDatePreset("yesterday")}
                    >
                      <Text
                        style={[
                          styles.dateTabText,
                          datePreset === "yesterday" && styles.dateTabTextActive,
                        ]}
                      >
                        Yesterday · {formatPodReceivedDateLabel("yesterday")}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.fieldLabel}>Reference / remarks</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Optional"
                    placeholderTextColor={Theme.textMuted}
                    value={remarks}
                    onChangeText={setRemarks}
                  />
                </View>
              ) : (
                <ScrollView
                  style={styles.wizardPane}
                  contentContainerStyle={styles.previewScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.previewTitle}>Confirm POD receipt</Text>
                  <View style={styles.previewCard}>
                    <Text style={styles.previewRow}>
                      Method · {receiveMethod === "courier" ? "Courier" : "In hand"}
                    </Text>
                    {receiveMethod === "courier" ? (
                      <>
                        <Text style={styles.previewRow}>
                          Courier · {selectedCourierName}
                        </Text>
                        <Text style={styles.previewRow}>AWB · {awb.trim()}</Text>
                      </>
                    ) : null}
                    <Text style={styles.previewRow}>
                      Date · {datePreset === "today" ? "Today" : "Yesterday"} ·{" "}
                      {formatPodReceivedDateLabel(datePreset)}
                    </Text>
                    <Text style={styles.previewRow}>
                      Trips · {selectedTripViews.length}
                    </Text>
                  </View>
                  {selectedTripViews.map((trip) => (
                    <Text key={trip.internal_id} style={styles.previewTrip}>
                      {trip.id} · {trip.from} → {trip.to}
                    </Text>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={styles.stepBody}>
              <View style={styles.segmentWrap}>
                <Pressable
                  style={[
                    styles.segment,
                    partyKind === "supplier" && styles.segmentActive,
                  ]}
                  onPress={() => switchPartyKind("supplier")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partyKind === "supplier" }}
                >
                  <FontAwesome
                    name="building"
                    size={11}
                    color={
                      partyKind === "supplier" ? Theme.primary : Theme.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      partyKind === "supplier" && styles.segmentTextActive,
                    ]}
                  >
                    Supplier
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segment,
                    partyKind === "driver" && styles.segmentActive,
                  ]}
                  onPress={() => switchPartyKind("driver")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partyKind === "driver" }}
                >
                  <FontAwesome
                    name="user"
                    size={11}
                    color={
                      partyKind === "driver" ? Theme.primary : Theme.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      partyKind === "driver" && styles.segmentTextActive,
                    ]}
                  >
                    Driver
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.body, isSplit && styles.bodySplit]}>
                <View
                  style={[
                    styles.partyPane,
                    isSplit && styles.partyPaneSplit,
                    !isSplit && selectedParty && styles.partyPaneStackedSelected,
                  ]}
                >
                  <View style={styles.searchWrap}>
                    <FontAwesome
                      name="search"
                      size={12}
                      color={Theme.textMuted}
                    />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={
                        partyKind === "driver"
                          ? "Search drivers"
                          : "Search suppliers"
                      }
                      placeholderTextColor={Theme.textMuted}
                      value={partySearch}
                      onChangeText={setPartySearch}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                  </View>
                  <Text style={styles.paneEyebrow}>
                    {partyOptions.length}{" "}
                    {partyKind === "driver" ? "drivers" : "suppliers"}
                  </Text>
                  <FlatList
                    style={styles.partyList}
                    data={partyOptions}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    contentContainerStyle={styles.partyListContent}
                    renderItem={({ item }) => {
                      const active = selectedParty?.id === item.id;
                      return (
                        <Pressable
                          style={[
                            styles.partyCard,
                            active && styles.partyCardActive,
                          ]}
                          onPress={() => {
                            setSelectedParty(item);
                            setSelectedIds([]);
                            setTab("pending");
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <View
                            style={[
                              styles.avatar,
                              active && styles.avatarActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.avatarText,
                                active && styles.avatarTextActive,
                              ]}
                            >
                              {partyInitials(item.name)}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.partyName,
                              active && styles.partyNameActive,
                            ]}
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          {active ? (
                            <FontAwesome
                              name="check-circle"
                              size={16}
                              color={Theme.primary}
                            />
                          ) : (
                            <FontAwesome
                              name="angle-right"
                              size={14}
                              color={Theme.borderMedium}
                            />
                          )}
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={styles.paneEmpty}>
                        <Text style={styles.emptySub}>
                          {partyKind === "driver"
                            ? "No drivers in this workspace."
                            : "No suppliers in this workspace."}
                        </Text>
                      </View>
                    }
                  />
                </View>

                {(isSplit || selectedParty) ? (
                <View style={[styles.tripsPane, isSplit && styles.tripsPaneSplit]}>
                  {selectedParty ? (
                    <View style={styles.tripsFill}>
                      <View style={styles.tripsToolbar}>
                        <View style={styles.selectedChip}>
                          <Text style={styles.selectedChipText} numberOfLines={1}>
                            {selectedParty.name}
                          </Text>
                          <View style={styles.countPill}>
                            <Text style={styles.countPillText}>
                              {pendingTrips.length} pending
                            </Text>
                          </View>
                        </View>
                        <View style={styles.tripTabs} accessibilityRole="tablist">
                          {TRIP_LIST_TABS.map((item) => {
                            const active = tab === item.id;
                            const count = countForTab(item.id);
                            return (
                              <Pressable
                                key={item.id}
                                style={[
                                  styles.tripTab,
                                  active && styles.tripTabActive,
                                ]}
                                onPress={() => setTab(item.id)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${item.label}, ${count}`}
                              >
                                <Text
                                  style={[
                                    styles.tripTabText,
                                    active && styles.tripTabTextActive,
                                  ]}
                                >
                                  {item.label} · {count}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Pressable
                          style={styles.selectAllBtn}
                          onPress={toggleSelectAllPending}
                          disabled={pendingTrips.length === 0}
                          accessibilityRole="button"
                          accessibilityLabel="Select all pending"
                        >
                          <Text
                            style={[
                              styles.selectAllText,
                              pendingTrips.length === 0 && styles.selectAllDisabled,
                            ]}
                          >
                            {pendingSelected ? "Clear" : "Select pending"}
                          </Text>
                        </Pressable>
                      </View>

                      <FlatList
                        style={styles.tripList}
                        data={visibleTrips}
                        keyExtractor={(item) => item.internal_id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={
                          visibleTrips.length === 0
                            ? styles.tripListEmpty
                            : styles.tripListContent
                        }
                        ListEmptyComponent={
                          <View style={styles.centeredState}>
                            <View style={styles.emptyGlyph}>
                              <FontAwesome
                                name="check"
                                size={16}
                                color={Theme.success}
                              />
                            </View>
                            <Text style={styles.emptyTitle}>
                              {tab === "pending"
                                ? "No pending PODs"
                                : tab === "completed"
                                  ? "No completed trips"
                                  : tab === "not_completed"
                                    ? "No trips in progress"
                                    : `No trips for this ${partyNoun}`}
                            </Text>
                            <Text style={styles.emptySub}>
                              {tab === "pending"
                                ? "Everything from this party is already marked received."
                                : tab === "completed"
                                  ? "None of this party's trips are marked completed yet."
                                  : tab === "not_completed"
                                    ? "All trips for this party are completed."
                                    : `No trips were operated by this ${partyNoun}.`}
                            </Text>
                          </View>
                        }
                        renderItem={({ item }) => {
                          const selected = selectedIds.includes(item.internal_id);
                          const locked = item.hardCopyReceived;
                          const tripCompleted = tripIsDeliveredStatus(item.status);
                          const operatorLabel =
                            item.lane === "asset"
                              ? item.driver_name
                              : item.supplier_name;
                          return (
                            <Pressable
                              style={[
                                styles.tripCard,
                                selected && styles.tripCardSelected,
                                locked && styles.tripCardLocked,
                              ]}
                              onPress={() => toggleTrip(item)}
                              disabled={locked}
                              accessibilityRole="checkbox"
                              accessibilityState={{
                                checked: selected,
                                disabled: locked,
                              }}
                            >
                              <View
                                style={[
                                  styles.check,
                                  selected && styles.checkOn,
                                  locked && styles.checkLocked,
                                ]}
                              >
                                {selected || locked ? (
                                  <FontAwesome
                                    name="check"
                                    size={10}
                                    color={
                                      locked
                                        ? Theme.success
                                        : Theme.buttonPrimaryText
                                    }
                                  />
                                ) : null}
                              </View>
                              <View style={styles.tripCopy}>
                                <Text style={styles.tripId} numberOfLines={1}>
                                  {item.id}
                                </Text>
                                <Text style={styles.tripMeta} numberOfLines={2}>
                                  {item.date} · {operatorLabel}
                                  {"\n"}
                                  {item.from} → {item.to}
                                </Text>
                              </View>
                              <View style={styles.tripBadges}>
                                <TripCompletionStatusTag
                                  completed={tripCompleted}
                                  compact
                                />
                                <View
                                  style={[
                                    styles.badge,
                                    item.lane === "asset"
                                      ? styles.badgeAsset
                                      : styles.badgeMarket,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.badgeText,
                                      item.lane === "asset"
                                        ? styles.badgeTextAsset
                                        : styles.badgeTextMarket,
                                    ]}
                                  >
                                    {item.lane === "asset" ? "Asset" : "Supplier"}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.badge,
                                    locked
                                      ? styles.badgeReceived
                                      : styles.badgePending,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.badgeText,
                                      locked
                                        ? styles.badgeTextReceived
                                        : styles.badgeTextPending,
                                    ]}
                                  >
                                    {locked ? "Received" : "Pending"}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          );
                        }}
                      />
                    </View>
                  ) : (
                    <View style={styles.centeredState}>
                      <View style={styles.emptyGlyph}>
                        <FontAwesome
                          name={partyKind === "driver" ? "user" : "building"}
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.emptyTitle}>
                        Select a {partyNoun}
                      </Text>
                      <Text style={styles.emptySub}>
                        {partyKind === "driver"
                          ? "Asset trips operated by that driver will appear here."
                          : "Trips operated by that supplier will appear here."}
                      </Text>
                    </View>
                  )}
                </View>
                ) : null}
              </View>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={handleFooterBack}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>
                {receiveStep === "trips" ? "Cancel" : "Back"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.primaryBtn,
                ((receiveStep === "trips" && !canSubmit) ||
                  (receiveStep === "details" && !detailsReady) ||
                  markReceived.isPending) &&
                  styles.primaryBtnDisabled,
              ]}
              onPress={
                receiveStep === "trips"
                  ? openReceiveDetails
                  : receiveStep === "details"
                    ? openReceivePreview
                    : handleConfirmReceived
              }
              disabled={
                markReceived.isPending ||
                (receiveStep === "trips" && !canSubmit) ||
                (receiveStep === "details" && !detailsReady)
              }
              accessibilityLabel={
                receiveStep === "preview"
                  ? "Confirm hard-copy POD received"
                  : receiveStep === "details"
                    ? "Preview POD receipt"
                    : "Continue to mark POD received"
              }
            >
              {markReceived.isPending ? (
                <LoadingIndicator color={Theme.buttonPrimaryText} size="small" />
              ) : (
                <>
                  <FontAwesome
                    name={receiveStep === "preview" ? "check" : "arrow-right"}
                    size={12}
                    color={Theme.buttonPrimaryText}
                  />
                  <Text style={styles.primaryBtnText}>
                    {receiveStep === "trips"
                      ? "Mark POD received"
                      : receiveStep === "details"
                        ? "Preview"
                        : "Confirm"}
                  </Text>
                  {receiveStep === "trips" ? (
                    <View
                      style={[
                        styles.primaryCount,
                        !canSubmit && styles.primaryCountMuted,
                      ]}
                    >
                      <Text style={styles.primaryCountText}>
                        {selectedIds.length}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const webPointer =
  Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    alignItems: "stretch",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sheet: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: "hidden",
    flexDirection: "column",
    shadowColor: Theme.brandBlueShadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sheetSplit: {
    maxWidth: 980,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    flexShrink: 0,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    ...webPointer,
  },
  segmentWrap: {
    flexDirection: "row",
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 12,
    padding: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    gap: 4,
    flexShrink: 0,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...webPointer,
  },
  segmentActive: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.actionAccentBorder,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  segmentTextActive: {
    color: Theme.primary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    gap: 12,
    overflow: "hidden",
  },
  bodySplit: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  partyPane: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  partyPaneStackedSelected: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    maxHeight: "38%",
  },
  partyPaneSplit: {
    flex: 0,
    width: 280,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 280,
    alignSelf: "stretch",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.surfaceBorder,
    paddingRight: 14,
    minHeight: 0,
  },
  paneEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 8,
    flexShrink: 0,
  },
  searchWrap: {
    minHeight: 44,
    flexShrink: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Theme.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 10,
  },
  stepBody: {
    flex: 1,
    minHeight: 0,
  },
  wizardBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  wizardSegmentWrap: {
    flexDirection: "row",
    marginBottom: 12,
    padding: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    gap: 4,
    flexShrink: 0,
  },
  previewScrollContent: {
    paddingBottom: 12,
  },
  wizardPane: {
    flex: 1,
    minHeight: 0,
  },
  courierList: {
    flex: 1,
    minHeight: 0,
    marginBottom: 10,
  },
  courierCopy: {
    flex: 1,
    minWidth: 0,
  },
  courierCategory: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  courierSelectedHint: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  typedCourierCard: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.actionAccentBorder,
  },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  fieldInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    color: Theme.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  inHandHint: {
    paddingVertical: 8,
  },
  dateTabs: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    flexShrink: 0,
  },
  dateTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  dateTabActive: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.actionAccentBorder,
  },
  dateTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  dateTabTextActive: {
    color: Theme.primary,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimary,
    marginBottom: 10,
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  previewRow: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  previewTrip: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  partyList: {
    flex: 1,
    minHeight: 0,
  },
  partyListContent: {
    paddingBottom: 16,
  },
  partyCard: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...webPointer,
  },
  partyCardActive: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.actionAccentBorder,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: {
    backgroundColor: Theme.brandBlue,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  avatarTextActive: {
    color: Theme.primary,
  },
  partyName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  partyNameActive: {
    color: Theme.primary,
  },
  paneEmpty: {
    paddingVertical: 20,
    alignItems: "center",
  },
  tripsPane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  tripsPaneSplit: {
    paddingLeft: 14,
  },
  tripsFill: {
    flex: 1,
    minHeight: 0,
  },
  tripsToolbar: {
    gap: 10,
    marginBottom: 10,
    flexShrink: 0,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  selectedChipText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  countPill: {
    borderRadius: 999,
    backgroundColor: Theme.warningMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.warning,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tripTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  tripTab: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: Theme.surface,
    ...webPointer,
  },
  tripTabActive: {
    backgroundColor: Theme.brandBlue,
  },
  tripTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  tripTabTextActive: {
    color: Theme.primary,
  },
  selectAllBtn: {
    minHeight: 32,
    justifyContent: "center",
    alignSelf: "flex-start",
    ...webPointer,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  selectAllDisabled: {
    color: Theme.textMuted,
  },
  tripList: {
    flex: 1,
    minHeight: 0,
  },
  tripListContent: {
    paddingBottom: 8,
  },
  tripListEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  tripCard: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    ...webPointer,
  },
  tripCardSelected: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.actionAccentBorder,
  },
  tripCardLocked: {
    opacity: 0.62,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: Theme.brandBlue,
    borderColor: Theme.actionAccentBorder,
  },
  checkLocked: {
    backgroundColor: Theme.surface,
    borderColor: Theme.success,
  },
  tripCopy: {
    flex: 1,
    minWidth: 0,
  },
  tripId: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  tripMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  tripBadges: {
    alignItems: "flex-end",
    gap: 4,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeAsset: {
    backgroundColor: Theme.brandBlueSoft,
  },
  badgeMarket: {
    backgroundColor: Theme.surfaceGray,
  },
  badgePending: {
    backgroundColor: Theme.warningMuted,
  },
  badgeReceived: {
    backgroundColor: Theme.surface,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  badgeTextAsset: {
    color: Theme.primary,
  },
  badgeTextMarket: {
    color: Theme.textMuted,
  },
  badgeTextPending: {
    color: Theme.warning,
  },
  badgeTextReceived: {
    color: Theme.success,
  },
  centeredState: {
    flex: 1,
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyGlyph: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
    textAlign: "center",
    fontWeight: "600",
    maxWidth: 280,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.surfaceLight,
    flexShrink: 0,
    zIndex: 2,
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
    ...webPointer,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    ...webPointer,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
  primaryCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  primaryCountMuted: {
    backgroundColor: Theme.textMuted,
  },
  primaryCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.buttonMatteBlackText,
  },
});
