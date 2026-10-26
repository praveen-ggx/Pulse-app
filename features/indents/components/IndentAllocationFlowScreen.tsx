/**
 * Full-screen indent deploy — asset and aggregate allocation wizards.
 */
import { manuallySelectableSuppliers } from "@/features/marketplace/utils/marketplaceParty.util";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Switch, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import {
  fullPageWizardStyles,
  WizardPartyContextRow,
  WizardPriorSelections,
  type WizardPriorSelectionItem,
} from "@/components/full-page-wizard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { IndentAggregateAllocationStep } from "@/features/indents/components/IndentAggregateAllocationStep";
import { IndentAllocationConfirmSummary } from "@/features/indents/components/IndentAllocationConfirmSummary";
import { IndentAllocationMarketplaceFeePanel } from "@/features/indents/components/IndentAllocationMarketplaceFeePanel";
import { IndentAllocationSourceStep } from "@/features/indents/components/IndentAllocationSourceStep";
import { IndentAllocationTripDetailsStep } from "@/features/indents/components/IndentAllocationTripDetailsStep";
import { IndentAssetAllocationStep } from "@/features/indents/components/IndentAssetAllocationStep";
import {
  listMyOrgMarketBids,
  marketBidsFromQueryData,
} from "@/features/network/services/findLoadsForOrg.service";
import {
  marketplaceFeeGateSatisfied,
  settleMarketplaceFeeAsCash,
} from "@/features/network/services/marketBids.service";
import { showAppAlert } from "@/lib/appAlert";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IndentDeployOtpPanel } from "@/features/indents/components/IndentDeployOtpPanel";
import {
  AssignmentFlowFooter,
  AssignmentFlowShell,
  getIndentAllocationWizardSteps,
  indentAllocationStepSubtitle,
  indentAllocationStepBlockReason,
  isIndentAllocationStepComplete,
  type IndentAllocationStepId,
} from "@/features/allocation";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import {
  seedDeployLoadTypeFromIndent,
  seedDeployPickupDateFromIndent,
  seedDeployVehicleTypeFromIndent,
  seedDeployWeightTonsFromIndent,
} from "@/features/indents/utils/indentDeployTripDetails.util";
import { formatIsoDateForDisplay, isValidIsoDateString } from "@/lib/dateIso.util";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { ListTodo } from "lucide-react-native";
import { createTripDesktopStyles as tripS } from "@/features/trips/components/add-trip/createTripDesktop.styles";
import { resolveMarketIndentShipperLabel } from "@/features/indents/utils/indentPartyDisplay.util";
import { ROUTES } from "@/lib/routes";
import {
  useClientsQuery,
  useDriversQuery,
  useMyDirectQuotesQuery,
  useSuppliersQuery,
  useVisibleIndentQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import { useLoadChainAncestorsQuery } from "@/lib/queries/useLoadChainAncestorsQuery";
import { getChainBlockReason } from "@/features/trips/services/loadChainGuard.service";

export type IndentAllocationFlowFocus = "driver" | "vehicle";

export interface IndentAllocationFlowScreenProps {
  indentId: string;
  /** From award modal “Assign vehicle” — open fleet vehicle step first. */
  initialFocus?: IndentAllocationFlowFocus;
  onBack: () => void;
}

export function IndentAllocationFlowScreen({
  indentId,
  initialFocus,
  onBack,
}: IndentAllocationFlowScreenProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const queryClient = useQueryClient();
  const [feeSettling, setFeeSettling] = useState(false);
  const [step, setStep] = useState<IndentAllocationStepId>(
    initialFocus ? "fleet" : "source",
  );

  const marketFeeQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.myBids(orgId ?? ""),
    queryFn: async () => {
      const result = await listMyOrgMarketBids(orgId as string, 80);
      if (result.error) throw result.error;
      return result;
    },
    enabled: Boolean(orgId) && step === "commodity",
    staleTime: STALE.frequent,
  });
  const acceptedMarketBid = useMemo(
    () =>
      marketBidsFromQueryData(marketFeeQ.data).find(
        (bid) => bid.indent_id === indentId && bid.status === "accepted",
      ) ?? null,
    [marketFeeQ.data, indentId],
  );
  const marketplaceFeeBlocking = Boolean(
    acceptedMarketBid &&
      !marketplaceFeeGateSatisfied(acceptedMarketBid.fee_payment_status),
  );

  const {
    data: indent,
    isPending: indentPending,
    isError: indentError,
  } = useVisibleIndentQuery(orgId, indentId);

  const onFleetStep = step === "fleet" || step === "source";
  const { data: myQuotes = [] } = useMyDirectQuotesQuery(onFleetStep ? null : orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  const rosterPending = driversQ.isPending || vehiclesQ.isPending;
  const { data: suppliers = [] } = useSuppliersQuery(onFleetStep ? null : orgId);
  const selectableSuppliers = useMemo(() => manuallySelectableSuppliers(suppliers), [suppliers]);
  const { data: myClients = [] } = useClientsQuery(onFleetStep ? null : orgId);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => !d.left_at),
    [drivers],
  );

  // Load-chain loop guard: a load must not be sub-contracted back to an org
  // already upstream in its chain (the cargo owner, or a broker that handled
  // it). Those partners stay visible but greyed, with the reason.
  const { data: chainAncestors = [] } = useLoadChainAncestorsQuery(
    step === "partner" ? indentId : null,
  );
  // This load's own shipper org, resolved without the ancestor RPC:
  // - Viewer is the awarded supplier (indent.organization_id is some other
  //   org): that other org IS the shipper directly.
  // - Viewer owns the indent themselves (the common case — they typed the
  //   shipper as free-text `client_name`): resolve it via their own CRM
  //   `clients` row for that name, same match the RPC does server-side, but
  //   synchronous and independent of it.
  const shipperOrgId = useMemo(() => {
    if (!indent) return "";
    const indentOwnerOrgId = String(indent.organization_id ?? "").trim();
    if (orgId && indentOwnerOrgId && indentOwnerOrgId !== orgId) {
      return indentOwnerOrgId;
    }
    const wantedName = String(indent.client_name ?? "").trim().toLowerCase();
    if (!wantedName) return "";
    const match = myClients.find(
      (c) =>
        String(c.name ?? "").trim().toLowerCase() === wantedName &&
        !!c.linked_organization_id,
    );
    return String(match?.linked_organization_id ?? "").trim();
  }, [indent, orgId, myClients]);
  const blockedPartnerReasons = useMemo(() => {
    const map: Record<string, string> = {};
    for (const supplier of suppliers) {
      if (shipperOrgId) {
        const linkedOrg = String(supplier.linked_organization_id ?? "").trim();
        if (linkedOrg && linkedOrg === shipperOrgId) {
          const label =
            supplier.company_name?.trim() || supplier.name?.trim() || "This partner";
          map[supplier.id] = `${label} is the shipper on this load and cannot also be its supplier.`;
          continue;
        }
      }
      if (chainAncestors.length > 0) {
        const reason = getChainBlockReason(supplier, chainAncestors, orgId);
        if (reason) map[supplier.id] = reason.message;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [suppliers, chainAncestors, orgId, shipperOrgId]);

  // refreshAfterDeploy (inside useStaffHandshake's finishDeploySuccess, which runs before
  // this callback) already invalidates indents with bustPartnerSupplierMarket — doing it
  // again here duplicated that round trip (and its background supplier-market refresh
  // chain) on every successful deploy.
  const handshake = useStaffHandshake({
    orgId,
    myQuotes,
    onSuccess: () => {},
  });

  const { open, close, state, set, deployRoster, deployAdHoc } = handshake;
  const {
    currentLoad,
    isDeploying,
    useAdHocDriver,
    assignDriverId,
    assignVehicleId,
    staffHandshakeAssignLater,
    deployOtpCode,
    deployPickupDate,
    deployWeightTons,
    deployVehicleType,
    deployLoadType,
    tripDetailsReady,
    subcontractSupplierId,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    aggregatePhoneInTrip,
    aggregatePhoneMatches,
    aggregatePhoneLookupLoading,
    aggregatePhoneSelectedUserId,
    deployTripIdForOtp,
    deployOtpExpiresAt,
  } = state;
  const deploySucceeded = Boolean(deployTripIdForOtp);

  const flowSteps = useMemo(
    () =>
      getIndentAllocationWizardSteps({
        aggregate: useAdHocDriver,
        assignLater: staffHandshakeAssignLater,
      }),
    [useAdHocDriver, staffHandshakeAssignLater],
  );

  const stepIndex = flowSteps.findIndex((s) => s.id === step);
  const isLastStep = stepIndex >= 0 && stepIndex === flowSteps.length - 1;

  const openedIndentKeyRef = useRef<string | null>(null);
  const seededIndentKeyRef = useRef<string | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    if (!indent) return;
    const openKey = `${indent.id}:${initialFocus ?? ""}`;
    if (openedIndentKeyRef.current === openKey) return;
    openedIndentKeyRef.current = openKey;
    open(indent);
    /** Award “Assign driver/vehicle” deep-links skip source and open grouped fleet. */
    if (initialFocus === "vehicle" || initialFocus === "driver") {
      set.useAdHocDriver(false);
      setStep("fleet");
    } else {
      setStep("source");
    }
  }, [indent, open, initialFocus, set]);

  useEffect(() => {
    if (!indent || !currentLoad || currentLoad.id !== indent.id) return;
    const seedKey = [
      indent.id,
      indent.weight ?? "",
      indent.vehicle_type ?? "",
      indent.load_type ?? "",
      indent.pickup_date ?? "",
    ].join("|");
    if (seededIndentKeyRef.current === seedKey) return;
    seededIndentKeyRef.current = seedKey;
    if (!deployWeightTons) {
      const weight = seedDeployWeightTonsFromIndent(indent);
      if (weight) set.deployWeightTons(weight);
    }
    if (!deployVehicleType) {
      const vehicleType = seedDeployVehicleTypeFromIndent(indent);
      if (vehicleType) set.deployVehicleType(vehicleType);
    }
    if (!deployLoadType) {
      const loadType = seedDeployLoadTypeFromIndent(indent);
      if (loadType) set.deployLoadType(loadType);
    }
    if (!deployPickupDate) {
      const pickup = seedDeployPickupDateFromIndent(indent);
      if (pickup) set.deployPickupDate(pickup);
    }
  }, [
    indent,
    currentLoad,
    deployWeightTons,
    deployVehicleType,
    deployLoadType,
    deployPickupDate,
    set,
  ]);

  /**
   * Seed the subcontract partner + rate from the indent's own award — but
   * only when THIS org is the indent's owner (organization_id), i.e. they
   * are the one who awarded the load and are now deploying it to the
   * partner they already chose. assigned_supplier_id is an organizations
   * FK naming who won the award, so match it against
   * suppliers.linked_organization_id to find this account's own tracking
   * record for that real org.
   *
   * When the viewer org is instead the AWARDED supplier itself (e.g.
   * Paperkraft, having won this indent from nihas logs, now sub-deploying
   * to its own chosen partner further down the chain), assigned_supplier_id
   * equals the viewer's own org — there is no "partner to preselect" here,
   * because the partner on this screen is whoever Paperkraft is
   * sub-contracting to, unrelated to who awarded Paperkraft. Pre-filling in
   * that case would be wrong: assigned_supplier_rate is what Paperkraft
   * RECEIVES from nihas logs, not what they PAY their own sub-supplier —
   * those are two different figures and must not be conflated.
   */
  const awardSeededIndentIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!indent || !orgId || suppliers.length === 0) return;
    if (awardSeededIndentIdRef.current === indent.id) return;
    if (!indent.assigned_supplier_id) return;
    // Only seed when this viewer is the indent's own owner awarding it out —
    // never when the viewer IS the awarded org sub-deploying further.
    if (indent.organization_id !== orgId) return;
    const awardedSupplier = suppliers.find(
      (s) => s.linked_organization_id === indent.assigned_supplier_id,
    );
    if (!awardedSupplier) return;
    awardSeededIndentIdRef.current = indent.id;
    set.subcontractSupplierId(awardedSupplier.id);
    if (indent.assigned_supplier_rate != null) {
      set.subcontractRate(String(indent.assigned_supplier_rate));
    }
  }, [indent, orgId, suppliers, set]);

  /**
   * Reference figure for the rates step: what THIS org itself bid & won on
   * the indent, shown as a fixed "You won" strip next to whatever rate it's
   * now typing for its own sub-supplier. Only meaningful when the viewer
   * org IS the awarded supplier (assigned_supplier_id === orgId) — the
   * scenario the seeding effect above deliberately skips, since that
   * receivable figure is never the same as the payable rate being entered.
   */
  const awardedRate =
    indent && orgId && indent.assigned_supplier_id === orgId
      ? indent.assigned_supplier_rate ?? null
      : null;

  useEffect(() => {
    return () => {
      openedIndentKeyRef.current = null;
      closeRef.current();
    };
  }, []);

  // Defensive: a blocked supplier (this load's own shipper) must never survive
  // as the deploy target — clears it even if it was selected before this
  // guard existed, or if a later step is reached without revisiting Partner.
  useEffect(() => {
    if (!subcontractSupplierId) return;
    if (blockedPartnerReasons?.[subcontractSupplierId]) {
      set.subcontractSupplierId(null);
    }
  }, [subcontractSupplierId, blockedPartnerReasons, set]);

  useEffect(() => {
    if (flowSteps.some((s) => s.id === step)) return;
    setStep(flowSteps[0]?.id ?? "source");
  }, [flowSteps, step]);

  const advanceToRates = useCallback(() => {
    setStep("rates");
  }, []);

  const handleClose = useCallback(() => {
    const createdTripId = deployTripIdForOtp;
    if (createdTripId) {
      router.replace(ROUTES.tripDetail(createdTripId));
      return;
    }
    close();
    onBack();
  }, [close, deployTripIdForOtp, onBack, router]);

  const selectedDriver = activeDrivers.find((d) => String(d.id) === assignDriverId);
  const driverLabel =
    selectedDriver?.name ?? selectedDriver?.phone ?? "Not selected";
  const selectedVehicle =
    typeof assignVehicleId === "string"
      ? vehicles.find((v) => String(v.id) === assignVehicleId)
      : null;
  const vehicleLabel = selectedVehicle?.vehicle_number ?? "Not selected";

  const selectedPartner = suppliers.find((s) => s.id === subcontractSupplierId);
  const partnerLabel =
    selectedPartner?.company_name?.trim() ||
    selectedPartner?.name?.trim() ||
    "Not selected";

  const tripDateLabel = deployPickupDate
    ? formatIsoDateForDisplay(deployPickupDate)
    : "—";

  const shipperLabel = currentLoad
    ? resolveMarketIndentShipperLabel(currentLoad)
    : "Shipper";
  const loadRouteSubtitle = currentLoad
    ? `${currentLoad.pickup_area || "—"} → ${currentLoad.drop_location || "—"}`
    : null;

  const priorSelections = useMemo((): WizardPriorSelectionItem[] => {
    if (!currentLoad || deployOtpCode) return [];
    /** Final date step uses IndentAllocationConfirmSummary instead. */
    if (step === "commodity") return [];
    const items: WizardPriorSelectionItem[] = [];

    if (useAdHocDriver) {
      /**
       * Phone → Load: one tiny strip (shipper · rate · phone · name · vehicle).
       * No stacked cards / no live driver-name preview in chrome.
       */
      const summarySteps = new Set([
        "driverPhone",
        "driverName",
        "vehicleReg",
      ]);
      if (summarySteps.has(step)) {
        items.push({
          id: "shipper",
          label: "Shipper",
          name: shipperLabel,
        });

        const rateRaw = subcontractRate.trim();
        if (rateRaw) {
          items.push({
            id: "rate",
            label: "Rate",
            name: `₹${Number(rateRaw).toLocaleString("en-IN")}`,
            onPress: () => setStep("rates"),
          });
        }

        if (
          (step === "driverName" || step === "vehicleReg") &&
          aggregateDriverPhone.trim()
        ) {
          items.push({
            id: "phone",
            label: "Phone",
            name: aggregateDriverPhone.trim(),
            onPress: () => setStep("driverPhone"),
          });
        }

        if (step === "vehicleReg" && aggregateDriverTrackingName.trim()) {
          items.push({
            id: "name",
            label: "Driver",
            name: aggregateDriverTrackingName.trim(),
            onPress: () => setStep("driverName"),
          });
        }

        return items;
      }
    }

    return items;
  }, [
    currentLoad,
    deployOtpCode,
    useAdHocDriver,
    step,
    shipperLabel,
    subcontractRate,
    aggregateDriverPhone,
    aggregateDriverTrackingName,
  ]);

  const confirmAllocationRows = useMemo(() => {
    const editable = !deployOtpCode;
    const rows: {
      id: string;
      label: string;
      value: string;
      onEdit?: () => void;
    }[] = [
      {
        id: "shipper",
        label: "Shipper",
        value: shipperLabel,
      },
    ];

    if (useAdHocDriver) {
      rows.push({
        id: "partner",
        label: "Partner",
        value: subcontractSupplierId ? partnerLabel : "—",
        onEdit: editable ? () => setStep("partner") : undefined,
      });
      const rateRaw = subcontractRate.trim();
      rows.push({
        id: "rate",
        label: "Rate",
        value: rateRaw
          ? `₹${Number(rateRaw).toLocaleString("en-IN")}`
          : "—",
        onEdit: editable ? () => setStep("rates") : undefined,
      });
      if (!staffHandshakeAssignLater) {
        rows.push({
          id: "phone",
          label: "Driver phone",
          value: aggregateDriverPhone.trim() || "—",
          onEdit: editable ? () => setStep("driverPhone") : undefined,
        });
        rows.push({
          id: "driver",
          label: "Driver",
          value: aggregateDriverTrackingName.trim() || "—",
          onEdit: editable ? () => setStep("driverName") : undefined,
        });
        rows.push({
          id: "vehicle",
          label: "Vehicle",
          value: assignVehicleRegistration.trim() || "—",
          onEdit: editable ? () => setStep("vehicleReg") : undefined,
        });
      }
    } else if (!staffHandshakeAssignLater) {
      rows.push({
        id: "driver",
        label: "Driver",
        value: assignDriverId ? driverLabel : "—",
        onEdit: editable ? () => setStep("fleet") : undefined,
      });
      rows.push({
        id: "vehicle",
        label: "Vehicle",
        value:
          typeof assignVehicleId === "string" ? vehicleLabel : "—",
          onEdit: editable ? () => setStep("fleet") : undefined,
      });
    }

    if (acceptedMarketBid) {
      const feeAmt = acceptedMarketBid.platform_fee_amount;
      const paid = marketplaceFeeGateSatisfied(
        acceptedMarketBid.fee_payment_status,
      );
      rows.push({
        id: "marketplaceFee",
        label: "Marketplace fee",
        value:
          feeAmt != null && feeAmt > 0
            ? `${paid ? "Paid" : "Due"} · ₹${Number(feeAmt).toLocaleString("en-IN")}`
            : paid
              ? "Not required"
              : "Due",
      });
    }

    if (deployOtpCode) {
      rows.push({
        id: "arrival",
        label: "Vehicle arrival",
        value: tripDateLabel,
      });
    }

    if (deployVehicleType.trim()) {
      rows.push({
        id: "vehicleType",
        label: "Vehicle type",
        value: deployVehicleType.trim(),
      });
    }
    if (deployLoadType.trim()) {
      rows.push({
        id: "product",
        label: "Product",
        value: deployLoadType.trim(),
      });
    }
    if (deployWeightTons.trim()) {
      rows.push({
        id: "weight",
        label: "Weight",
        value: `${deployWeightTons.trim()} t`,
      });
    }

    return rows;
  }, [
    deployOtpCode,
    shipperLabel,
    useAdHocDriver,
    staffHandshakeAssignLater,
    subcontractSupplierId,
    partnerLabel,
    subcontractRate,
    aggregateDriverPhone,
    aggregateDriverTrackingName,
    assignVehicleRegistration,
    assignDriverId,
    driverLabel,
    assignVehicleId,
    vehicleLabel,
    tripDateLabel,
    deployVehicleType,
    deployLoadType,
    deployWeightTons,
    acceptedMarketBid,
  ]);

  const allocationContextRow = useMemo(() => {
    if (deployOtpCode || !currentLoad) return null;
    /** Final confirm step uses IndentAllocationConfirmSummary. */
    if (step === "commodity") return null;

    const left = {
      label: "Shipper",
      name: shipperLabel,
      subtitle: loadRouteSubtitle,
      entityType: "client" as const,
    };

    if (useAdHocDriver) {
      /**
       * After rates, chrome is the compact prior strip only (no duplicate
       * shipper / live driver-name card that overlaps the field).
       */
      if (
        step === "driverPhone" ||
        step === "driverName" ||
        step === "vehicleReg"
      ) {
        return null;
      }

      const partnerSteps = new Set<IndentAllocationStepId>([
        "partner",
        "rates",
      ]);
      if (partnerSteps.has(step)) {
        const partnerCell = {
          label: "Partner",
          name:
            selectedPartner && subcontractSupplierId
              ? partnerLabel
              : step === "partner"
                ? "Select partner"
                : "—",
          subtitle: selectedPartner
            ? [selectedPartner.supplier_type, selectedPartner.phone]
                .filter(Boolean)
                .join(" · ")
            : null,
          entityType: "supplier" as const,
          avatarUrl:
            (selectedPartner as { avatar_url?: string | null })?.avatar_url ??
            null,
          avatarSeed:
            (selectedPartner as { avatar_seed?: string | null })?.avatar_seed ??
            null,
          /** Rates / later steps: tap to change partner (back to picker). */
          onPress:
            step !== "partner" && selectedPartner
              ? () => setStep("partner")
              : undefined,
          showChevron: step !== "partner" && Boolean(selectedPartner),
          changeAffordance:
            step === "rates" ? ("change" as const) : ("chevron" as const),
        };

        /**
         * Rates: Partner is primary (with change chevron). Shipper secondary.
         * Partner step: Shipper left, Partner picker summary right.
         */
        if (step === "rates" && selectedPartner) {
          return {
            left: partnerCell,
            right: {
              label: "Shipper",
              name: shipperLabel,
              subtitle: loadRouteSubtitle,
              entityType: "client" as const,
            },
          };
        }

        return {
          left,
          right: partnerCell,
        };
      }

      return { left, right: null };
    }

    if (step === "fleet") {
      return {
        left,
        right: {
          label: "Driver",
          name:
            assignDriverId && selectedDriver ? driverLabel : "Select driver",
          subtitle: selectedDriver
            ? [selectedDriver.phone, selectedDriver.email]
                .filter(Boolean)
                .join(" · ")
            : null,
          entityType: "driver" as const,
          avatarUrl:
            (selectedDriver as { avatar_url?: string | null })?.avatar_url ??
            null,
          avatarSeed:
            (selectedDriver as { avatar_seed?: string | null })?.avatar_seed ??
            null,
        },
      };
    }

    if (step === "source") {
      return { left, right: null };
    }

    return null;
  }, [
    deployOtpCode,
    currentLoad,
    shipperLabel,
    loadRouteSubtitle,
    useAdHocDriver,
    step,
    selectedPartner,
    subcontractSupplierId,
    partnerLabel,
    assignDriverId,
    selectedDriver,
    driverLabel,
  ]);

  const stepComplete = isIndentAllocationStepComplete(step, {
    assignDriverId,
    assignVehicleId,
    subcontractSupplierId,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    tripDetailsReady,
    aggregatePhoneInTrip,
    aggregatePhoneLookupLoading,
    aggregatePhoneMatches,
    aggregatePhoneSelectedUserId,
    staffHandshakeAssignLater,
  });

  const stepSubtitle = deployOtpCode
    ? "Share this code with the driver to claim the trip"
    : deploySucceeded
      ? "Trip created. Open the trip or tap Done."
      : indentAllocationStepSubtitle(step, useAdHocDriver);

  const footerSummary = useMemo(() => {
    if (deployOtpCode) return "";
    /** Final step: confirmation lives in the body, not the footer. */
    if (step === "commodity") return "";
    if (step === "source") return useAdHocDriver ? "Aggregate" : "Asset fleet";
    if (useAdHocDriver) {
      if (step === "partner") return partnerLabel;
      if (step === "rates") return subcontractRate.trim() ? `₹${subcontractRate.trim()}` : "—";
      if (step === "driverPhone") return aggregateDriverPhone.trim() || "—";
      if (step === "driverName") return aggregateDriverTrackingName.trim() || "—";
      if (step === "vehicleReg") return assignVehicleRegistration.trim() || "—";
      return partnerLabel;
    }
    if (step === "fleet") return `${driverLabel} · ${vehicleLabel}`;
    return `${driverLabel} · ${vehicleLabel}`;
  }, [
    deployOtpCode,
    step,
    useAdHocDriver,
    partnerLabel,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    driverLabel,
    vehicleLabel,
  ]);

  const payMarketplaceFeeCash = useCallback(async (): Promise<boolean> => {
    if (!acceptedMarketBid) return true;
    if (marketplaceFeeGateSatisfied(acceptedMarketBid.fee_payment_status)) {
      return true;
    }
    setFeeSettling(true);
    try {
      const { error } = await settleMarketplaceFeeAsCash(acceptedMarketBid.id);
      if (error) {
        showAppAlert(
          "Could not record fee",
          error.message.includes("does not exist") ||
            error.message.includes("Could not find the function")
            ? "Cash settlement is not on the database yet. Apply the marketplace fee cash migration, then try again."
            : error.message,
        );
        return false;
      }
      if (orgId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.findLoadsForOrg.myBids(orgId),
        });
      }
      return true;
    } finally {
      setFeeSettling(false);
    }
  }, [acceptedMarketBid, orgId, queryClient]);

  const handlePrimary = useCallback(() => {
    if (deploySucceeded) {
      handleClose();
      return;
    }
    if (!stepComplete) {
      const blockState = {
        assignDriverId,
        assignVehicleId,
        subcontractSupplierId,
        subcontractRate,
        aggregateDriverTrackingName,
        aggregateDriverPhone,
        assignVehicleRegistration,
        tripDetailsReady,
        aggregatePhoneInTrip,
        aggregatePhoneLookupLoading,
        aggregatePhoneMatches,
        aggregatePhoneSelectedUserId,
        staffHandshakeAssignLater,
      };
      showAppAlert(
        isLastStep ? "Cannot convert" : "Finish this step",
        indentAllocationStepBlockReason(step, blockState) ??
          "This step is not finished.",
      );
      return;
    }
    if (!isLastStep) {
      const next = flowSteps[stepIndex + 1];
      if (next) setStep(next.id);
      return;
    }
    void (async () => {
      if (marketplaceFeeBlocking) {
        const paid = await payMarketplaceFeeCash();
        if (!paid) return;
      }
      if (useAdHocDriver) {
        await deployAdHoc();
      } else {
        await deployRoster();
      }
    })();
  }, [
    deploySucceeded,
    stepComplete,
    step,
    assignDriverId,
    assignVehicleId,
    subcontractSupplierId,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    tripDetailsReady,
    aggregatePhoneInTrip,
    aggregatePhoneLookupLoading,
    aggregatePhoneMatches,
    aggregatePhoneSelectedUserId,
    staffHandshakeAssignLater,
    isLastStep,
    flowSteps,
    stepIndex,
    marketplaceFeeBlocking,
    payMarketplaceFeeCash,
    useAdHocDriver,
    deployAdHoc,
    deployRoster,
    handleClose,
  ]);

  const primaryDisabled = deploySucceeded
    ? false
    : isLastStep
      ? isDeploying || feeSettling
      : !stepComplete || isDeploying || feeSettling;

  const primaryLabel = deploySucceeded
    ? "Done"
    : feeSettling
      ? "Recording fee…"
      : isLastStep && marketplaceFeeBlocking
        ? "Pay fee & convert"
        : isLastStep
          ? "Convert to trip"
          : "Continue";

  const showBack = !deploySucceeded && stepIndex > 0;

  const handleBack = useCallback(() => {
    if (deploySucceeded) {
      handleClose();
      return;
    }
    const prev = flowSteps[stepIndex - 1];
    if (prev) setStep(prev.id);
  }, [deploySucceeded, handleClose, flowSteps, stepIndex]);

  const pickupDateError =
    deployPickupDate && !isValidIsoDateString(deployPickupDate)
      ? "Use a valid date (YYYY-MM-DD)."
      : null;

  const isCompactLayout = windowWidth < Layout.webDesktopMinWidth;

  const showAssignLaterOnPartner = !deploySucceeded && step === "partner";

  const fillBodyStep =
    step === "rates" ||
    step === "driverPhone" ||
    step === "driverName" ||
    step === "vehicleReg";

  /** Final confirm: Convert to trip only in the footer (Edit rows / header back to change). */
  const showFooterBack = showBack && !isLastStep && !fillBodyStep;

  /** Dense summary strip after rates (shipper · rate · …). */
  const compactChrome =
    step === "driverPhone" ||
    step === "driverName" ||
    step === "vehicleReg";

  const applySupplyMode = useCallback(
    (aggregate: boolean) => {
      set.useAdHocDriver(aggregate);
      if (aggregate) {
        set.assignDriverId(null);
        set.assignVehicleId(undefined);
      } else {
        set.aggregateDriverPhone("");
        set.aggregateDriverTrackingName("");
        set.subcontractSupplierId(null);
        set.subcontractRate("");
        set.assignVehicleRegistration("");
        set.aggregateDriverNameManualRef.current = false;
      }
    },
    [set],
  );

  const applyAssignLater = useCallback(
    (v: boolean) => {
      set.staffHandshakeAssignLater(v);
      if (v) {
        set.assignDriverId(null);
        set.assignVehicleId(undefined);
        set.aggregateDriverPhone("");
        set.aggregateDriverTrackingName("");
        set.assignVehicleRegistration("");
      }
    },
    [set],
  );

  const hasFlowChrome =
    Boolean(allocationContextRow) ||
    priorSelections.length > 0 ||
    showAssignLaterOnPartner ||
    (staffHandshakeAssignLater && step === "commodity");

  if (state.closingToList) {
    return null;
  }

  if (state.closingToList) {
    return null;
  }

  if (!currentLoad) {
    if (indentError && !indentPending) {
      return (
        <View style={[styles.flowStep, { padding: Layout.screenPaddingHorizontal, paddingTop: 24 }]}>
          <Text
            style={{
              color: Theme.textPrimaryDark,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            Could not open this award for assignment. Go back and try Assign
            again.
          </Text>
          <Text
            onPress={onBack}
            style={{ color: Theme.primary, fontSize: 14, fontWeight: "700", marginTop: 12 }}
            accessibilityRole="button"
          >
            Back
          </Text>
        </View>
      );
    }
    return <CenteredLoadingView message="Loading allocation…" />;
  }

  return (
    <AssignmentFlowShell
      fullScreen
      fillBody={fillBodyStep}
      scrollBody={!fillBodyStep}
      title={
        deployOtpCode
          ? "Trip claim code"
          : deploySucceeded
            ? "Trip created"
            : "Deploy load"
      }
      subtitle={
        deployOtpCode
          ? "Share this code with the driver to claim the trip."
          : stepSubtitle
      }
      stepIndex={undefined}
      stepTotal={undefined}
      steppedLayout={!isCompactLayout}
      onClose={handleClose}
      onBack={showBack ? handleBack : undefined}
      showBack={showBack}
      footer={
        <AssignmentFlowFooter
          summary={
            deploySucceeded || fillBodyStep || isLastStep
              ? undefined
              : footerSummary
          }
          primaryLabel={primaryLabel}
          onPrimaryPress={handlePrimary}
          primaryDisabled={primaryDisabled}
          loading={isDeploying}
          secondaryLabel={showFooterBack ? "Back" : undefined}
          onSecondaryPress={showFooterBack ? handleBack : undefined}
        />
      }
      submitting={isDeploying}
    >
      {deploySucceeded ? (
        <View style={[styles.otpStack, styles.confirmStepCompact]}>
          <IndentAllocationConfirmSummary
            compact
            title=""
            hint={null}
            rows={confirmAllocationRows}
          />
          {deployOtpCode ? (
            <IndentDeployOtpPanel
              showHint={false}
              code={deployOtpCode}
              expiresAt={deployOtpExpiresAt}
              tripId={deployTripIdForOtp}
              onCodeChange={(code, expiresAt) => {
                set.deployOtpCode(code);
                set.deployOtpExpiresAt(expiresAt);
              }}
            />
          ) : (
            <Text style={styles.confirmHint}>
              No claim code is needed for this assignment. Tap Done to open the trip.
            </Text>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.flowBody,
            fillBodyStep ? styles.flowBodyKeypad : fullPageWizardStyles.wizardStepBody,
          ]}
        >
          {hasFlowChrome ? (
            <View
              style={
                fillBodyStep
                  ? fullPageWizardStyles.wizardKeypadChromePad
                  : styles.flowChrome
              }
            >
              {allocationContextRow ? (
                <WizardPartyContextRow
                  left={allocationContextRow.left}
                  right={allocationContextRow.right}
                  compact={compactChrome}
                />
              ) : null}

              {priorSelections.length > 0 ? (
                <WizardPriorSelections
                  items={priorSelections}
                  compact={compactChrome}
                />
              ) : null}

              {showAssignLaterOnPartner ? (
                <View
                  style={[
                    tripS.inputBoxClean,
                    tripS.allocAssignLaterBox,
                    isCompactLayout && tripS.compactAssignLaterBox,
                  ]}
                >
                  <ListTodo size={16} color={Theme.textRouteCard} strokeWidth={2} />
                  <View style={tripS.allocAssignLaterCopy}>
                    <Text style={tripS.allocAssignLaterTitle}>Assign later</Text>
                    <Text style={tripS.allocAssignLaterSub}>
                      Add vehicle & driver phone on trip detail
                    </Text>
                  </View>
                  <Switch
                    value={staffHandshakeAssignLater}
                    onValueChange={applyAssignLater}
                    trackColor={{
                      false: Theme.borderLight,
                      true: Theme.textPrimaryDark,
                    }}
                    thumbColor={Theme.cardWhite}
                  />
                </View>
              ) : null}

              {staffHandshakeAssignLater && step === "commodity" ? (
                <View style={fullPageWizardStyles.shipperWarningCard}>
                  <Text style={fullPageWizardStyles.shipperWarningText}>
                    {useAdHocDriver
                      ? "Partner and rate are required now. Add driver and vehicle on the trip screen before the trip starts."
                      : "Assign vehicle and driver on the trip screen before the trip starts."}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View
            style={
              fillBodyStep
                ? fullPageWizardStyles.wizardKeypadStepFill
                : styles.flowStep
            }
          >
            {step === "source" ? (
              <IndentAllocationSourceStep
                compact={isCompactLayout}
                mode={useAdHocDriver ? "aggregate" : "asset"}
                onModeChange={(mode) => applySupplyMode(mode === "aggregate")}
              />
            ) : null}

            {useAdHocDriver &&
            step !== "commodity" &&
            (step === "partner" ||
              step === "rates" ||
              step === "driverName" ||
              step === "driverPhone" ||
              step === "vehicleReg") ? (
              <IndentAggregateAllocationStep
                step={step}
                suppliers={selectableSuppliers}
                state={state}
                set={set}
                blockedReasonBySupplierId={blockedPartnerReasons}
                onPartnerSelected={advanceToRates}
                awardedRate={awardedRate}
              />
            ) : null}

            {step === "commodity" ? (
              <View
                style={[
                  styles.confirmStep,
                  isCompactLayout
                    ? styles.confirmStepCompact
                    : styles.confirmStepWide,
                ]}
              >
                <IndentAllocationConfirmSummary
                  compact
                  rows={confirmAllocationRows}
                />
                {acceptedMarketBid ? (
                  <IndentAllocationMarketplaceFeePanel
                    feeStatus={acceptedMarketBid.fee_payment_status}
                    feeAmount={acceptedMarketBid.platform_fee_amount}
                    busy={feeSettling}
                    onPayCash={() => {
                      void payMarketplaceFeeCash();
                    }}
                  />
                ) : null}
                <IndentAllocationTripDetailsStep
                  compact={isCompactLayout}
                  pickupDate={deployPickupDate}
                  onPickupDateChange={set.deployPickupDate}
                  pickupDateError={pickupDateError}
                />
              </View>
            ) : null}

            {!useAdHocDriver && step === "fleet" ? (
              <IndentAssetAllocationStep
                compact={isCompactLayout}
                orgId={orgId}
                rosterPending={rosterPending}
                drivers={activeDrivers}
                vehicles={vehicles}
                assignDriverId={assignDriverId}
                assignVehicleId={assignVehicleId}
                assignLater={staffHandshakeAssignLater}
                onAssignLaterChange={applyAssignLater}
                onSelectDriver={(id) =>
                  set.assignDriverId(assignDriverId === id ? null : id)
                }
                onSelectVehicle={(id) =>
                  set.assignVehicleId(assignVehicleId === id ? undefined : id)
                }
                onAddDriver={() => {
                  router.push({
                    pathname: "/(modals)/add-driver",
                    params: { returnTo: ROUTES.indentAllocation(indentId) },
                  });
                }}
                onAddVehicle={() => {
                  router.push({
                    pathname: "/(modals)/add-vehicle",
                    params: { returnTo: ROUTES.indentAllocation(indentId) },
                  });
                }}
              />
            ) : null}
          </View>
        </View>
      )}
    </AssignmentFlowShell>
  );
}

const styles = StyleSheet.create({
  flowBody: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    flexGrow: 1,
  },
  flowBodyKeypad: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    gap: 6,
    overflow: "hidden",
  },
  flowChrome: {
    width: "100%",
    gap: 14,
    flexShrink: 0,
    backgroundColor: Theme.screenBackground,
    zIndex: 2,
    paddingBottom: 8,
  },
  flowStep: {
    width: "100%",
    minWidth: 0,
    gap: 12,
  },
  confirmStep: {
    width: "100%",
    gap: 16,
  },
  confirmStepCompact: {
    gap: 10,
  },
  confirmStepWide: {
    maxWidth: 560,
    alignSelf: "center",
    gap: 12,
  },
  otpStack: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 10,
  },
  confirmHint: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 20,
  },
});
