/**
 * Invoicing Execute Screen — adapted from cashflow InvoicingCenter / ClientSidebar / TripList.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { PulsePillButton } from "@/components/PulsePillButton";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { InvoicePreviewPanel } from "@/features/invoicing/components/InvoicePreviewPanel";
import { InvoiceDraftsPanel } from "@/features/invoicing/components/InvoiceDraftsPanel";
import { IssuedInvoicesPanel } from "@/features/invoicing/components/IssuedInvoicesPanel";
import { PendingBillingInsightPanel } from "@/features/invoicing/components/PendingBillingInsightPanel";
import { FinanceInvoiceClientRail } from "@/features/invoicing/components/FinanceInvoiceClientRail";
import { FinanceManualInvoicePanel } from "@/features/invoicing/components/FinanceManualInvoicePanel";
import {
  FinanceInvoiceAppBar,
  FinanceInvoiceClientHeader,
  FinanceInvoicePreviewEmpty,
  FinanceInvoiceStatusPill,
  FinanceInvoiceWorkspaceTabs,
} from "@/features/invoicing/components/FinanceInvoiceWorkspaceChrome";
import { financeInvoiceWorkspaceStyles } from "@/features/invoicing/components/financeInvoiceWorkspace.styles";
import { buildFinanceClientRailRows } from "@/features/invoicing/utils/financeClientRail.util";
import {
  filterInvoicePreviewTrips,
  financeInvoiceWorkspacePill,
  invoicePodRequiredMode,
  invoicePodRequiredModeLabel,
  invoicePreviewExclusionNote,
  isInvoiceHardPodLoggable,
  isInvoiceWorkspaceSelectable,
  summarizeInvoiceWorkspaceSelection,
  validateHardCopyPodReceiptSelection,
} from "@/features/invoicing/utils/financeInvoicePodAction.util";
import { ClientProfileScreen } from "@/features/clients/components/ClientProfileScreen";
import {
  issueManualInvoice,
  saveManualInvoiceDraft,
} from "@/features/invoicing/services/manualInvoice.service";
import { buildInvoiceIssuerSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import {
  buildInvoiceDraftModelFromManualLines,
  formatInvoicePreviewDate,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import { useInvoiceDraftClientsQuery } from "@/features/invoicing/hooks/useInvoiceDraftClients";
import {
  emptyManualInvoiceLine,
  type ManualInvoiceLineDraft,
} from "@/features/invoicing/utils/manualInvoice.util";
import { invoiceHsnIssueBlock } from "@/features/invoicing/utils/invoiceLineHsn.util";
import { financeCreateInvoiceLabel } from "@/features/invoicing/utils/financeInvoicePreview.util";
import {
  buildSavedInvoicePreviewModel,
  manualLinesFromSavedItems,
  parseSavedInvoiceLines,
} from "@/features/invoicing/utils/savedInvoicePreview.util";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { invoiceSourceLabel } from "@/features/invoicing/utils/invoiceSource.util";
import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { ROUTES } from "@/lib/routes";
import { TripCompletionFilterBar } from "@/features/trips/components/TripCompletionFilterBar";
import {
  TripCompletionOrPodTags,
  TripCompletionStatusTag,
  TripPodStatusTags,
} from "@/features/trips/components/TripPodStatusTags";
import {
  countTripsByCompletion,
  tripIsDeliveredStatus,
  tripMatchesCompletionFilter,
  type TripCompletionListFilter,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { resolveInvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import {
  filterTripsByPodRequired,
  invoiceBuildBlockedReason,
  restoreInvoiceDraftTripIds,
} from "@/features/invoicing/utils/invoicePodRequired.util";
import { LogIncomingPodsModal } from "@/features/log-pods/components/LogIncomingPodsModal";
import {
  displayOperationalField,
  invoiceTripOperationalSeedFromView,
} from "@/features/invoicing/utils/invoiceTripOperational.util";
import { updateClientInvoicePodPolicy } from "@/features/clients/services/clients.service";
import {
  effectiveInvoicePodPolicyFromClientRaw,
  invoiceIssuePodPolicyReason,
  invoiceNeedsDigitalPodLookup,
  invoiceSelectionClientIdentityError,
  invoiceTripPodHint,
  type InvoicePodEvidence,
} from "@/features/invoicing/utils/invoicePodEnforcement.util";
import {
  evaluateFinanceWorkflowTrip,
  summarizeFinanceClientPicture,
} from "@/features/invoicing/utils/financeWorkflowState.util";
import { issueIdempotencyKey } from "@/features/invoicing/utils/invoiceLifecycle.util";
import {
  discardInvoiceDraft,
  saveInvoiceDraft,
} from "@/features/invoicing/services/invoiceDraft.service";
import type { InvoicePodPolicy } from "@/features/invoicing/utils/invoicePodPolicy.util";
import type {
  InvoicePayload,
  InvoicingTripView,
} from "@/features/invoicing/services/invoicing.service";
import { invoicingClientGroupKey } from "@/features/invoicing/services/invoicePreviewModel.service";
import { useCapabilities } from "@/lib/useCapabilities";
import { queryKeys } from "@/lib/queryKeys";
import {
  useExecuteInvoiceMutation,
  useInvoiceClientPodPoliciesQuery,
  useInvoiceDigitalPodTripIdsQuery,
  useInvoicingExecuteTripsQuery,
  useDraftInvoicesQuery,
  useIssuedInvoicesQuery,
} from "@/lib/queries/useInvoicingExecuteQueries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import { usePulseProductShell } from "@/features/product-shell/PulseProductShell";
import { useRouter, usePathname, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    type ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function parseCreateTripIdsParam(
  value: string | string[] | undefined,
): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseCreateClientParam(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = (raw ?? "").trim();
  return trimmed || null;
}

function canAccessInvoicing(
  profile: ReturnType<typeof useAuth>["profile"],
  caps: import("@/lib/capabilities").Capability[],
): boolean {
  if (!profile || profile.role === "driver") return false;
  return (
    caps.includes("finance_view") ||
    caps.includes("finance_manage") ||
    caps.includes("dispatch") ||
    caps.includes("dispatch_for_own_fleet")
  );
}

function tripPodEvidence(trip: InvoicingTripView): InvoicePodEvidence {
  return {
    digitalPodPresent: trip.digitalPodPresent === true,
    physicalPodReceived: trip.physicalPodReceived === true,
  };
}

function resolveTripInvoicePodPolicy(
  trip: InvoicingTripView,
  policies: Record<string, unknown> | undefined,
): { policy: InvoicePodPolicy; source: "client" } | { error: string } {
  const clientId = (trip.client_id ?? "").trim();
  const raw = clientId ? policies?.[clientId] : null;
  const resolved = effectiveInvoicePodPolicyFromClientRaw({
    clientPolicyRaw: clientId ? raw : null,
  });
  if (!resolved.ok) return { error: resolved.error };
  return { policy: resolved.policy, source: resolved.source };
}

function workflowForInvoiceTrip(
  trip: InvoicingTripView,
  policies: Record<string, unknown> | undefined,
) {
  const resolved = resolveTripInvoicePodPolicy(
    trip,
    policies,
  );
  if ("error" in resolved) {
    return { error: resolved.error as string, state: null };
  }
  return {
    error: null as string | null,
    state: evaluateFinanceWorkflowTrip({
      tripStatus: trip.tripStatus,
      policy: resolved.policy,
      physicalPodReceived: trip.physicalPodReceived === true,
      digitalPodPresent: trip.digitalPodPresent === true,
      invoiced: trip.invoiced === true,
      inDraft: trip.inDraft === true,
    }),
    source: resolved.source,
    policy: resolved.policy,
  };
}

function invoiceWorkspaceTripFlags(
  trip: InvoicingTripView,
  policies: Record<string, unknown> | undefined,
) {
  const resolved = workflowForInvoiceTrip(trip, policies);
  const policy = resolved.policy ?? null;
  const physicalPodReceived = trip.physicalPodReceived === true;
  if (!resolved.state) {
    return {
      selectable: false,
      invoiceable: false,
      loggable: false,
      pill: "—",
      policy,
      state: null,
    };
  }
  const args = {
    state: resolved.state,
    policy,
    physicalPodReceived,
  };
  return {
    selectable: isInvoiceWorkspaceSelectable(args),
    invoiceable: resolved.state.invoiceable === true,
    loggable: isInvoiceHardPodLoggable(args),
    pill: financeInvoiceWorkspacePill(resolved.state.invoiceState),
    policy,
    state: resolved.state,
  };
}

type InvoiceBillingSurface = "pending" | "drafts" | "issued" | "details";

function InvoiceBillingSurfaceTabs({
  value,
  onChange,
}: {
  value: InvoiceBillingSurface;
  onChange: (next: InvoiceBillingSurface) => void;
}) {
  return (
    <View style={styles.billingTabs} accessibilityRole="tablist">
      {(
        [
          { key: "pending", label: "Trips" },
          { key: "drafts", label: "Drafts" },
          { key: "issued", label: "Issued" },
          { key: "details", label: "Client Details" },
        ] as const
      ).map((tab) => {
        const isActive = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.billingTab}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.billingTabLabel, isActive && styles.billingTabLabelActive]}>
              {tab.label}
            </Text>
            {isActive ? <View style={styles.billingTabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function InvoicingExecuteScreen({
  mode = "browse",
}: {
  mode?: "browse" | "create";
}) {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const pathname = usePathname();
  const createParams = useLocalSearchParams<{
    trips?: string | string[];
    client?: string | string[];
    draft?: string | string[];
    compose?: string | string[];
  }>();
  const productShell = usePulseProductShell();
  const inProductShell =
    productShell === "finance-pro" ||
    pathname === "/invoicing-execute" ||
    pathname.startsWith("/invoicing-execute/") ||
    pathname === "/pulse-invoice" ||
    (pathname.startsWith("/pulse-invoice/") &&
      !pathname.startsWith("/pulse-invoice/order"));
  const { profile, user } = useAuth();
  const caps = useCapabilities();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const { activeWorkspace } = useActiveWorkspace();
  const orgId = currentOrganization?.id ?? null;
  const workspaceId = activeWorkspace?.id ?? null;
  const tripScopeId = workspaceId ?? orgId;
  const issuer = useMemo(
    () => resolveInvoiceIssuerIdentity({ workspace: activeWorkspace }),
    [activeWorkspace],
  );

  const {
    data: allTrips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInvoicingExecuteTripsQuery(tripScopeId);
  const invoiceClientIds = useMemo(
    () =>
      Array.from(
        new Set(
          (allTrips ?? [])
            .map((trip) => (trip.client_id ?? "").trim())
            .filter(Boolean),
        ),
      ),
    [allTrips],
  );
  const clientPoliciesQuery = useInvoiceClientPodPoliciesQuery(
    tripScopeId,
    invoiceClientIds,
  );
  const clientPolicies = clientPoliciesQuery.data;
  const {
    data: issuedInvoices = [],
    isRefetching: issuedRefetching,
    refetch: refetchIssued,
  } = useIssuedInvoicesQuery(orgId);
  const { data: draftInvoices = [] } = useDraftInvoicesQuery(orgId);
  const issueMutation = useExecuteInvoiceMutation(orgId);
  const issueInFlight = useRef(false);
  const issueIdempotencyRef = useRef<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [issuedReceipt, setIssuedReceipt] = useState<{
    invoiceNumber: string;
    tripCount: number;
    totalAmount: number;
  } | null>(null);

  const [invoiceSurface, setInvoiceSurface] =
    useState<InvoiceBillingSurface>("pending");
  const [inspectedIssuedInvoice, setInspectedIssuedInvoice] =
    useState<IssuedInvoiceListRow | null>(null);
  const [logPodTripIds, setLogPodTripIds] = useState<string[] | null>(null);
  const [composeMode, setComposeMode] = useState<"trips" | "manual">("trips");
  const [manualLines, setManualLines] = useState<ManualInvoiceLineDraft[]>(() => [
    emptyManualInvoiceLine("line-1"),
  ]);
  const [manualBuiltLines, setManualBuiltLines] = useState<InvoiceLineSnapshot[]>(
    [],
  );
  const [manualInvoiceDate, setManualInvoiceDate] = useState(() =>
    formatInvoicePreviewDate(new Date()),
  );
  const [manualDueDate, setManualDueDate] = useState("");
  const [manualPo, setManualPo] = useState("");
  const [manualTerms, setManualTerms] = useState("Net 30");
  const [manualDraftId, setManualDraftId] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState<"draft" | "issue" | null>(null);
  const manualIssueKey = useRef(
    `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  useEffect(() => {
    const compose = Array.isArray(createParams.compose)
      ? createParams.compose[0]
      : createParams.compose;
    if (compose === "manual") setComposeMode("manual");
    if (pathname.endsWith("/manual")) setComposeMode("manual");
  }, [createParams.compose, pathname]);

  useEffect(() => {
    if (invoiceSurface !== "issued") return;
    void refetchIssued();
  }, [invoiceSurface, refetchIssued]);

  const softCopyTripIds = useMemo(
    () =>
      allTrips
        .filter((trip) => {
          const resolved = resolveTripInvoicePodPolicy(
            trip,
            clientPolicies,
          );
          if ("error" in resolved) return false;
          return invoiceNeedsDigitalPodLookup(resolved.policy);
        })
        .map((trip) => trip.internal_id),
    [allTrips, clientPolicies],
  );
  const digitalPodsQuery = useInvoiceDigitalPodTripIdsQuery(
    tripScopeId,
    softCopyTripIds,
    softCopyTripIds.length > 0,
  );
  const tripsForInvoice = useMemo(() => {
    const digital = digitalPodsQuery.data;
    return allTrips.map((trip) => {
      const digitalPodPresent = digital?.has(trip.internal_id) === true;
      return {
        ...trip,
        digitalPodPresent,
        status: (digitalPodPresent
          ? "approved"
          : trip.physicalPodReceived
            ? "received"
            : "pending") as InvoicingTripView["status"],
        checks: { ...trip.checks, podReceived: digitalPodPresent },
        invoiced: trip.invoiced === true,
        issuedInvoiceNumber: trip.issuedInvoiceNumber ?? null,
        inDraft: trip.inDraft === true,
        draftInvoiceNumber: trip.draftInvoiceNumber ?? null,
      };
    });
  }, [allTrips, digitalPodsQuery.data]);

  const buildBlockedReason = invoiceBuildBlockedReason(false);

  const scopedTrips = useMemo(
    () => filterTripsByPodRequired(tripsForInvoice, false),
    [tripsForInvoice],
  );

  const summaryData = useMemo(() => {
    let pod_pending_sum = 0;
    let received_sum = 0;
    let approved_sum = 0;
    for (const t of scopedTrips) {
      if (t.status === "approved") approved_sum += t.amount;
      else if (t.status === "received") received_sum += t.amount;
      else pod_pending_sum += t.amount;
    }
    return { pod_pending_sum, received_sum, approved_sum };
  }, [scopedTrips]);

  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [completionFilter, setCompletionFilter] =
    useState<TripCompletionListFilter>("all");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { width } = useWindowDimensions();
  /** Below this width: stacked mobile wizard (matches POD / preview column split). */
  const INVOICING_DESKTOP_MIN = 1024;
  const isLargeScreen = width >= INVOICING_DESKTOP_MIN;
  const allowed = canAccessInvoicing(profile, caps);
  const mobileBottomPad = layout.scrollBottomPadding(16);

  const formatCurrencySimple = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return "₹" + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const clientStats = useMemo(
    () =>
      buildFinanceClientRailRows({
        trips: scopedTrips,
        clientSearch,
        clientPolicies,
        invoices: [...issuedInvoices, ...draftInvoices],
      }),
    [scopedTrips, clientSearch, clientPolicies, issuedInvoices, draftInvoices],
  );

  const activeClientLabel = useMemo(() => {
    if (!activeClient) return null;
    const fromStats = clientStats.find((c) => c.key === activeClient);
    if (fromStats?.name) return fromStats.name;
    if (activeClient.startsWith("name:")) return activeClient.slice(5);
    return scopedTrips.find((t) => invoicingClientGroupKey(t) === activeClient)
      ?.client ?? null;
  }, [activeClient, scopedTrips, clientStats]);

  const clientTripsBase = useMemo(() => {
    if (!activeClient) return [];

    const parseDate = (dateStr: string) => {
      // Very basic date parser assuming YYYY-MM-DD or DD/MM/YYYY for simplicity here
      const [p1, p2, p3] = dateStr.includes("/")
        ? dateStr.split("/")
        : dateStr.split("-");
      if (dateStr.includes("/")) {
        // DD/MM/YYYY -> YYYY-MM-DD
        return new Date(`${p3}-${p2}-${p1}`);
      }
      return new Date(dateStr);
    };

    const sDate = startDate ? parseDate(startDate) : null;
    const eDate = endDate ? parseDate(endDate) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);

    const q = searchQuery.toLowerCase().trim();

    return scopedTrips
      .filter((t) => {
        if (invoicingClientGroupKey(t) !== activeClient) return false;

        const supplier = (t.supplier_name || "").toLowerCase();
        if (
          q &&
          !t.id.toLowerCase().includes(q) &&
          !t.route.toLowerCase().includes(q) &&
          !supplier.includes(q)
        )
          return false;

        const tripDate = new Date(t.date);
        if (sDate && tripDate < sDate) return false;
        if (eDate && tripDate > eDate) return false;

        return true;
      })
      .sort((a, b) => {
        // Sort: Approved first, then Received, then Pending
        const statusOrder = {
          approved: 0,
          received: 1,
          pending: 2,
          warning: 3,
          blocked: 4,
        };
        return statusOrder[a.status] - statusOrder[b.status];
      });
  }, [scopedTrips, activeClient, searchQuery, startDate, endDate]);

  const completionCounts = useMemo(
    () => countTripsByCompletion(clientTripsBase, (t) => t.tripStatus),
    [clientTripsBase],
  );

  const clientTrips = useMemo(
    () =>
      clientTripsBase.filter((t) =>
        tripMatchesCompletionFilter(completionFilter, t.tripStatus),
      ),
    [clientTripsBase, completionFilter],
  );

  const logPodSeeds = useMemo(
    () =>
      (logPodTripIds ?? [])
        .map((id) => {
          const trip =
            clientTrips.find((row) => row.internal_id === id) ??
            scopedTrips.find((row) => row.internal_id === id);
          return trip ? invoiceTripOperationalSeedFromView(trip) : null;
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [clientTrips, logPodTripIds, scopedTrips],
  );

  const tripsById = useMemo(() => {
    const map = new Map<string, InvoicingTripView>();
    for (const t of scopedTrips) {
      map.set(t.id, t);
      if (t.internal_id) map.set(t.internal_id, t);
    }
    return map;
  }, [scopedTrips]);

  const selectedTrips = useMemo(() => {
    return selectedTripIds.map((id) => tripsById.get(id)).filter(Boolean);
  }, [tripsById, selectedTripIds]);

  const previewTrips = useMemo(() => {
    if (inspectedIssuedInvoice) {
      const wanted = new Set(inspectedIssuedInvoice.trip_ids);
      return scopedTrips.filter(
        (trip) => wanted.has(trip.internal_id) || wanted.has(trip.id),
      );
    }
    return filterInvoicePreviewTrips(selectedTrips, (trip) =>
      invoiceWorkspaceTripFlags(trip, clientPolicies).invoiceable,
    );
  }, [inspectedIssuedInvoice, selectedTrips, scopedTrips, clientPolicies]);

  const invoiceableTrips = useMemo(
    () =>
      clientTrips.filter((trip) => {
        const resolved = workflowForInvoiceTrip(
          trip,
          clientPolicies,
        );
        return resolved.state?.invoiceable === true;
      }),
    [clientTrips, clientPolicies],
  );

  const clientPicture = useMemo(() => {
    const clientId =
      activeClient && !activeClient.startsWith("name:") ? activeClient : "";
    if (!clientId) return null;
    const resolved = effectiveInvoicePodPolicyFromClientRaw({
      clientPolicyRaw: clientPolicies?.[clientId],
    });
    return summarizeFinanceClientPicture({
      clientId,
      clientName: activeClientLabel,
      clientPolicy: resolved.ok ? resolved.policy : null,
      trips: clientTripsBase.map((trip) => ({
        id: trip.internal_id || trip.id,
        tripStatus: trip.tripStatus,
        client_id: trip.client_id,
        client_price: trip.amount,
        physicalPodReceived: trip.physicalPodReceived === true,
        digitalPodPresent: trip.digitalPodPresent === true,
      })),
      issuedInvoices: [...issuedInvoices, ...draftInvoices],
    });
  }, [
    activeClient,
    activeClientLabel,
    clientPolicies,
    clientTripsBase,
    draftInvoices,
    issuedInvoices,
  ]);

  const activeClientPolicy = useMemo(() => {
    if (!activeClient || activeClient.startsWith("name:")) return null;
    const resolved = effectiveInvoicePodPolicyFromClientRaw({
      clientPolicyRaw: clientPolicies?.[activeClient],
    });
    return resolved.ok ? resolved.policy : null;
  }, [activeClient, clientPolicies]);
  const podRequired = invoicePodRequiredMode(activeClientPolicy) === "on";
  const activePolicyLabel = invoicePodRequiredModeLabel(activeClientPolicy);
  const showHardCopyToggle =
    activeClientPolicy === "none" || activeClientPolicy === "hard_copy";

  const persistClientPodRequired = useCallback(
    async (nextOn: boolean) => {
      const clientId =
        activeClient && !activeClient.startsWith("name:") ? activeClient : null;
      if (!orgId || !clientId) return;
      const { error } = await updateClientInvoicePodPolicy(
        orgId,
        clientId,
        nextOn ? "hard_copy" : "none",
      );
      if (error) {
        Alert.alert("POD Required", error.message);
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["q", "invoicing", "client-pod-policies", orgId],
      });
    },
    [activeClient, orgId, queryClient],
  );

  const selectedClientId =
    activeClient && !activeClient.startsWith("name:") ? activeClient : null;
  const { data: manualFetchedClients = [] } = useInvoiceDraftClientsQuery(
    workspaceId,
    composeMode === "manual" && selectedClientId ? [selectedClientId] : [],
  );
  const manualClientRow =
    manualFetchedClients.find((row) => row.id === selectedClientId) ?? null;
  const manualDraftModel = useMemo(() => {
    if (composeMode !== "manual" || !issuer || !selectedClientId) return null;
    const gstRate = Number(manualLines[0]?.taxRate ?? 18);
    return buildInvoiceDraftModelFromManualLines({
      issuer,
      client: {
        client_id: selectedClientId,
        legal_name: manualClientRow?.legal_name ?? activeClientLabel,
        display_name: manualClientRow?.name ?? activeClientLabel,
        gstin: manualClientRow?.gstin ?? null,
        pan: manualClientRow?.pan ?? null,
        billing_address: manualClientRow?.billing_address ?? null,
        state: manualClientRow?.state ?? null,
        email: manualClientRow?.email ?? null,
      },
      lines: manualBuiltLines,
      previewDate: manualInvoiceDate,
      paymentTerms: manualTerms,
      notes: manualPo || null,
      includeGst: true,
      gstRate: Number.isFinite(gstRate) ? gstRate : 18,
    });
  }, [
    activeClientLabel,
    composeMode,
    issuer,
    manualBuiltLines,
    manualClientRow,
    manualInvoiceDate,
    manualLines,
    manualPo,
    manualTerms,
    selectedClientId,
  ]);

  const issuedPreviewDraft = useMemo(() => {
    if (!inspectedIssuedInvoice || !issuer) return null;
    const lines = parseSavedInvoiceLines(inspectedIssuedInvoice.line_items);
    return buildSavedInvoicePreviewModel({
      issuer,
      invoiceNumber: inspectedIssuedInvoice.invoice_number,
      invoiceDate: inspectedIssuedInvoice.invoice_date,
      paymentTerms: inspectedIssuedInvoice.payment_terms ?? null,
      notes: inspectedIssuedInvoice.notes ?? null,
      client: {
        client_id: inspectedIssuedInvoice.client_id,
        legal_name: inspectedIssuedInvoice.client_name,
        display_name: inspectedIssuedInvoice.client_name ?? "Client",
        gstin: null,
        pan: null,
        billing_address: null,
        state: null,
        email: null,
      },
      lines,
      subtotal: inspectedIssuedInvoice.subtotal ?? inspectedIssuedInvoice.total_amount,
      gstRate: inspectedIssuedInvoice.gst_rate ?? 0,
      cgstAmount: inspectedIssuedInvoice.cgst_amount ?? 0,
      sgstAmount: inspectedIssuedInvoice.sgst_amount ?? 0,
      igstAmount: inspectedIssuedInvoice.igst_amount ?? 0,
      totalAmount: inspectedIssuedInvoice.total_amount,
    });
  }, [inspectedIssuedInvoice, issuer]);

  const persistManualInvoice = useCallback(
    async (mode: "draft" | "issue") => {
      if (!orgId || !selectedClientId || !manualDraftModel || !activeWorkspace) {
        Alert.alert("Manual Invoice", "Select a client and add valid lines.");
        return;
      }
      if (manualBuiltLines.length === 0) {
        Alert.alert("Manual Invoice", "Add at least one line with quantity and rate.");
        return;
      }
      if (mode === "issue") {
        const hsnBlock = invoiceHsnIssueBlock(manualBuiltLines);
        if (hsnBlock) {
          Alert.alert("Manual Invoice", hsnBlock);
          return;
        }
      }
      if (manualBusy) return;
      setManualBusy(mode);
      try {
        const shared = {
          orgId,
          clientId: selectedClientId,
          clientName: activeClientLabel,
          subtotal: manualDraftModel.tax.taxable_base,
          gstRate: manualDraftModel.tax.gst_rate,
          sgstAmount: manualDraftModel.tax.sgst_amount,
          cgstAmount: manualDraftModel.tax.cgst_amount,
          igstAmount: manualDraftModel.tax.igst_amount,
          totalAmount: manualDraftModel.tax.total_amount,
          notes: manualPo || null,
          paymentTerms: manualTerms,
          createdBy: user?.uid ?? profile?.uid ?? null,
          issuerSnapshot: buildInvoiceIssuerSnapshot(activeWorkspace),
          clientSnapshot: {
            client_id: selectedClientId,
            legal_name: manualDraftModel.client.legal_name ?? activeClientLabel,
            gstin: manualDraftModel.client.gstin,
            pan: manualDraftModel.client.pan,
            billing_address: manualDraftModel.client.billing_address,
            state: manualDraftModel.client.state,
            email: manualDraftModel.client.email,
          },
          lineItems: manualBuiltLines,
          taxSnapshot: manualDraftModel.tax.snapshot,
          draftId: manualDraftId,
        };
        if (mode === "draft") {
          const res = await saveManualInvoiceDraft(shared);
          if (res.error) throw res.error;
          setManualDraftId(res.draftId ?? manualDraftId);
          Alert.alert("Manual Invoice", "Draft saved.");
        } else {
          const res = await issueManualInvoice({
            ...shared,
            idempotencyKey: manualIssueKey.current,
          });
          if (res.error) throw res.error;
          setComposeMode("trips");
          setInvoiceSurface("issued");
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.invoicing.drafts(orgId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.invoicing.issued(orgId),
        });
      } catch (e) {
        Alert.alert(
          "Manual Invoice",
          e instanceof Error ? e.message : String(e),
        );
      } finally {
        setManualBusy(null);
      }
    },
    [
      activeClientLabel,
      activeWorkspace,
      manualBuiltLines,
      manualBusy,
      manualDraftId,
      manualDraftModel,
      manualPo,
      manualTerms,
      orgId,
      profile?.uid,
      queryClient,
      selectedClientId,
      user?.uid,
    ],
  );

  const openLogPod = useCallback(
    (trips: InvoicingTripView[]) => {
      const clientId =
        activeClient && !activeClient.startsWith("name:") ? activeClient : "";
      const validated = validateHardCopyPodReceiptSelection({
        expectedClientId: clientId,
        candidates: trips.map((trip) => ({
          id: trip.internal_id || trip.id,
          displayId: trip.id,
          exists: true,
          clientId: trip.client_id ?? null,
          completed: tripIsDeliveredStatus(trip.tripStatus),
          physicalPodReceived: trip.physicalPodReceived === true,
        })),
      });
      if (!validated.ok) {
        Alert.alert("Log POD", validated.message);
        return;
      }
      setLogPodTripIds(trips.map((trip) => trip.internal_id));
    },
    [activeClient],
  );

  const clientWorkflowCounts = useMemo(() => {
    if (clientPicture) {
      return {
        unbilled: clientPicture.unbilledTripCount,
        invoiced: clientPicture.invoicedTripCount,
        completed: clientPicture.completedTripCount,
        podPending: clientPicture.podPendingTripCount,
        draft: clientPicture.draftTripCount,
      };
    }
    let unbilled = 0;
    let invoiced = 0;
    for (const trip of clientTripsBase) {
      if (trip.invoiced) invoiced += 1;
      else unbilled += 1;
    }
    return { unbilled, invoiced, completed: 0, podPending: 0, draft: 0 };
  }, [clientPicture, clientTripsBase]);
  const selectableTrips = useMemo(
    () =>
      clientTrips.filter(
        (trip) =>
          invoiceWorkspaceTripFlags(trip, clientPolicies).selectable,
      ),
    [clientTrips, clientPolicies],
  );
  const selectionSummary = useMemo(
    () =>
      summarizeInvoiceWorkspaceSelection(
        selectedTrips.map((trip) => {
          const flags = invoiceWorkspaceTripFlags(trip, clientPolicies);
          return {
            selected: true,
            state: flags.state ?? {
              completed: false,
              podState: "unconfigured" as const,
              invoiceState: "blocked_policy" as const,
              invoiceable: false,
            },
            policy: flags.policy,
            physicalPodReceived: trip.physicalPodReceived === true,
          };
        }),
      ),
    [selectedTrips, clientPolicies],
  );
  const allClientTripsSelected =
    selectableTrips.length > 0 &&
    selectableTrips.every((t) => selectedTripIds.includes(t.id));

  useEffect(() => {
    const allowedIds = new Set(selectableTrips.map((t) => t.id));
    setSelectedTripIds((prev) => {
      const next = prev.filter((id) => allowedIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [selectableTrips]);

  useEffect(() => {
    const restoreDraft = async () => {
      if (!orgId || draftRestored) return;
      if (isLoading) return;

      const applyTripSeed = (seedIds: string[]) => {
        if (seedIds.length === 0) return;
            const eligible = filterTripsByPodRequired(tripsForInvoice, false);
        setSelectedTripIds(
          restoreInvoiceDraftTripIds(
            seedIds,
            eligible.filter((trip) => {
              const resolved = workflowForInvoiceTrip(
                trip,
                clientPolicies,
              );
              return resolved.state?.invoiceable === true;
            }),
            false,
          ),
        );
      };

      const applyClientSeed = (saved: string | null) => {
        if (!saved) return;
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(saved) || saved.startsWith("name:")) {
          setActiveClient(saved);
          return;
        }
        const matching = allTrips.filter((t) => t.client === saved);
        const ids = Array.from(
          new Set(matching.map((t) => t.client_id).filter(Boolean)),
        );
        if (ids.length === 1) setActiveClient(ids[0] ?? null);
        else setActiveClient(`name:${saved}`);
      };

      try {
        const paramTrips = parseCreateTripIdsParam(createParams.trips);
        const paramClient = parseCreateClientParam(createParams.client);
        const paramDraft = parseCreateClientParam(createParams.draft);
        if (paramDraft) setActiveDraftId(paramDraft);
        const raw = await AsyncStorage.getItem(`invoicing_execute_draft_${orgId}`);

        if (!raw) {
          if (mode === "create") {
            applyClientSeed(paramClient);
            applyTripSeed(paramTrips);
          }
          setDraftRestored(true);
          return;
        }
        const parsed = JSON.parse(raw) as {
          activeClient?: string;
          selectedTripIds?: string[];
          clientSearch?: string;
          searchQuery?: string;
          startDate?: string;
          endDate?: string;
          step?: 0 | 1 | 2;
        };

        applyClientSeed(
          mode === "create" && paramClient
            ? paramClient
            : parsed.activeClient ?? null,
        );

        const seedIds =
          mode === "create" && paramTrips.length > 0
            ? paramTrips
            : Array.isArray(parsed.selectedTripIds)
              ? parsed.selectedTripIds
              : [];
        applyTripSeed(seedIds);

        if (typeof parsed.clientSearch === "string") setClientSearch(parsed.clientSearch);
        if (typeof parsed.searchQuery === "string") setSearchQuery(parsed.searchQuery);
        if (typeof parsed.startDate === "string") setStartDate(parsed.startDate);
        if (typeof parsed.endDate === "string") setEndDate(parsed.endDate);
        if (parsed.step === 0 || parsed.step === 1 || parsed.step === 2) setStep(parsed.step);
        if (typeof (parsed as { savedAt?: string }).savedAt === "string") {
          setDraftSavedAt((parsed as { savedAt?: string }).savedAt ?? null);
        }
      } catch {
        // Ignore draft restore errors.
      } finally {
        setDraftRestored(true);
      }
    };
    restoreDraft();
  }, [
    orgId,
    draftRestored,
    allTrips,
    tripsForInvoice,
    clientPolicies,
    isLoading,
    mode,
    createParams.trips,
    createParams.client,
  ]);

  useEffect(() => {
    const persistDraft = async () => {
      if (!orgId || !draftRestored) return;
      try {
        await AsyncStorage.setItem(
          `invoicing_execute_draft_${orgId}`,
          JSON.stringify({
            activeClient,
            selectedTripIds,
            clientSearch,
            searchQuery,
            startDate,
            endDate,
            step,
            savedAt: new Date().toISOString(),
          }),
        );
        setDraftSavedAt(new Date().toISOString());
      } catch {
        // Ignore draft persistence errors.
      }
    };
    persistDraft();
  }, [
    orgId,
    draftRestored,
    activeClient,
    selectedTripIds,
    clientSearch,
    searchQuery,
    startDate,
    endDate,
    step,
  ]);

  const isTripInvoiceable = useCallback(
    (trip: InvoicingTripView) => {
      const resolved = workflowForInvoiceTrip(trip, clientPolicies);
      return resolved.state?.invoiceable === true;
    },
    [clientPolicies],
  );

  const tripInvoiceBlockedHint = useCallback(
    (trip: InvoicingTripView) => {
      const resolved = workflowForInvoiceTrip(trip, clientPolicies);
      if (resolved.error) return resolved.error;
      if (resolved.state?.invoiceState === "issued") {
        return trip.issuedInvoiceNumber
          ? `Already on invoice ${trip.issuedInvoiceNumber}.`
          : "This trip is already allocated to an issued invoice.";
      }
      if (resolved.state?.invoiceState === "draft") {
        return trip.draftInvoiceNumber
          ? `Reserved on draft ${trip.draftInvoiceNumber}. Resume or cancel that draft to invoice elsewhere.`
          : "This trip is reserved on a draft invoice.";
      }
      if (resolved.state?.invoiceState === "not_completed") {
        return "Only completed trips can be invoiced.";
      }
      if (resolved.state?.invoiceState === "blocked_policy") {
        return resolved.error ?? "This client has no invoicing POD policy.";
      }
      return (
        (resolved.policy
          ? invoiceTripPodHint(
              resolved.policy,
              tripPodEvidence(trip),
              resolved.source,
            )
          : null) ?? "This trip cannot be selected for invoicing."
      );
    },
    [clientPolicies],
  );

  const selectedInvoiceIssueBlockedReason = useMemo(() => {
    const invoiceableSelected = selectedTrips.filter(
      (trip) => invoiceWorkspaceTripFlags(trip, clientPolicies).invoiceable,
    );
    const identityError = invoiceSelectionClientIdentityError(invoiceableSelected);
    if (identityError) return identityError;
    if (invoiceableSelected.length === 0) return null;
    const resolved = resolveTripInvoicePodPolicy(
      invoiceableSelected[0],
      clientPolicies,
    );
    if ("error" in resolved) return resolved.error;
    return invoiceIssuePodPolicyReason(
      resolved.policy,
      invoiceableSelected.map(tripPodEvidence),
      resolved.source,
    );
  }, [clientPolicies, selectedTrips]);

  const handleToggleTrip = useCallback((id: string) => {
    const trip = tripsById.get(id);
    if (!trip) {
      return;
    }
    setSelectedTripIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (!invoiceWorkspaceTripFlags(trip, clientPolicies).selectable) {
        return prev;
      }
      return [...prev, id];
    });
  }, [clientPolicies, tripsById]);

  const handleSelectAll = useCallback(() => {
    if (selectableTrips.length === 0) {
      return;
    }

    const allSelectableSelected = selectableTrips.every((t) =>
      selectedTripIds.includes(t.id),
    );

    if (allSelectableSelected) {
      const ids = selectableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      const ids = selectableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }, [selectableTrips, selectedTripIds]);

  const handleCreateInvoice = useCallback(async (opts?: {
    stayOnWorkspace?: boolean;
  }) => {
    if (buildBlockedReason) {
      Alert.alert("Create Invoice", buildBlockedReason);
      return;
    }
    if (!activeClient) {
      Alert.alert("Create Invoice", "Select a client first.");
      return;
    }
    const tripIds = selectedTripIds.filter((id) => {
      const trip = tripsById.get(id);
      return (
        trip != null &&
        invoiceWorkspaceTripFlags(trip, clientPolicies).invoiceable
      );
    });
    if (tripIds.length === 0) {
      Alert.alert(
        "Create Invoice",
        "Select one or more eligible trips first.",
      );
      return;
    }

    const clientId =
      activeClient.startsWith("name:") ? null : activeClient;
    if (orgId && clientId) {
      const selected = tripIds
        .map((id) => tripsById.get(id))
        .filter(Boolean) as InvoicingTripView[];
      const internalIds = selected
        .map((trip) => trip.internal_id)
        .filter((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
        );
      const freight = selected.reduce(
        (sum, trip) => sum + (Number(trip.amount) || 0),
        0,
      );
      if (internalIds.length > 0) {
        const saved = await saveInvoiceDraft({
          orgId,
          clientId,
          clientName: activeClientLabel,
          tripIds: internalIds,
          subtotal: freight,
          gstRate: 0,
          sgstAmount: 0,
          cgstAmount: 0,
          igstAmount: 0,
          totalAmount: freight,
          createdBy: user?.uid ?? profile?.uid ?? null,
        });
        if (saved.error) {
          Alert.alert("Create draft", saved.error.message);
          return;
        }
        setActiveDraftId(saved.draftId ?? null);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.invoicing.drafts(orgId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.invoicing.trips(orgId),
        });
      }
    }

    const payload = {
      activeClient,
      selectedTripIds: tripIds,
      clientSearch,
      searchQuery,
      startDate,
      endDate,
      step,
      savedAt: new Date().toISOString(),
    };
    if (orgId) {
      try {
        await AsyncStorage.setItem(
          `invoicing_execute_draft_${orgId}`,
          JSON.stringify(payload),
        );
        setDraftSavedAt(payload.savedAt);
      } catch {
        // Still navigate — create page can use query params.
      }
    }
    const qs = new URLSearchParams();
    qs.set("trips", tripIds.join(","));
    if (activeClient) qs.set("client", activeClient);
    if (activeDraftId) qs.set("draft", activeDraftId);
    if (opts?.stayOnWorkspace) {
      return;
    }
    router.push(
      `${ROUTES.INVOICING_EXECUTE_CREATE}?${qs.toString()}` as never,
    );
  }, [
    activeClient,
    buildBlockedReason,
    clientPolicies,
    clientSearch,
    clientTrips,
    endDate,
    orgId,
    podRequired,
    profile?.uid,
    queryClient,
    router,
    searchQuery,
    selectedTripIds,
    startDate,
    step,
    tripsById,
    user?.uid,
    activeClientLabel,
    activeDraftId,
  ]);

  const selectClient = (clientKey: string) => {
    setActiveClient(clientKey);
    setSelectedTripIds([]);
    setInspectedIssuedInvoice(null);
    setStep(1);
  };

  const handlePreview = useCallback(
    (params: Record<string, string>) => {
      if (invoiceBuildBlockedReason(podRequired)) return;
      router.push({
        pathname: "/invoicing/pdf-preview",
        params: {
          ...params,
          requirePod: podRequired ? "true" : "false",
        },
      });
    },
    [router, podRequired],
  );

  const handleIssueInvoice = useCallback(
    (args: { internalIds: string[]; payload: InvoicePayload }) => {
      if (issueInFlight.current || issueMutation.isPending) return;
      if (invoiceBuildBlockedReason(podRequired)) return;
      const pendingReason = selectedInvoiceIssueBlockedReason;
      if (pendingReason) {
        Alert.alert("POD required", pendingReason);
        return;
      }
      const internalIds = args.internalIds.filter(Boolean);
      if (internalIds.length === 0) return;
      issueInFlight.current = true;
      if (!issueIdempotencyRef.current) {
        issueIdempotencyRef.current = issueIdempotencyKey();
      }
      issueMutation.mutate(
        {
          internalIds,
          payload: {
            ...args.payload,
            createdBy: user?.uid ?? profile?.uid ?? null,
            draftId: activeDraftId ?? undefined,
            idempotencyKey: issueIdempotencyRef.current,
          },
        },
        {
          onSuccess: (result) => {
            const invoiceNumber = result.invoiceNumber ?? "";
            setIssuedReceipt({
              invoiceNumber,
              tripCount: internalIds.length,
              totalAmount: Number(args.payload.calculations?.totalAmount ?? 0),
            });
            Alert.alert(
              "Invoice issued",
              invoiceNumber
                ? `Invoice ${invoiceNumber} was issued for ${internalIds.length} trip${internalIds.length === 1 ? "" : "s"}.`
                : "Invoice issued. No trips were left in a partial state.",
            );
            setSelectedTripIds([]);
            setActiveDraftId(null);
            issueIdempotencyRef.current = null;
            setInvoiceSurface("issued");
            if (tripScopeId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.invoicing.trips(tripScopeId),
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.invoicing.drafts(tripScopeId),
              });
            }
            if (mode === "create") {
              router.replace(ROUTES.INVOICING_EXECUTE as never);
            }
          },
          onError: (err) => {
            const message =
              err instanceof Error ? err.message : "Could not issue invoice.";
            Alert.alert("Could not issue invoice", message);
          },
          onSettled: () => {
            issueInFlight.current = false;
          },
        },
      );
    },
    [
      activeDraftId,
      issueMutation,
      mode,
      podRequired,
      selectedInvoiceIssueBlockedReason,
      profile?.uid,
      queryClient,
      router,
      tripScopeId,
      user?.uid,
    ],
  );

  const exportTripsToCsv = useCallback(
    (trips: InvoicingTripView[], kind: "selected" | "filtered") => {
      if (!trips.length) {
        Alert.alert("Export", "No trips to export.");
        return;
      }
      const rows = trips.map((t) => ({
        trip_id: t?.id ?? "",
        internal_id: t?.internal_id ?? "",
        client: t?.client ?? "",
        date: t?.date ?? "",
        supplier: t?.supplier_name ?? "",
        route: t?.route ?? "",
        amount_inr: t?.amount ?? 0,
        status: t?.status ?? "",
      }));
      const headers = Object.keys(rows[0] || {});
      const csv = [
        headers.join(","),
        ...rows.map((r) =>
          headers
            .map((h) => {
              const value = String((r as Record<string, unknown>)[h] ?? "");
              return `"${value.replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ].join("\n");

      const slug = (activeClient || "export").replace(/[^\w\-]+/g, "_").slice(0, 48);
      const filename = `invoicing_${kind}_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      Alert.alert("Export", "CSV export is available on web.");
    },
    [activeClient],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedTripIds([]);
  }, []);

  const handleExportFiltered = useCallback(() => {
    exportTripsToCsv(clientTrips, "filtered");
  }, [clientTrips, exportTripsToCsv]);

  const handleResetInvoiceDraft = useCallback(async () => {
    setSelectedTripIds([]);
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setClientSearch("");
    setActiveClient(null);
    setStep(0);
    setDraftSavedAt(null);
    if (orgId) {
      await AsyncStorage.removeItem(`invoicing_execute_draft_${orgId}`);
    }
  }, [orgId]);

  const bulkDisabledMessage = !activeClient
    ? "Select a client first."
    : clientTrips.length === 0
      ? "No trips in the current view."
      : null;

  const resumeDraft = useCallback(
    (draft: (typeof draftInvoices)[number], stayOnWorkspace: boolean) => {
      setActiveDraftId(draft.id);
      setInspectedIssuedInvoice(null);
      if (draft.client_id) setActiveClient(draft.client_id);
      const source = invoiceSourceLabel(draft.invoice_source);
      if (source === "Manual") {
        const parsed = parseSavedInvoiceLines(draft.line_items);
        setComposeMode("manual");
        setManualDraftId(draft.id);
        if (parsed.length > 0) {
          setManualLines(manualLinesFromSavedItems(parsed));
          setManualBuiltLines(parsed);
        }
        setInvoiceSurface("pending");
        if (stayOnWorkspace) {
          router.setParams({
            draft: draft.id,
            client: draft.client_id ?? "",
            compose: "manual",
          });
          return;
        }
        router.push(
          `${ROUTES.INVOICING_MANUAL}?draft=${encodeURIComponent(draft.id)}` as never,
        );
        return;
      }
      setComposeMode("trips");
      const displayIds = (draft.trip_ids ?? [])
        .map((id) => {
          const hit = scopedTrips.find(
            (trip) => trip.internal_id === id || trip.id === id,
          );
          return hit?.id;
        })
        .filter((id): id is string => Boolean(id));
      if (displayIds.length > 0) setSelectedTripIds(displayIds);
      setInvoiceSurface("pending");
      const qs = new URLSearchParams();
      qs.set("trips", (draft.trip_ids ?? []).join(","));
      if (draft.client_id) qs.set("client", draft.client_id);
      qs.set("draft", draft.id);
      if (stayOnWorkspace) {
        router.setParams({
          draft: draft.id,
          client: draft.client_id ?? "",
          trips: (draft.trip_ids ?? []).join(","),
        });
        return;
      }
      router.push(
        `${ROUTES.INVOICING_EXECUTE_CREATE}?${qs.toString()}` as never,
      );
    },
    [router, scopedTrips],
  );

  const cancelDraft = useCallback(
    (draft: (typeof draftInvoices)[number]) => {
      if (!orgId) return;
      Alert.alert(
        "Cancel draft",
        "This releases reserved trips. The draft is cancelled, not deleted.",
        [
          { text: "Keep draft", style: "cancel" },
          {
            text: "Cancel draft",
            style: "destructive",
            onPress: () => {
              void discardInvoiceDraft(orgId, draft.id).then((res) => {
                if (res.error) {
                  Alert.alert("Cancel draft", res.error.message);
                  return;
                }
                if (activeDraftId === draft.id) setActiveDraftId(null);
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.invoicing.drafts(orgId),
                });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.invoicing.trips(orgId),
                });
              });
            },
          },
        ],
      );
    },
    [activeDraftId, orgId, queryClient],
  );

  const resolveClientRecordId = useCallback((groupKey: string | null) => {
    if (!groupKey || groupKey.startsWith("name:")) return null;
    return groupKey;
  }, []);

  const openClientEditor = useCallback(
    (clientId: string | null) => {
      const id = resolveClientRecordId(clientId);
      if (!id) {
        Alert.alert(
          "Client details",
          "This partner is not linked to a client record, so details cannot be edited here.",
        );
        return;
      }
      setEditingClientId(id);
    },
    [resolveClientRecordId],
  );

  const closeClientProfile = useCallback(async () => {
    setEditingClientId(null);
    const orgForClient = workspaceId || orgId;
    if (!orgForClient) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.clients.all(orgForClient),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoicing.draftClientsRoot,
      }),
      tripScopeId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.invoicing.trips(tripScopeId),
          })
        : Promise.resolve(),
    ]);
  }, [orgId, queryClient, tripScopeId, workspaceId]);

  if (!allowed) {
    return (
      <View
        style={[
          styles.blocked,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>
          Your account does not have access to execute invoices.
        </Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || !orgId)
    return (
      <CenteredLoadingView
        message={orgLoading ? "Loading..." : "No organization"}
      />
    );
  if (isLoading)
    return <CenteredLoadingView message="Syncing with Supabase..." />;
  if (isError) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Could not load data</Text>
        <Text style={styles.blockedBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
        <Pressable style={styles.blockedBtn} onPress={() => refetch()}>
          <Text style={styles.blockedBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const renderPartnerList = () => (
    <FlatList
      data={clientStats}
      keyExtractor={(item) => item.key}
      {...tabBarScrollProps}
      contentContainerStyle={{
        paddingBottom: isLargeScreen ? 0 : mobileBottomPad,
      }}
      ListEmptyComponent={null}
      renderItem={({ item: client }) => (
        <Pressable
          style={[
            styles.clientRow,
            activeClient === client.key && styles.clientRowActive,
          ]}
          onPress={() => selectClient(client.key)}
        >
          {activeClient === client.key && (
            <View style={styles.clientRowIndicator} />
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.clientRowTop}>
              <Text
                style={[
                  styles.clientName,
                  activeClient === client.key && { color: Theme.primary },
                ]}
              >
                {client.name}
              </Text>
              {client.picture.eligibleTripCount > 0 ? (
                <Text style={styles.tagApproved}>Ready</Text>
              ) : client.picture.podPendingTripCount > 0 ? (
                <Text style={styles.tagPending}>POD pending</Text>
              ) : client.picture.invoicedTripCount > 0 ? (
                <Text style={styles.tagSettled}>Invoiced</Text>
              ) : (
                <Text style={styles.tagReceived}>Listed</Text>
              )}
            </View>
            <View style={styles.clientRowBottom}>
              <View style={styles.clientBilled}>
                <View style={styles.dot} />
                <Text style={styles.clientBilledText}>
                  Last Billed: Today
                </Text>
              </View>
              <View style={styles.partnerRowActions}>
                <Pressable
                  style={styles.partnerEditBtn}
                  onPress={() => {
                    selectClient(client.key);
                    void openClientEditor(client.key);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${client.name}`}
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <FontAwesome
                    name="pencil"
                    size={12}
                    color={
                      activeClient === client.key
                        ? Theme.primary
                        : Theme.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.partnerEditBtnText,
                      activeClient === client.key && { color: Theme.primary },
                    ]}
                  >
                    Edit
                  </Text>
                </Pressable>
                <FontAwesome
                  name="chevron-right"
                  size={12}
                  color={
                    activeClient === client.key
                      ? Theme.primary
                      : Theme.textMuted
                  }
                />
              </View>
            </View>
          </View>
        </Pressable>
      )}
    />
  );

  const renderSidebar = () => (
    <>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>Clients</Text>
        <Text style={styles.sidebarBadge}>{clientStats.length}</Text>
      </View>
      <View style={styles.sidebarSearch}>
        <FontAwesome
          name="search"
          size={14}
          color={Theme.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.sidebarInput}
          placeholder="Search clients..."
          placeholderTextColor={Theme.textMuted}
          value={clientSearch}
          onChangeText={setClientSearch}
        />
      </View>
      {renderPartnerList()}
    </>
  );

  if (mode === "create") {
    return (
      <View
        style={[
          styles.root,
          styles.createPageRoot,
          !inProductShell && { paddingTop: insets.top },
        ]}
      >
        <View style={styles.createPageHeader}>
          <Pressable
            style={styles.createBackBtn}
            onPress={() => router.replace(ROUTES.INVOICING_EXECUTE as never)}
            accessibilityRole="button"
            accessibilityLabel="Back to pending billing"
            hitSlop={Layout.touchTargetHitSlop}
          >
            <FontAwesome
              name="arrow-left"
              size={14}
              color={Theme.textPrimaryDark}
            />
            <Text style={styles.createBackText}>Pending Billing</Text>
          </Pressable>
          <Text style={styles.createPageHint} numberOfLines={1}>
            {selectedTrips.length > 0
              ? `${selectedTrips.length} trip${selectedTrips.length === 1 ? "" : "s"} · ${activeClientLabel || "Partner"}`
              : "Select trips on Pending Billing first"}
          </Text>
        </View>
        {selectedTrips.length === 0 ? (
          <View style={styles.createEmpty}>
            <Text style={styles.createEmptyTitle}>No trips selected</Text>
            <Text style={styles.createEmptyBody}>
              Go back to Pending Billing, select eligible trips, then create the
              invoice.
            </Text>
            <Pressable
              style={styles.createEmptyBtn}
              onPress={() => router.replace(ROUTES.INVOICING_EXECUTE as never)}
              accessibilityRole="button"
              accessibilityLabel="Back to pending billing"
            >
              <Text style={styles.createEmptyBtnText}>Back to Pending Billing</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.createPageBody}>
            <InvoicePreviewPanel
              onPreview={handlePreview}
              onIssue={handleIssueInvoice}
              isFinalizing={false}
              isIssuing={issueMutation.isPending}
              activeClient={activeClientLabel}
              selectedTrips={selectedTrips}
              isStandalone={true}
              issuer={issuer}
              workspaceOrgId={workspaceId}
              onEditClient={(clientId) => void openClientEditor(clientId)}
              invoiceBuildBlockedReason={buildBlockedReason}
              invoiceIssueBlockedReason={selectedInvoiceIssueBlockedReason}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, !inProductShell && { paddingTop: insets.top }]}>
      {!inProductShell && !isLargeScreen ? (
      <View style={styles.financeHeader}>
        <View style={styles.financeHeaderInner}>
          <View style={[styles.heroRow, !isLargeScreen && styles.heroRowMobile]}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Revenue & Invoicing</Text>
              <Text style={styles.heroSub}>Execute invoices for confirmed trips</Text>
              {draftSavedAt ? (
                <Text style={styles.heroDraftMeta}>
                  Draft auto-saved:{" "}
                  {new Date(draftSavedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
            </View>

            {isLargeScreen ? (
              <View style={styles.kpiRowDesktop}>
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelRed}>POD Pending</Text>
                  <Text style={styles.kpiValue}>
                    {formatCurrencySimple(summaryData?.pod_pending_sum || 0)}
                  </Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelMuted}>Needs Action</Text>
                  <Text style={styles.kpiValueMuted}>
                    {formatCurrencySimple(summaryData?.received_sum || 0)}
                  </Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelGreen}>Ready</Text>
                  <Text style={styles.kpiValueGreen}>
                    {formatCurrencySimple(summaryData?.approved_sum || 0)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {!isLargeScreen ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.kpiScrollMobile}
              contentContainerStyle={styles.kpiRow}
            >
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelRed}>POD Pending</Text>
                <Text style={styles.kpiValue}>
                  {formatCurrencySimple(summaryData?.pod_pending_sum || 0)}
                </Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelMuted}>Needs Action</Text>
                <Text style={styles.kpiValueMuted}>
                  {formatCurrencySimple(summaryData?.received_sum || 0)}
                </Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelGreen}>Ready</Text>
                <Text style={styles.kpiValueGreen}>
                  {formatCurrencySimple(summaryData?.approved_sum || 0)}
                </Text>
              </View>
            </ScrollView>
          ) : null}

          {isLargeScreen ? (
            <View style={styles.invHeaderToolbar}>
              <View
                style={[
                  styles.invHeaderSearchWrap,
                  Platform.OS === "web" && styles.invHeaderSearchWrapWeb,
                ]}
              >
                <FontAwesome
                  name="search"
                  size={12}
                  color={Theme.textOnDarkMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[
                    styles.invHeaderSearchInput,
                    Platform.OS === "web" && styles.invHeaderSearchInputWeb,
                  ]}
                  placeholder="Search transactions..."
                  placeholderTextColor={Theme.textOnDarkMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={120}
                />
              </View>

              <View style={styles.invHeaderToolbarActions}>
                <View style={styles.invHeaderDateWrap}>
                  <FontAwesome
                    name="calendar"
                    size={12}
                    color={Theme.textOnDarkMuted}
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    style={styles.invHeaderDateInput}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={Theme.textOnDarkMuted}
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                  <Text style={styles.invHeaderDateTo}>TO</Text>
                  <TextInput
                    style={styles.invHeaderDateInput}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={Theme.textOnDarkMuted}
                    value={endDate}
                    onChangeText={setEndDate}
                  />
                  {startDate || endDate ? (
                    <Pressable
                      onPress={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                      style={{ marginLeft: 6 }}
                    >
                      <FontAwesome
                        name="times"
                        size={12}
                        color={Theme.textOnDarkMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
                {null}
              </View>
            </View>
          ) : null}
        </View>
      </View>
      ) : null}

      {isLargeScreen ? (
        <View style={financeInvoiceWorkspaceStyles.root}>
          <FinanceInvoiceAppBar showChrome={!inProductShell} />
          <View style={financeInvoiceWorkspaceStyles.columns}>
            <FinanceInvoiceClientRail
              rows={clientStats}
              activeKey={activeClient}
              search={clientSearch}
              onSearch={setClientSearch}
              onSelect={selectClient}
            />
            <View style={financeInvoiceWorkspaceStyles.main}>
              <FinanceInvoiceClientHeader
                clientName={activeClientLabel}
                policyLabel={activePolicyLabel}
                picture={clientPicture}
                showHardCopyToggle={showHardCopyToggle}
                hardCopyOn={activeClientPolicy === "hard_copy"}
                onSetHardCopyRequired={(next) => {
                  void persistClientPodRequired(next);
                }}
                onManualInvoice={
                  selectedClientId
                    ? () => {
                        setComposeMode("manual");
                        setInvoiceSurface("pending");
                      }
                    : undefined
                }
              />
              <FinanceInvoiceWorkspaceTabs
                value={invoiceSurface}
                onChange={(next) => {
                  setInvoiceSurface(next);
                  if (next !== "pending") setComposeMode("trips");
                  if (next !== "issued") setInspectedIssuedInvoice(null);
                }}
              />
              {invoiceSurface === "drafts" ? (
                <InvoiceDraftsPanel
                  drafts={draftInvoices}
                  partnerClientId={
                    activeClient && !activeClient.startsWith("name:")
                      ? activeClient
                      : null
                  }
                  partnerLabel={activeClientLabel}
                  onResume={(draft) => resumeDraft(draft, true)}
                  onCancel={cancelDraft}
                />
              ) : invoiceSurface === "issued" ? (
                <View style={{ flex: 1 }}>
                  {issuedReceipt ? (
                    <View style={styles.issueReceipt}>
                      <Text style={styles.issueReceiptTitle}>
                        Invoice {issuedReceipt.invoiceNumber} issued successfully
                      </Text>
                      <Text style={styles.issueReceiptBody}>
                        {issuedReceipt.tripCount} trip
                        {issuedReceipt.tripCount === 1 ? "" : "s"} invoiced
                        {issuedReceipt.totalAmount > 0
                          ? ` · ₹${issuedReceipt.totalAmount.toLocaleString("en-IN")}`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                  <IssuedInvoicesPanel
                    invoices={issuedInvoices}
                    podRequired={podRequired}
                    refreshing={issuedRefetching}
                    onRefresh={() => {
                      void refetchIssued();
                    }}
                    partnerClientId={
                      activeClient && !activeClient.startsWith("name:")
                        ? activeClient
                        : null
                    }
                    partnerLabel={activeClientLabel}
                    selectedId={inspectedIssuedInvoice?.id ?? null}
                    onSelect={(invoice) => {
                      setInspectedIssuedInvoice(invoice);
                      setComposeMode("trips");
                      if (invoice.client_id) setActiveClient(invoice.client_id);
                    }}
                  />
                </View>
              ) : invoiceSurface === "details" ? (
                <View style={{ padding: 16, gap: 10 }}>
                  <Text style={styles.listHeaderRule}>
                    Client master data, GSTIN, and billing address stay on the
                    client record. They are not re-entered here.
                  </Text>
                  <Pressable
                    style={styles.partnerEditBtn}
                    onPress={() => void openClientEditor(activeClient)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit client details"
                  >
                    <Text style={styles.partnerEditBtnText}>Edit client</Text>
                  </Pressable>
                </View>
              ) : composeMode === "manual" ? (
                <FinanceManualInvoicePanel
                  clientName={activeClientLabel || "Client"}
                  invoiceDate={manualInvoiceDate}
                  dueDate={manualDueDate}
                  poReference={manualPo}
                  paymentTerms={manualTerms}
                  placeOfSupply={manualClientRow?.state ?? ""}
                  lines={manualLines}
                  onInvoiceDate={setManualInvoiceDate}
                  onDueDate={setManualDueDate}
                  onPoReference={setManualPo}
                  onPaymentTerms={setManualTerms}
                  onLines={setManualLines}
                  onLinesBuilt={setManualBuiltLines}
                />
              ) : (
                <TripListContent
                  tabBarScrollProps={tabBarScrollProps}
                  isDesktopTripTable
                  compact
                  clientTrips={clientTrips}
                  activeClient={activeClientLabel}
                  selectedTripIds={selectedTripIds}
                  allSelected={allClientTripsSelected}
                  onSelectAll={handleSelectAll}
                  onToggleTrip={(id) => {
                    setInspectedIssuedInvoice(null);
                    handleToggleTrip(id);
                  }}
                  onClearSelection={handleClearSelection}
                  onResetInvoiceDraft={handleResetInvoiceDraft}
                  onExportFiltered={handleExportFiltered}
                  bulkDisabledMessage={bulkDisabledMessage}
                  isTripInvoiceable={isTripInvoiceable}
                  invoiceStateLabel={(trip) =>
                    invoiceWorkspaceTripFlags(trip, clientPolicies).pill
                  }
                  isTripSelectable={(trip) =>
                    invoiceWorkspaceTripFlags(trip, clientPolicies).selectable
                  }
                  isTripPodLoggable={(trip) =>
                    invoiceWorkspaceTripFlags(trip, clientPolicies).loggable
                  }
                  onLogPod={openLogPod}
                  podLoggableSelectedCount={selectionSummary.podLoggableCount}
                  invoiceableSelectedCount={selectionSummary.invoiceableCount}
                  selectedBlockedCount={
                    selectionSummary.selectedCount -
                    selectionSummary.invoiceableCount
                  }
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  startDate={startDate}
                  setStartDate={setStartDate}
                  endDate={endDate}
                  setEndDate={setEndDate}
                  isRefetching={isRefetching}
                  refetch={refetch}
                  mobileBottomPad={0}
                  podRequired={podRequired}
                  tripInvoiceBlockedHint={tripInvoiceBlockedHint}
                  completionFilter={completionFilter}
                  onCompletionFilterChange={setCompletionFilter}
                  completedTripCount={
                    clientPicture?.completedTripCount ??
                    completionCounts.completed
                  }
                  notCompletedTripCount={completionCounts.notCompleted}
                  onCreateInvoice={() => {
                    void handleCreateInvoice({ stayOnWorkspace: true });
                  }}
                  createBlockedReason={
                    selectionSummary.invoiceableCount === 0
                      ? "Select one or more eligible trips"
                      : buildBlockedReason
                  }
                />
              )}
            </View>
            <View
              style={financeInvoiceWorkspaceStyles.previewCol}
              accessibilityLabel="Invoice preview"
            >
              {composeMode === "manual" && selectedClientId ? (
                <InvoicePreviewPanel
                  onPreview={handlePreview}
                  isFinalizing={false}
                  isIssuing={manualBusy === "issue"}
                  activeClient={activeClientLabel}
                  selectedTrips={[]}
                  isStandalone
                  density="compact"
                  issuer={issuer}
                  workspaceOrgId={workspaceId}
                  invoiceBuildBlockedReason={
                    invoiceHsnIssueBlock(manualBuiltLines)
                  }
                  invoiceIssueBlockedReason={invoiceHsnIssueBlock(manualBuiltLines)}
                  onSaveDraft={() => {
                    void persistManualInvoice("draft");
                  }}
                  saveDraftLabel={manualDraftId ? "Save Changes" : "Save as Draft"}
                  externalDraft={manualDraftModel}
                  onIssueExternal={() => {
                    void persistManualInvoice("issue");
                  }}
                />
              ) : issuedPreviewDraft ? (
                <InvoicePreviewPanel
                  onPreview={handlePreview}
                  isFinalizing={false}
                  isIssuing={false}
                  activeClient={activeClientLabel}
                  selectedTrips={previewTrips}
                  isStandalone
                  density="compact"
                  issuer={issuer}
                  workspaceOrgId={workspaceId}
                  externalDraft={issuedPreviewDraft}
                  readOnly
                  invoiceIssueBlockedReason="This invoice is already issued."
                />
              ) : previewTrips.length === 0 ? (
                <View style={{ flex: 1 }}>
                  <FinanceInvoicePreviewEmpty
                    selectedCount={selectionSummary.selectedCount}
                    invoiceableCount={selectionSummary.invoiceableCount}
                    exclusionNote={invoicePreviewExclusionNote({
                      selectedCount: selectionSummary.selectedCount,
                      invoiceableCount: selectionSummary.invoiceableCount,
                    })}
                  />
                  {selectionSummary.selectedCount > 0 ? (
                    <Text
                      style={{
                        paddingHorizontal: 16,
                        paddingBottom: 16,
                        fontSize: 11,
                        color: Theme.textMuted,
                      }}
                    >
                      {selectionSummary.selectedCount -
                        selectionSummary.invoiceableCount}{" "}
                      selected trip
                      {selectionSummary.selectedCount -
                        selectionSummary.invoiceableCount ===
                      1
                        ? ""
                        : "s"}{" "}
                      cannot be invoiced.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <InvoicePreviewPanel
                  onPreview={handlePreview}
                  onIssue={handleIssueInvoice}
                  isFinalizing={false}
                  isIssuing={issueMutation.isPending}
                  activeClient={activeClientLabel}
                  selectedTrips={previewTrips}
                  isStandalone
                  density="compact"
                  issuer={issuer}
                  workspaceOrgId={workspaceId}
                  onEditClient={(clientId) => void openClientEditor(clientId)}
                  invoiceBuildBlockedReason={buildBlockedReason}
                  invoiceIssueBlockedReason={
                    inspectedIssuedInvoice
                      ? "This invoice is already issued."
                      : selectedInvoiceIssueBlockedReason
                  }
                  onSaveDraft={
                    inspectedIssuedInvoice
                      ? undefined
                      : () => {
                          void handleCreateInvoice({ stayOnWorkspace: true });
                        }
                  }
                  saveDraftLabel={
                    activeDraftId ? "Save Changes" : "Save as Draft"
                  }
                  readOnly={Boolean(inspectedIssuedInvoice)}
                />
              )}
            </View>
          </View>
        </View>
      ) : (
      <View style={styles.contentArea}>
        <View style={styles.billingChrome}>
          <InvoiceBillingSurfaceTabs
            value={invoiceSurface}
            onChange={setInvoiceSurface}
          />
          {null}
        </View>
        {invoiceSurface === "drafts" ? (
          <InvoiceDraftsPanel
            drafts={draftInvoices}
            partnerClientId={
              activeClient && !activeClient.startsWith("name:")
                ? activeClient
                : null
            }
            partnerLabel={activeClientLabel}
            onResume={(draft) => resumeDraft(draft, false)}
            onCancel={cancelDraft}
          />
        ) : invoiceSurface === "issued" ? (
          <View style={{ flex: 1 }}>
            {issuedReceipt ? (
              <View style={styles.issueReceipt}>
                <Text style={styles.issueReceiptTitle}>
                  Invoice {issuedReceipt.invoiceNumber} issued successfully
                </Text>
                <Text style={styles.issueReceiptBody}>
                  {issuedReceipt.tripCount} trip
                  {issuedReceipt.tripCount === 1 ? "" : "s"} invoiced
                  {issuedReceipt.totalAmount > 0
                    ? ` · ₹${issuedReceipt.totalAmount.toLocaleString("en-IN")}`
                    : ""}
                </Text>
              </View>
            ) : null}
            <IssuedInvoicesPanel
              invoices={issuedInvoices}
              podRequired={podRequired}
              refreshing={issuedRefetching}
              onRefresh={() => {
                void refetchIssued();
              }}
              partnerClientId={
                activeClient && !activeClient.startsWith("name:")
                  ? activeClient
                  : null
              }
              partnerLabel={activeClientLabel}
            />
          </View>
        ) : invoiceSurface === "details" ? (
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={styles.listHeaderRule}>
              Client master data, GSTIN, and billing address stay on the client
              record.
            </Text>
            <Pressable
              style={styles.partnerEditBtn}
              onPress={() => void openClientEditor(activeClient)}
              accessibilityRole="button"
              accessibilityLabel="Edit client details"
            >
              <Text style={styles.partnerEditBtnText}>Edit client</Text>
            </Pressable>
          </View>
        ) : isLargeScreen ? (
          <View style={styles.splitLayout}>
            <View style={styles.sidebar}>{renderSidebar()}</View>
            <View
              style={[
                styles.mainArea,
                {
                  borderRightWidth: 1,
                  borderRightColor: Theme.borderLight,
                },
              ]}
            >
              <TripListContent
                tabBarScrollProps={tabBarScrollProps}
                isDesktopTripTable={isLargeScreen}
                clientTrips={clientTrips}
                activeClient={activeClientLabel}
                selectedTripIds={selectedTripIds}
                allSelected={allClientTripsSelected}
                onSelectAll={handleSelectAll}
                onToggleTrip={handleToggleTrip}
                onClearSelection={handleClearSelection}
                onResetInvoiceDraft={handleResetInvoiceDraft}
                onExportFiltered={handleExportFiltered}
                bulkDisabledMessage={bulkDisabledMessage}
                isTripInvoiceable={isTripInvoiceable}
                isTripSelectable={(trip) =>
                  invoiceWorkspaceTripFlags(trip, clientPolicies).selectable
                }
                isTripPodLoggable={(trip) =>
                  invoiceWorkspaceTripFlags(trip, clientPolicies).loggable
                }
                onLogPod={openLogPod}
                podLoggableSelectedCount={selectionSummary.podLoggableCount}
                invoiceableSelectedCount={selectionSummary.invoiceableCount}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                isRefetching={isRefetching}
                refetch={refetch}
                mobileBottomPad={mobileBottomPad}
                podRequired={podRequired}
                tripInvoiceBlockedHint={tripInvoiceBlockedHint}
                completionFilter={completionFilter}
                onCompletionFilterChange={setCompletionFilter}
                completedTripCount={completionCounts.completed}
                notCompletedTripCount={completionCounts.notCompleted}
                onCreateInvoice={handleCreateInvoice}
                createBlockedReason={
                  selectionSummary.invoiceableCount === 0
                    ? "Select one or more eligible trips"
                    : buildBlockedReason
                }
              />
            </View>
            {isLargeScreen && (
              <View style={styles.rightPanel}>
                <PendingBillingInsightPanel
                  partnerLabel={activeClientLabel}
                  partnerClientId={
                    activeClient && !activeClient.startsWith("name:")
                      ? activeClient
                      : null
                  }
                  tripCount={clientTripsBase.length}
                  unbilledTripCount={clientWorkflowCounts.unbilled}
                  invoicedTripCount={clientWorkflowCounts.invoiced}
                  eligibleCount={invoiceableTrips.length}
                  selectedCount={selectedTripIds.length}
                  selectedFreight={selectedTrips.reduce(
                    (sum, trip) => sum + (Number(trip.amount) || 0),
                    0,
                  )}
                  pendingFreight={clientTripsBase.reduce(
                    (sum, trip) => sum + (Number(trip.amount) || 0),
                    0,
                  )}
                  completedTripCount={
                    clientPicture?.completedTripCount ?? completionCounts.completed
                  }
                  notCompletedTripCount={completionCounts.notCompleted}
                  podPendingTripCount={clientWorkflowCounts.podPending}
                  draftTripCount={clientWorkflowCounts.draft}
                  podRequired={podRequired}
                  blockedReason={buildBlockedReason}
                  invoices={issuedInvoices}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {step === 0 && (
              <View style={styles.mobileStepContainer}>
                <Text
                  style={[styles.sectionLabel, styles.mobilePartnerSectionLabel]}
                >
                  Select Strategic Partner
                </Text>
                <View style={styles.invMobilePartnerToolbar}>
                  <View
                    style={[
                      styles.invMobilePartnerSearchWrap,
                      Platform.OS === "web" &&
                        styles.invMobilePartnerSearchWrapWeb,
                    ]}
                  >
                    <FontAwesome
                      name="search"
                      size={12}
                      color={Theme.textMuted}
                      style={{ marginRight: 8 }}
                    />
                    <TextInput
                      style={styles.invMobilePartnerSearchInput}
                      placeholder="Search clients..."
                      placeholderTextColor={Theme.textMuted}
                      value={clientSearch}
                      onChangeText={setClientSearch}
                    />
                  </View>
                  <View style={styles.invMobilePartnerBadge}>
                    <Text style={styles.sidebarBadge}>
                      {clientStats.length} Online
                    </Text>
                  </View>
                </View>
                {null}
                {renderPartnerList()}
              </View>
            )}

            {step === 1 && (
              <View style={styles.mobileStepContainer}>
                <View style={styles.mobileConfig}>
                  <Text style={styles.sectionLabel}>Strategic Partner</Text>
                  <Pressable
                    style={styles.selectRow}
                    onPress={() => setStep(0)}
                  >
                    <Text style={styles.selectRowText} numberOfLines={1}>
                      {activeClientLabel || "Select a client..."}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: Theme.primary,
                        fontWeight: "700",
                      }}
                    >
                      Change
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.mobileGridArea}>
                  <TripListContent
                    tabBarScrollProps={tabBarScrollProps}
                    isDesktopTripTable={isLargeScreen}
                    clientTrips={clientTrips}
                    activeClient={activeClientLabel}
                    selectedTripIds={selectedTripIds}
                    allSelected={allClientTripsSelected}
                    onSelectAll={handleSelectAll}
                    onToggleTrip={handleToggleTrip}
                    onClearSelection={handleClearSelection}
                    onResetInvoiceDraft={handleResetInvoiceDraft}
                    onExportFiltered={handleExportFiltered}
                    bulkDisabledMessage={bulkDisabledMessage}
                    isTripInvoiceable={isTripInvoiceable}
                    isTripSelectable={(trip) =>
                      invoiceWorkspaceTripFlags(trip, clientPolicies).selectable
                    }
                    isTripPodLoggable={(trip) =>
                      invoiceWorkspaceTripFlags(trip, clientPolicies).loggable
                    }
                    onLogPod={openLogPod}
                    podLoggableSelectedCount={selectionSummary.podLoggableCount}
                    invoiceableSelectedCount={selectionSummary.invoiceableCount}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    startDate={startDate}
                    setStartDate={setStartDate}
                    endDate={endDate}
                    setEndDate={setEndDate}
                    isRefetching={isRefetching}
                    refetch={refetch}
                    mobileBottomPad={mobileBottomPad}
                    podRequired={podRequired}
                    tripInvoiceBlockedHint={tripInvoiceBlockedHint}
                    completionFilter={completionFilter}
                    onCompletionFilterChange={setCompletionFilter}
                    completedTripCount={completionCounts.completed}
                    notCompletedTripCount={completionCounts.notCompleted}
                    onCreateInvoice={handleCreateInvoice}
                    createBlockedReason={
                      selectionSummary.invoiceableCount === 0
                        ? "Select one or more eligible trips"
                        : buildBlockedReason
                    }
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>
      )}

      {!isLargeScreen && invoiceSurface === "pending" && step === 1 && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: layout.scrollBottomPadding(8),
            },
          ]}
        >
          {buildBlockedReason ? (
            <Text style={styles.buildGateReason}>{buildBlockedReason}</Text>
          ) : null}
          <Pressable
            style={[
              styles.footerBtn,
              (selectionSummary.invoiceableCount === 0 ||
                Boolean(buildBlockedReason)) &&
                styles.footerBtnDisabled,
            ]}
            onPress={handleCreateInvoice}
            disabled={
              selectionSummary.invoiceableCount === 0 ||
              Boolean(buildBlockedReason)
            }
            accessibilityLabel={
              buildBlockedReason
                ? buildBlockedReason
                : financeCreateInvoiceLabel(selectionSummary.invoiceableCount)
            }
          >
            <Text style={styles.footerBtnText}>
              {financeCreateInvoiceLabel(selectionSummary.invoiceableCount)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, { marginTop: 8, backgroundColor: Theme.surface }]}
            onPress={() => {
              if (!selectedClientId) {
                Alert.alert("Manual Invoice", "Select a client first.");
                return;
              }
              setComposeMode("manual");
              setInvoiceSurface("pending");
            }}
            accessibilityLabel="Create Manual Invoice"
          >
            <Text style={[styles.footerBtnText, { color: Theme.textPrimary }]}>
              Create Manual Invoice
            </Text>
          </Pressable>
        </View>
      )}
      <Modal
        visible={Boolean(editingClientId)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          void closeClientProfile();
        }}
      >
        {editingClientId ? (
          <ClientProfileScreen
            clientId={editingClientId}
            onBack={() => {
              void closeClientProfile();
            }}
          />
        ) : null}
      </Modal>
      <LogIncomingPodsModal
        visible={Boolean(logPodTripIds?.length)}
        preselectedTripIds={logPodTripIds ?? []}
        expectedClientId={
          activeClient && !activeClient.startsWith("name:") ? activeClient : null
        }
        seedTrips={logPodSeeds}
        onClose={() => setLogPodTripIds(null)}
      />
    </View>
  );
}

function InvoiceTripStatusTag({ trip }: { trip: InvoicingTripView }) {
  return (
    <TripCompletionStatusTag
      compact
      completed={tripIsDeliveredStatus(trip.tripStatus)}
    />
  );
}

function InvoiceTripPodChips({ trip }: { trip: InvoicingTripView }) {
  if (!tripIsDeliveredStatus(trip.tripStatus)) {
    return <Text style={{ fontSize: 11, fontWeight: "600", color: Theme.textMuted }}>—</Text>;
  }
  return (
    <TripPodStatusTags
      compact
      softCopyReceived={Boolean(trip.digitalPodPresent)}
      hardCopyReceived={Boolean(trip.physicalPodReceived)}
    />
  );
}

type TripListContentProps = {
  tabBarScrollProps: object;
  isDesktopTripTable: boolean;
  clientTrips: InvoicingTripView[];
  activeClient: string | null;
  selectedTripIds: string[];
  allSelected: boolean;
  onSelectAll: () => void;
  onToggleTrip: (id: string) => void;
  onClearSelection: () => void;
  onResetInvoiceDraft: () => void;
  onExportFiltered: () => void;
  bulkDisabledMessage: string | null;
  isTripInvoiceable: (trip: InvoicingTripView) => boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isRefetching: boolean;
  refetch: () => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  mobileBottomPad?: number;
  podRequired: boolean;
  tripInvoiceBlockedHint: (trip: InvoicingTripView) => string;
  completionFilter: TripCompletionListFilter;
  onCompletionFilterChange: (next: TripCompletionListFilter) => void;
  completedTripCount: number;
  notCompletedTripCount: number;
  onCreateInvoice?: () => void;
  createBlockedReason?: string | null;
  compact?: boolean;
  invoiceStateLabel?: (trip: InvoicingTripView) => string;
  isTripSelectable?: (trip: InvoicingTripView) => boolean;
  isTripPodLoggable?: (trip: InvoicingTripView) => boolean;
  onLogPod?: (trips: InvoicingTripView[]) => void;
  podLoggableSelectedCount?: number;
  invoiceableSelectedCount?: number;
  selectedBlockedCount?: number;
};

function TripListContent({
  tabBarScrollProps,
  isDesktopTripTable,
  clientTrips,
  activeClient,
  selectedTripIds,
  allSelected,
  onSelectAll,
  onToggleTrip,
  onClearSelection,
  onResetInvoiceDraft,
  onExportFiltered,
  bulkDisabledMessage,
  isTripInvoiceable,
  searchQuery,
  setSearchQuery,
  isRefetching,
  refetch,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  mobileBottomPad = 0,
  podRequired: _podRequired,
  tripInvoiceBlockedHint,
  completionFilter,
  onCompletionFilterChange,
  completedTripCount,
  notCompletedTripCount,
  onCreateInvoice,
  createBlockedReason = null,
  compact = false,
  invoiceStateLabel,
  isTripSelectable,
  isTripPodLoggable,
  onLogPod,
  podLoggableSelectedCount = 0,
  invoiceableSelectedCount = 0,
  selectedBlockedCount = 0,
}: TripListContentProps) {
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const runBulkAction = (action: () => void) => {
    setBulkMenuOpen(false);
    action();
  };

  const handleBulkPress = () => {
    if (bulkDisabledMessage) {
      Alert.alert("Bulk actions", bulkDisabledMessage);
      return;
    }
    setBulkMenuOpen((open) => !open);
  };

  const filterRow = (
    <>
      <View
        style={[
          styles.searchRow,
          !isDesktopTripTable && styles.searchRowMobileInline,
        ]}
      >
        <FontAwesome
          name="search"
          size={14}
          color={Theme.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search trips..."
          placeholderTextColor={Theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View
        style={[
          styles.dateFilterContainer,
          !isDesktopTripTable && styles.dateFilterMobileInline,
        ]}
      >
        <View style={styles.dateRow}>
          <FontAwesome
            name="calendar"
            size={12}
            color={Theme.textMuted}
            style={{ marginRight: 6 }}
          />
          <TextInput
            style={styles.dateInput}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={Theme.textMuted}
            value={startDate}
            onChangeText={setStartDate}
          />
          <Text style={styles.dateToText}>TO</Text>
          <TextInput
            style={styles.dateInput}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={Theme.textMuted}
            value={endDate}
            onChangeText={setEndDate}
          />
          {startDate || endDate ? (
            <Pressable
              onPress={() => {
                setStartDate("");
                setEndDate("");
              }}
              style={{ marginLeft: 4 }}
            >
              <FontAwesome name="times" size={12} color={Theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          styles.listHeader,
          !isDesktopTripTable && styles.listHeaderMobile,
        ]}
      >
        <View style={styles.listHeaderTextCol}>
          <Text
            style={[
              styles.listHeaderTitle,
              compact && styles.listHeaderTitleCompact,
            ]}
          >
            {compact ? "Trips" : "Ready-to-Invoice Trips"}
          </Text>
          <Text style={styles.listHeaderSub} numberOfLines={1}>
            {compact ? "Client: " : "Partner: "}
            <Text style={{ color: Theme.primary }}>
              {activeClient || "None Selected"}
            </Text>
            {selectedTripIds.length > 0
              ? ` · ${selectedTripIds.length} selected · ${invoiceableSelectedCount} eligible · ${podLoggableSelectedCount} POD loggable`
              : ""}
          </Text>
          {selectedBlockedCount > 0 ? (
            <Text style={styles.listHeaderRule}>
              {selectedBlockedCount} selected trip
              {selectedBlockedCount === 1 ? "" : "s"} cannot be invoiced.
            </Text>
          ) : null}
          {compact ? null : (
          <Text style={styles.listHeaderRule}>
            Eligibility follows this client&apos;s invoicing POD policy. All
            trips stay listed.
          </Text>
          )}
        </View>
        <View style={styles.listHeaderActions}>
          {onCreateInvoice ? (
            <PulsePillButton
              label={
                invoiceableSelectedCount > 0
                  ? `Create Invoice (${invoiceableSelectedCount})`
                  : "Create Invoice"
              }
              accessibilityLabel={
                createBlockedReason
                  ? createBlockedReason
                  : invoiceableSelectedCount > 0
                    ? `Create Invoice with ${invoiceableSelectedCount} trips`
                    : "Create Invoice"
              }
              size={isDesktopTripTable ? "default" : "compact"}
              showPlusIcon
              disabled={
                Boolean(createBlockedReason) || invoiceableSelectedCount === 0
              }
              onPress={onCreateInvoice}
              style={styles.createInvoiceBtn}
            />
          ) : null}
          {onLogPod && podLoggableSelectedCount > 0 ? (
            <Pressable
              style={styles.logPodBulkBtn}
              onPress={() =>
                onLogPod(
                  clientTrips.filter(
                    (trip) =>
                      selectedTripIds.includes(trip.id) &&
                      Boolean(isTripPodLoggable?.(trip)),
                  ),
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`Log POD (${podLoggableSelectedCount})`}
            >
              <Text style={styles.logPodBulkText}>
                Log POD ({podLoggableSelectedCount})
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.bulkActionWrap}>
          <Pressable
            style={[
              isDesktopTripTable
                ? styles.bulkActionBtn
                : styles.bulkActionBtnMobile,
              bulkMenuOpen && styles.bulkActionBtnOpen,
            ]}
            onPress={handleBulkPress}
            accessibilityRole="button"
            accessibilityLabel="Bulk actions"
          >
            {isDesktopTripTable ? (
              <>
                <Text style={styles.bulkActionText}>Bulk action</Text>
                <FontAwesome
                  name={bulkMenuOpen ? "chevron-up" : "chevron-down"}
                  size={10}
                  color={Theme.textOnDark}
                />
              </>
            ) : (
              <FontAwesome name="sliders" size={14} color={Theme.textOnDark} />
            )}
          </Pressable>
          {bulkMenuOpen && !bulkDisabledMessage ? (
            <>
              <Pressable
                style={styles.bulkMenuBackdrop}
                onPress={() => setBulkMenuOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close bulk actions"
              />
              <View style={styles.bulkMenu}>
                <Pressable
                  style={styles.bulkMenuItem}
                  onPress={() => runBulkAction(onSelectAll)}
                >
                  <Text style={styles.bulkMenuItemText}>Select all in view</Text>
                </Pressable>
                <Pressable
                  style={styles.bulkMenuItem}
                  onPress={() => runBulkAction(onClearSelection)}
                >
                  <Text style={styles.bulkMenuItemText}>Clear selection</Text>
                </Pressable>
                <Pressable
                  style={styles.bulkMenuItem}
                  onPress={() => runBulkAction(onExportFiltered)}
                >
                  <Text style={styles.bulkMenuItemText}>Export filtered list</Text>
                </Pressable>
                <Pressable
                  style={styles.bulkMenuItem}
                  onPress={() => runBulkAction(onResetInvoiceDraft)}
                >
                  <Text style={[styles.bulkMenuItemText, styles.bulkMenuItemDanger]}>
                    Reset invoice draft
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
        </View>
      </View>
      <View style={styles.completionFilterStrip}>
        <Text style={styles.completionFilterLabel}>Trip status</Text>
        <TripCompletionFilterBar
          value={completionFilter}
          onChange={onCompletionFilterChange}
          completedCount={completedTripCount}
          notCompletedCount={notCompletedTripCount}
        />
      </View>
      {!isDesktopTripTable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.listFiltersScrollMobile}
          contentContainerStyle={styles.listFiltersScrollMobileContent}
        >
          {filterRow}
        </ScrollView>
      ) : null}

      {isDesktopTripTable ? (
        <View style={styles.tableHeader}>
          <Pressable style={styles.selectAllGroup} onPress={onSelectAll}>
            <View style={styles.selectAllCheckbox}>
              {allSelected && (
                <FontAwesome name="check" size={10} color={Theme.primary} />
              )}
            </View>
          </Pressable>
          <Text style={[styles.tableHeaderText, { width: compact ? 88 : 100 }]}>
            {compact ? "Trip / Date" : "Date / ID"}
          </Text>
          <Text style={[styles.tableHeaderText, { width: compact ? 72 : 88 }]}>
            LR No
          </Text>
          <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>
            Supplier / Driver
          </Text>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Route</Text>
          <Text
            style={[styles.tableHeaderText, { width: 80, textAlign: "right" }]}
          >
            Freight
          </Text>
          {compact ? null : (
          <Text
            style={[styles.tableHeaderText, { width: 60, textAlign: "right" }]}
          >
            Extras
          </Text>
          )}
          <Text
            style={[styles.tableHeaderText, { width: compact ? 88 : 108, textAlign: "left" }]}
          >
            Invoice
          </Text>
          <Text
            style={[styles.tableHeaderText, { width: compact ? 88 : 120, textAlign: "left" }]}
          >
            POD
          </Text>
        </View>
      ) : null}

      <FlatList
        data={clientTrips}
        keyExtractor={(item) => item.id}
        {...tabBarScrollProps}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{
          padding: compact ? 8 : 16,
          paddingBottom: isDesktopTripTable
            ? compact
              ? 16
              : Layout.modalBottomPadding + 24
            : mobileBottomPad + 84,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontAwesome
              name="folder-open-o"
              size={40}
              color={Theme.borderMedium}
            />
            <>
              <Text style={styles.emptyTitle}>No Active Transactions</Text>
              <Text style={styles.emptySubTitle}>
                Select trips that meet this client&apos;s invoicing POD policy.
              </Text>
            </>
          </View>
        }
        renderItem={({ item: trip }) => {
          const isInvoiceable = Boolean(isTripInvoiceable?.(trip));
          const isSelectable = isTripSelectable
            ? isTripSelectable(trip)
            : isInvoiceable;
          const isLoggable = Boolean(isTripPodLoggable?.(trip));
          const isSelected = selectedTripIds.includes(trip.id);
          if (!isDesktopTripTable) {
            return (
              <Pressable
                style={[
                  styles.tripCardMobile,
                  isSelected && styles.tripCardMobileSelected,
                  !isSelectable && styles.tripRowDisabled,
                ]}
                onPress={() => {
                  if (!isSelectable && !isSelected) return;
                  onToggleTrip(trip.id);
                }}
                disabled={!isSelectable && !isSelected}
              >
                <View style={styles.tripCardMobileTop}>
                  <View>
                    <Text style={styles.tripId}>{trip.id}</Text>
                    <Text style={styles.tripDate}>
                      {new Date(trip.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkBox,
                      isSelected && styles.checkBoxOn,
                    ]}
                  >
                    {isSelected ? (
                      <FontAwesome name="check" size={10} color="#fff" />
                    ) : null}
                  </View>
                </View>
                <Text style={styles.tripSupplier} numberOfLines={1}>
                  {trip.supplier_name}
                </Text>
                <Text style={styles.tripRoute} numberOfLines={1}>
                  {trip.route}
                </Text>
                <View style={styles.tripCardMobileBottom}>
                  <Text style={styles.tripAmount}>₹{trip.amount.toLocaleString()}</Text>
                </View>
                <View style={styles.tripCardMobileTags}>
                  <TripCompletionOrPodTags
                    compact
                    tripCompleted={tripIsDeliveredStatus(trip.tripStatus)}
                    softCopyReceived={Boolean(trip.digitalPodPresent)}
                    hardCopyReceived={Boolean(trip.physicalPodReceived)}
                  />
                </View>
                {isLoggable && onLogPod ? (
                  <Pressable
                    onPress={() => onLogPod([trip])}
                    accessibilityRole="button"
                    accessibilityLabel="Log POD"
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    <Text style={styles.logPodRowText}>Log POD</Text>
                  </Pressable>
                ) : null}
                {!isInvoiceable && !isLoggable ? (
                  <Text style={styles.nonInvoiceableHint}>
                    {tripInvoiceBlockedHint(trip)}
                  </Text>
                ) : null}
              </Pressable>
            );
          }
          return (
            <Pressable
                style={[
                  styles.tripTableRow,
                  compact && styles.tripTableRowCompact,
                  isSelected && styles.tripTableRowSelected,
                  !isSelectable && styles.tripRowDisabled,
                ]}
                onPress={() => {
                  if (!isSelectable && !isSelected) return;
                  onToggleTrip(trip.id);
                }}
                disabled={!isSelectable && !isSelected}
              >
              <View style={styles.selectAllGroup}>
                <View
                  style={[
                    styles.checkBox,
                    isSelected && styles.checkBoxOn,
                    !isSelectable && styles.checkBoxDisabled,
                  ]}
                >
                  {isSelected && (
                    <FontAwesome name="check" size={10} color="#fff" />
                  )}
                </View>
              </View>

              <View style={{ width: compact ? 88 : 100 }}>
                <Text style={styles.tripId} numberOfLines={1}>
                  {trip.id}
                </Text>
                <Text style={styles.tripDate}>
                  {new Date(trip.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </View>

              <View style={{ width: compact ? 72 : 88 }}>
                <Text style={styles.tripId} numberOfLines={1}>
                  {displayOperationalField(trip.lr_number)}
                </Text>
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={styles.tripSupplier} numberOfLines={1}>
                  {displayOperationalField(trip.supplier_name)}
                </Text>
                <Text style={styles.tripDate} numberOfLines={1}>
                  {displayOperationalField(trip.driver_name)}
                </Text>
              </View>

              <View style={{ flex: 2 }}>
                <Text style={styles.tripRoute} numberOfLines={1}>
                  {trip.route}
                </Text>
                <Text style={styles.tripDetails} numberOfLines={1}>
                  {trip.details || "Vehicle N/A"}
                </Text>
              </View>

              <View style={{ width: 80, alignItems: "flex-end" }}>
                <Text style={styles.tripAmount}>
                  ₹{trip.amount.toLocaleString()}
                </Text>
              </View>

              {compact ? null : (
              <View style={{ width: 60, alignItems: "flex-end" }}>
                <Text style={styles.tripExtras}>₹0</Text>
              </View>
              )}

              <View style={{ width: compact ? 88 : 108, alignItems: "flex-start", justifyContent: "center" }}>
                {invoiceStateLabel ? (
                  <FinanceInvoiceStatusPill label={invoiceStateLabel(trip)} />
                ) : (
                  <InvoiceTripStatusTag trip={trip} />
                )}
              </View>
              <View style={{ width: compact ? 104 : 120, alignItems: "flex-start", justifyContent: "center" }}>
                <InvoiceTripPodChips trip={trip} />
                {isLoggable && onLogPod ? (
                  <Pressable
                    onPress={() => onLogPod([trip])}
                    accessibilityRole="button"
                    accessibilityLabel="Log POD"
                    hitSlop={Layout.touchTargetHitSlop}
                    style={styles.logPodRowBtn}
                  >
                    <Text style={styles.logPodRowText}>Log POD</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surfaceGray },
  financeHeader: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  financeHeaderInner: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  heroRowMobile: {
    alignItems: "flex-start",
  },
  heroTextWrap: {
    minWidth: 0,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  heroSub: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textOnDarkMuted,
    fontWeight: "600",
  },
  heroDraftMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 0,
    gap: 12,
    paddingTop: 12,
    paddingBottom: 6,
    paddingRight: Layout.screenPaddingHorizontal,
  },
  kpiScrollMobile: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    ...Platform.select({
      web: {
        overflowX: "auto" as const,
      },
    }),
  },
  invHeaderToolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingTop: 12,
    paddingBottom: 10,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.separatorDark,
  },
  invHeaderSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 38,
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: 12,
    paddingVertical: 0,
    minWidth: 0,
  },
  invHeaderSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  invHeaderSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textOnDark,
    paddingVertical: 0,
  },
  invHeaderSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as object,
  invHeaderToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    flexShrink: 0,
  },
  invHeaderDateWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: 12,
  },
  invHeaderDateInput: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    padding: 0,
    margin: 0,
    minWidth: 86,
    textTransform: "uppercase",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  invHeaderDateTo: {
    marginHorizontal: 8,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1,
  },
  kpiRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  kpiBlock: {
    minWidth: 108,
  },
  kpiLabelRed: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Theme.teslaRed,
  },
  kpiLabelMuted: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Theme.textOnDarkMuted,
  },
  kpiLabelGreen: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#6ee7b7",
  },
  kpiValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  kpiValueMuted: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
  },
  kpiValueGreen: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: "#6ee7b7",
  },
  kpiDivider: {
    width: 1,
    height: 36,
    backgroundColor: Theme.separatorDark,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8, marginLeft: -8 },
  topTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    gap: 12,
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  topSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  statBox: { alignItems: "flex-end" },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValError: { fontSize: 13, fontWeight: "800", color: "#b00020" },
  statValWarn: { fontSize: 13, fontWeight: "800", color: "#b45309" },
  statValOk: { fontSize: 13, fontWeight: "800", color: "#059669" },

  contentArea: { flex: 1, backgroundColor: Theme.surfaceGray },
  billingChrome: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    paddingRight: Layout.screenPaddingHorizontal,
    minHeight: 44,
  },
  billingTabs: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-end",
    flexShrink: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    minHeight: 44,
  },
  billingTab: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 4,
    minHeight: 44,
    justifyContent: "flex-end",
  },
  billingTabLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  billingTabLabelActive: {
    color: Theme.textPrimary,
    fontWeight: "800",
  },
  billingTabUnderline: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.primary,
  },
  splitLayout: { flex: 1, flexDirection: "row" },
  sidebar: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 280,
    minWidth: 220,
    maxWidth: 320,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  mainArea: { flex: 1, minWidth: 0, backgroundColor: Theme.surfaceGray },
  mainAreaCollapsed: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 0,
    width: 0,
    minWidth: 0,
    overflow: "hidden",
    borderRightWidth: 0,
  },
  rightPanel: {
    flexGrow: 0.9,
    flexShrink: 1,
    flexBasis: 360,
    minWidth: 320,
    maxWidth: 440,
    backgroundColor: Theme.analyticsCanvas,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
  },
  rightPanelExpanded: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "100%",
  },
  createPageRoot: {
    backgroundColor: Theme.analyticsCanvas,
  },
  createPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
  },
  createBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 4,
  },
  createBackText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  createPageHint: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  createPageBody: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.analyticsCanvas,
    ...(Platform.OS === "web"
      ? ({
          maxWidth: 1080,
          width: "100%",
          alignSelf: "center",
        } as unknown as ViewStyle)
      : null),
  },
  createEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  createEmptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  createEmptyBody: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 420,
  },
  createEmptyBtn: {
    marginTop: 12,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: Theme.analyticsHeroBg,
    alignItems: "center",
    justifyContent: "center",
  },
  createEmptyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.screenBackground,
  },

  sidebarHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.5)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sidebarTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  sidebarBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  sidebarSearch: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
  },
  sidebarInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },

  clientRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  clientRowActive: { backgroundColor: "rgba(79,70,229,0.03)" },
  clientRowIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Theme.buttonPrimary,
  },
  clientRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  clientName: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  tagApproved: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
    backgroundColor: "rgba(5,150,105,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  tagReceived: {
    fontSize: 9,
    fontWeight: "800",
    color: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  tagPending: {
    fontSize: 9,
    fontWeight: "800",
    color: "#b45309",
    backgroundColor: "rgba(180,83,9,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  tagSettled: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    backgroundColor: Theme.surfaceBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  clientRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clientBilled: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  partnerRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  partnerEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 8,
  },
  partnerEditBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: Theme.borderMedium,
  },
  clientBilledText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  mobileStepContainer: { flex: 1, backgroundColor: Theme.screenBackground },
  mobilePartnerSectionLabel: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    marginBottom: 8,
  },
  invMobilePartnerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  invMobilePartnerSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
  },
  invMobilePartnerSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  invMobilePartnerSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  invMobilePartnerBadge: {
    flexShrink: 0,
    justifyContent: "center",
  },
  mobileConfig: {
    padding: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    marginBottom: 16,
  },
  selectRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mobileGridArea: { flex: 1, backgroundColor: "#f8f9fa" },

  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.3)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 20,
    overflow: "visible",
  },
  listHeaderMobile: {
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
  },
  completionFilterStrip: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  completionFilterLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  listHeaderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  listHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    marginLeft: 12,
  },
  createInvoiceBtn: {
    flexShrink: 0,
  },
  logPodBulkBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: "center",
  },
  logPodBulkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  logPodRowBtn: {
    marginTop: 4,
  },
  logPodRowText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  listHeaderTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  listHeaderTitleCompact: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  listHeaderSub: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginTop: 2,
  },
  listHeaderRule: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  bulkActionWrap: {
    position: "relative",
    zIndex: 30,
    alignSelf: "center",
  },
  bulkActionBtn: {
    backgroundColor: Theme.textPrimaryDark,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
  },
  bulkActionBtnOpen: {
    opacity: 0.92,
  },
  bulkActionText: {
    color: Theme.textOnDark,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  bulkActionBtnMobile: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 8,
  },
  bulkMenuBackdrop: {
    position: "absolute",
    top: -400,
    left: -2000,
    right: -2000,
    bottom: -2000,
    zIndex: 20,
  },
  bulkMenu: {
    position: "absolute",
    top: 48,
    right: 0,
    minWidth: 220,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingVertical: 6,
    shadowColor: Theme.brandBlueShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 40,
  },
  bulkMenuItem: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  bulkMenuItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  bulkMenuItemDanger: {
    color: Theme.negative,
  },
  listFilters: {
    padding: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  searchRow: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchRowMobileInline: {
    flex: 0,
    flexGrow: 0,
    width: 220,
    minWidth: 200,
    maxWidth: 280,
  },
  listFiltersScrollMobile: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: {
        overflowX: "auto" as const,
      },
    }),
  },
  listFiltersScrollMobileContent: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 0,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingRight: Layout.screenPaddingHorizontal + 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },

  dateFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateFilterMobileInline: {
    flexShrink: 0,
  },
  dateRow: { flexDirection: "row", alignItems: "center" },
  dateInput: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
    minWidth: 80,
    textTransform: "uppercase",
  },
  dateToText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    marginHorizontal: 8,
    textTransform: "uppercase",
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.5)",
    gap: 12,
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  selectAllGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
  },
  selectAllCheckbox: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  tripTableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  tripTableRowCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  tripTableRowSelected: { backgroundColor: "rgba(79,70,229,0.03)" },
  tripRowDisabled: { opacity: 0.6 },
  tripCardMobile: {
    backgroundColor: Theme.screenBackground,
    padding: 12,
    marginBottom: 10,
  },
  tripCardMobileSelected: {
    backgroundColor: "rgba(79,70,229,0.05)",
  },
  tripCardMobileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tripCardMobileBottom: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripCardMobileTags: {
    marginTop: 8,
    alignItems: "flex-start",
  },
  nonInvoiceableHint: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },

  checkBox: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: Theme.buttonPrimary, borderColor: Theme.primary },
  checkBoxDisabled: {
    backgroundColor: Theme.surfaceBorder,
  },

  tripDate: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  tripId: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tripSupplier: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tripRoute: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tripDetails: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tripAmount: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  tripExtras: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textMuted,
  },

  listTagPending: {
    fontSize: 8,
    fontWeight: "800",
    color: "#b45309",
    backgroundColor: "rgba(180,83,9,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  listTagApproved: {
    fontSize: 8,
    fontWeight: "800",
    color: "#059669",
    backgroundColor: "rgba(5,150,105,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  listTagReceived: {
    fontSize: 8,
    fontWeight: "800",
    color: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  listTagSettled: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    backgroundColor: Theme.surfaceBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },

  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptySubTitle: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  podRequiredWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    maxWidth: 360,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkSurface,
    minHeight: 44,
  },
  podRequiredWrapCompact: {
    flex: 1,
    maxWidth: 480,
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  podRequiredTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  podRequiredHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  podRequiredTitleLight: {
    color: Theme.textPrimaryDark,
  },
  podRequiredHintLight: {
    color: Theme.textMuted,
  },
  podRequiredCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  podRequiredHintInline: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
  },
  podRequiredSwitch: {
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  podRequiredOption: {
    minWidth: 44,
    minHeight: 32,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  podRequiredOptionOn: {
    backgroundColor: Theme.primary,
  },
  podRequiredOptionText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  podRequiredOptionTextOn: {
    color: Theme.textOnPrimary,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  buildGateReason: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  footerBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 14,
    alignItems: "center",
  },
  footerBtnDisabled: { opacity: 0.5 },
  footerBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    margin: 16,
    color: Theme.textPrimaryDark,
  },
  modalClose: { marginTop: 16, alignItems: "center", padding: 16 },
  modalCloseText: { fontSize: 16, fontWeight: "700", color: Theme.primary },

  blocked: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  blockedBody: { fontSize: 14, color: Theme.textSecondary, marginBottom: 20 },
  blockedBtn: {
    alignSelf: "flex-start",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  blockedBtnText: { color: Theme.buttonPrimaryText, fontWeight: "700" },
  issueReceipt: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  issueReceiptTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  issueReceiptBody: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
});
