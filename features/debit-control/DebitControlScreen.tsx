import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PodInwardFormModal } from "@/features/debit-control/components/PodInwardFormModal";
import { PodReceivedTable } from "@/features/debit-control/components/PodReceivedTable";
import { PodValidationModal } from "@/features/debit-control/components/PodValidationModal";
import {
  useDebitControlBoardQuery,
  useMarkPodInwardMutation,
  useValidatePodsMutation,
} from "@/features/debit-control/hooks/useDebitControlPod";
import type { DebitControlPendingTrip, DebitControlReceivedTrip } from "@/features/debit-control/utils/debitControlPod.model";
import {
  isTripOpenForValidation,
  selectableReceivedTripIds,
  tripMatchesReceivedSearch,
} from "@/features/debit-control/utils/podChargeTotals.util";
import type { PodInwardDraft } from "@/features/debit-control/utils/podInwardForm.util";
import type { ValidatePodTripInput } from "@/features/debit-control/services/debitControlPod.service";
import { isSoftPodDocumentType } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  getDocumentsByTripId,
  tryGetDocumentViewUrl,
} from "@/features/trips/services/tripDocuments.service";
import { useCapabilities } from "@/lib/useCapabilities";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BoardTab = "pending" | "received";

function formatListDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DebitControlScreen({ embedded = false }: { embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile } = useAuth();
  const caps = useCapabilities();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const allowed =
    Boolean(profile) &&
    profile?.role !== "driver" &&
    (caps.includes("finance_view") ||
      caps.includes("finance_manage") ||
      caps.includes("dispatch") ||
      caps.includes("dispatch_for_own_fleet"));

  const board = useDebitControlBoardQuery(allowed ? orgId : null);
  const inward = useMarkPodInwardMutation(orgId);
  const validate = useValidatePodsMutation(orgId, user?.uid ?? null);

  const [tab, setTab] = useState<BoardTab>("received");
  const [search, setSearch] = useState("");
  const [pendingSelected, setPendingSelected] = useState<string[]>([]);
  const [receivedSelected, setReceivedSelected] = useState<string[]>([]);
  const [inwardOpen, setInwardOpen] = useState(false);
  const [validationTrips, setValidationTrips] = useState<DebitControlReceivedTrip[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pending = useMemo(() => board.data?.pending ?? [], [board.data?.pending]);
  const received = useMemo(() => board.data?.received ?? [], [board.data?.received]);
  const pendingVisible = useMemo(() => filterPending(pending, search), [pending, search]);
  const receivedVisible = useMemo(
    () => received.filter((trip) => tripMatchesReceivedSearch(trip, search)),
    [received, search],
  );
  const receivedSelectedSet = useMemo(() => new Set(receivedSelected), [receivedSelected]);

  if (!allowed) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>Your account does not have access to Debit Control.</Text>
      </View>
    );
  }

  if (orgLoading || board.isLoading) {
    return <CenteredLoadingView message="Loading POD Received" />;
  }

  const openValidation = (trips: DebitControlReceivedTrip[]) => {
    const open = trips.filter(isTripOpenForValidation);
    if (open.length === 0) return;
    setFormError(null);
    setValidationTrips(open);
  };

  const submitInward = async (draft: PodInwardDraft) => {
    setFormError(null);
    const result = await inward.mutateAsync({ tripIds: pendingSelected, draft });
    if (result.updatedIds.length > 0) {
      setPendingSelected((current) => current.filter((id) => !result.updatedIds.includes(id)));
      setInwardOpen(false);
      setTab("received");
      setBanner(
        result.error
          ? `Moved ${result.updatedIds.length} trip(s) to POD Received. ${result.error.message}`
          : `${result.updatedIds.length} trip(s) moved to POD Received.`,
      );
      return;
    }
    setFormError(result.error?.message ?? "Could not mark inward.");
  };

  const submitValidation = async (rows: ValidatePodTripInput[]) => {
    setFormError(null);
    const result = await validate.mutateAsync(rows);
    if (result.updatedIds.length > 0) {
      setReceivedSelected((current) => current.filter((id) => !result.updatedIds.includes(id)));
      setValidationTrips([]);
      setBanner(
        result.error
          ? `Validated ${result.updatedIds.length} trip(s). ${result.error.message}`
          : `${result.updatedIds.length} trip(s) marked validated.`,
      );
      return;
    }
    setFormError(result.error?.message ?? "Could not validate the selected trips.");
  };

  return (
    <View style={[styles.root, { paddingTop: embedded ? 0 : insets.top }]}>
      <View style={styles.header}>
        {!embedded ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" style={styles.back}>
            <FontAwesome name="arrow-left" size={18} color={Theme.primaryText} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.title}>Debit Control</Text>
          <Text style={styles.subtitle}>POD Received after inward</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton label={`POD Pending (${pending.length})`} active={tab === "pending"} onPress={() => setTab("pending")} />
        <TabButton label={`POD Received (${received.length})`} active={tab === "received"} onPress={() => setTab("received")} />
      </View>

      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search trip, LR, client, vendor"
          placeholderTextColor={Theme.textMuted}
          style={styles.search}
          accessibilityLabel="Search POD Received"
        />
        {tab === "pending" ? (
          <Pressable
            style={[styles.action, pendingSelected.length === 0 && styles.actionDisabled]}
            disabled={pendingSelected.length === 0}
            onPress={() => {
              setFormError(null);
              setInwardOpen(true);
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: pendingSelected.length === 0 }}
          >
            <Text style={styles.actionText}>Proceed to Inward</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.action, receivedSelected.length === 0 && styles.actionDisabled]}
            disabled={receivedSelected.length === 0}
            onPress={() =>
              openValidation(received.filter((trip) => receivedSelectedSet.has(trip.id)))
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: receivedSelected.length === 0 }}
            accessibilityLabel="Validate"
          >
            <Text style={styles.actionText}>
              Validate{receivedSelected.length > 0 ? ` (${receivedSelected.length})` : ""}
            </Text>
          </Pressable>
        )}
      </View>

      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      {board.isError ? (
        <Text style={styles.error}>{board.error instanceof Error ? board.error.message : "Could not load trips."}</Text>
      ) : null}

      {tab === "pending" ? (
        <PendingList
          trips={pendingVisible}
          selectedIds={pendingSelected}
          onToggle={(id) =>
            setPendingSelected((current) =>
              current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
            )
          }
        />
      ) : receivedVisible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No POD Received trips</Text>
          <Text style={styles.emptyBody}>
            Completed trips appear here after POD inward. Mark them inward from POD Pending.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <PodReceivedTable
            trips={receivedVisible}
            selectedIds={receivedSelectedSet}
            onToggle={(id) =>
              setReceivedSelected((current) =>
                current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
              )
            }
            onToggleAll={() => {
              const ids = selectableReceivedTripIds(receivedVisible);
              const allOn = ids.length > 0 && ids.every((id) => receivedSelectedSet.has(id));
              setReceivedSelected(allOn ? [] : ids);
            }}
            onValidateOne={(trip) => openValidation([trip])}
          />
        </ScrollView>
      )}

      <PodInwardFormModal
        visible={inwardOpen}
        tripCount={pendingSelected.length}
        submitting={inward.isPending}
        error={formError}
        onClose={() => {
          if (!inward.isPending) setInwardOpen(false);
        }}
        onSubmit={(draft) => void submitInward(draft)}
      />
      <PodValidationModal
        visible={validationTrips.length > 0}
        trips={validationTrips}
        submitting={validate.isPending}
        error={formError}
        onClose={() => {
          if (!validate.isPending) setValidationTrips([]);
        }}
        onConfirm={(rows) => void submitValidation(rows)}
      />
    </View>
  );
}

function filterPending(trips: DebitControlPendingTrip[], query: string): DebitControlPendingTrip[] {
  const q = query.trim().toLowerCase();
  if (!q) return trips;
  return trips.filter((trip) =>
    [trip.displayId, trip.clientName, trip.vendorName, trip.from, trip.to, ...trip.lrNumbers]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

function PendingList({
  trips,
  selectedIds,
  onToggle,
}: {
  trips: DebitControlPendingTrip[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (trips.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No trips waiting for inward</Text>
        <Text style={styles.emptyBody}>Completed trips without a received POD show up here.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.pendingList}>
      {trips.map((trip) => {
        const selected = selectedIds.includes(trip.id);
        return (
          <Pressable
            key={trip.id}
            style={[styles.pendingCard, selected && styles.pendingCardOn]}
            onPress={() => onToggle(trip.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
          >
            <View style={[styles.box, selected && styles.boxOn]}>
              {selected ? <FontAwesome name="check" size={10} color={Theme.buttonDarkText} /> : null}
            </View>
            <View style={styles.pendingBody}>
              <Text style={styles.pendingTitle}>{trip.displayId}</Text>
              <Text style={styles.pendingMeta}>
                {formatListDate(trip.tripDate)} · {trip.lrNumbers.join(", ") || "No LR"} · {trip.from} → {trip.to}
              </Text>
              <Text style={styles.pendingMeta}>
                {trip.clientName} · {trip.vendorName}
                {trip.hasSoftPod ? " · Soft POD uploaded" : ""}
              </Text>
              {trip.hasSoftPod ? (
                <Pressable onPress={() => void openSoftPod(trip.id)} hitSlop={8}>
                  <Text style={styles.link}>View soft POD</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

async function openSoftPod(tripId: string) {
  const { documents } = await getDocumentsByTripId(tripId, { includeOcr: false });
  const pod = documents.find((doc) => isSoftPodDocumentType(doc.document_type) && doc.storage_path);
  if (!pod) return;
  const url = await tryGetDocumentViewUrl(pod.storage_path);
  if (url) await Linking.openURL(url);
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
      {active ? <View style={styles.tabLine} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontWeight: "800", color: Theme.primaryText },
  subtitle: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  tabs: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  tab: { minHeight: 44, justifyContent: "center" },
  tabText: { fontSize: 13, fontWeight: "700", color: Theme.textSecondary },
  tabTextOn: { color: Theme.primaryText },
  tabLine: { height: 2, backgroundColor: Theme.buttonDark, marginTop: 8 },
  toolbar: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
  },
  search: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: Theme.primaryText,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: Theme.buttonDarkText, fontWeight: "700", fontSize: 13 },
  banner: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 8,
    color: Theme.success,
    fontSize: 13,
    fontWeight: "600",
  },
  error: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 8,
    color: Theme.buttonDestructive,
    fontSize: 13,
  },
  list: { flex: 1 },
  empty: { padding: 24, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Theme.primaryText },
  emptyBody: { fontSize: 13, color: Theme.textSecondary },
  pendingList: { padding: Layout.screenPaddingHorizontal, gap: 8 },
  pendingCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
  },
  pendingCardOn: { borderColor: Theme.buttonDark, backgroundColor: Theme.brandBlueSoft },
  pendingBody: { flex: 1, minWidth: 0, gap: 2 },
  pendingTitle: { fontWeight: "700", color: Theme.primaryText },
  pendingMeta: { fontSize: 12, color: Theme.textSecondary },
  link: { color: Theme.primary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  box: {
    width: 18,
    height: 18,
    marginTop: 2,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  blocked: { flex: 1, paddingHorizontal: 24, backgroundColor: Theme.screenBackground },
  blockedTitle: { fontSize: 18, fontWeight: "700", color: Theme.primaryText },
  blockedBody: { marginTop: 8, color: Theme.textSecondary },
});
