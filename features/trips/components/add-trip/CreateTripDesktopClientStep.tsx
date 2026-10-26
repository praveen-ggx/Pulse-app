/**
 * Create Trip — step 1: billing client → optional contract lane gate → sale value.
 */
import { Plus } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";

import { ClientSaleDesktopModal } from "./ClientSaleDesktopModal";
import { ClientSaleKeypadFlow } from "./ClientSaleKeypadFlow";
import {
  CreateTripDesktopClientGrid,
  DesktopPartySearchField,
  DesktopPickerHeaderActions,
  filterClientsByPartyQuery,
} from "./CreateTripDesktopPickers";
import { CreateTripLaneGatePanel } from "./CreateTripLaneGatePanel";
import { DesktopSectionHeading } from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import type { SaleRateBasis } from "@/features/clients/utils/saleRateSnapshot.util";

function formatInr(raw: string): string | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")}`;
}

export type CreateTripDesktopClientStepProps = {
  clients: ClientRow[];
  clientsLoading: boolean;
  clientId: string | null;
  clientListExpanded: boolean;
  onExpandClientList: () => void;
  onToggleClientList: () => void;
  onSelectClient: (client: ClientRow) => void;
  onAddClient: () => void;
  clientError?: boolean;
  clientPrice: string;
  onClientPriceChange: (value: string) => void;
  clientPriceError?: boolean;
  onClearClient: () => void;
  compact?: boolean;
  contractLanes?: readonly ClientLaneRate[];
  contractLanesLoading?: boolean;
  selectedLaneId?: string | null;
  onSelectLane?: (lane: ClientLaneRate) => void;
  onClearLane?: () => void;
  laneSearch?: string;
  onLaneSearchChange?: (value: string) => void;
  /** Parent can block wizard Continue while the lane gate is showing. */
  onLaneGateActiveChange?: (active: boolean) => void;
  saleRateBasis?: SaleRateBasis;
  saleUnitRate?: string;
  onSaleRateBasisChange?: (basis: SaleRateBasis) => void;
  onSaleUnitRateChange?: (value: string) => void;
};

export const CreateTripDesktopClientStep = memo(
  function CreateTripDesktopClientStep({
    clients,
    clientsLoading,
    clientId,
    clientListExpanded,
    onExpandClientList,
    onToggleClientList,
    onSelectClient,
    onAddClient,
    clientError,
    clientPrice,
    onClientPriceChange,
    clientPriceError = false,
    onClearClient,
    compact = false,
    contractLanes = [],
    contractLanesLoading = false,
    selectedLaneId = null,
    onSelectLane,
    onClearLane,
    laneSearch,
    onLaneSearchChange,
    onLaneGateActiveChange,
    saleRateBasis = "per_trip",
    saleUnitRate = "",
    onSaleRateBasisChange,
    onSaleUnitRateChange,
  }: CreateTripDesktopClientStepProps) {
    const showClientChange = Boolean(clientId);
    const [saleModalOpen, setSaleModalOpen] = useState(false);
    const [saleDoneAttempted, setSaleDoneAttempted] = useState(false);
    const [partySearch, setPartySearch] = useState("");
    /** After client pick: stay on lane gate until a lane is chosen or adhoc is confirmed. */
    const [adhocTrip, setAdhocTrip] = useState(false);
    /** Sticky: client has contracts (survives search filtering to zero rows). */
    const [clientHasContracts, setClientHasContracts] = useState(false);
    const autoOpenedSaleKeyRef = useRef<string | null>(null);

    useEffect(() => {
      setAdhocTrip(false);
      setClientHasContracts(false);
      setSaleDoneAttempted(false);
      autoOpenedSaleKeyRef.current = null;
    }, [clientId]);

    useEffect(() => {
      if (!contractLanesLoading && contractLanes.length > 0) {
        setClientHasContracts(true);
      }
    }, [contractLanesLoading, contractLanes.length]);

    const filteredClients = useMemo(
      () => filterClientsByPartyQuery(clients, partySearch),
      [clients, partySearch],
    );
    const clientListOpen =
      clientListExpanded || partySearch.trim().length > 0;

    const handlePartySearch = useCallback(
      (value: string) => {
        setPartySearch(value);
        if (value.trim()) onExpandClientList();
      },
      [onExpandClientList],
    );

    const selectedClient = useMemo(
      () => clients.find((row) => row.id === clientId) ?? null,
      [clientId, clients],
    );

    const perMt = saleRateBasis === "per_mt";
    const saleEntryValue = perMt ? saleUnitRate : clientPrice;
    const onSaleEntryChange = perMt
      ? (onSaleUnitRateChange ?? onClientPriceChange)
      : onClientPriceChange;
    const saleDisplay = perMt
      ? formatInr(saleUnitRate)
        ? `${formatInr(saleUnitRate)} / MT`
        : null
      : formatInr(clientPrice);
    const saleMissing =
      perMt ? !formatInr(saleUnitRate) : !formatInr(clientPrice);
    const saleErrorLabel = perMt
      ? "Enter a per-MT rate greater than 0"
      : "Enter a sale price greater than 0";

    const partyPreview = useMemo(
      () =>
        selectedClient
          ? {
              name: selectedClient.name ?? "Client",
              subtitle:
                resolveWizardClientPhone(selectedClient.phone) ?? undefined,
              entityType: "client" as const,
              avatarUrl: selectedClient.avatar_url ?? null,
              avatarSeed: selectedClient.avatar_seed ?? null,
            }
          : undefined,
      [selectedClient],
    );

    const laneGateEnabled = Boolean(clientId && onSelectLane);
    const showLaneGate =
      laneGateEnabled &&
      (contractLanesLoading ||
        (clientHasContracts && !selectedLaneId && !adhocTrip));
    const showPricing =
      Boolean(clientId) &&
      !showLaneGate &&
      (!laneGateEnabled ||
        !clientHasContracts ||
        Boolean(selectedLaneId) ||
        adhocTrip);

    /**
     * A contract lane carries the agreed rate, so the sale value is not the
     * user's to retype here — editing it would silently diverge from the
     * contract. Changing the lane (or going adhoc) is the way to change it.
     */
    const saleLockedToLane = Boolean(selectedLaneId) && Boolean(saleDisplay);

    const onLaneGateActiveChangeRef = useRef(onLaneGateActiveChange);
    onLaneGateActiveChangeRef.current = onLaneGateActiveChange;
    const lastLaneGate = useRef<boolean | null>(null);
    useEffect(() => {
      if (lastLaneGate.current === showLaneGate) return;
      lastLaneGate.current = showLaneGate;
      onLaneGateActiveChangeRef.current?.(showLaneGate);
    }, [showLaneGate]);
    useEffect(() => {
      return () => {
        if (lastLaneGate.current) {
          lastLaneGate.current = false;
          onLaneGateActiveChangeRef.current?.(false);
        }
      };
    }, []);

    useEffect(() => {
      if (compact || !showPricing || saleLockedToLane || !clientId) return;
      const key = `${clientId}:${selectedLaneId ?? ""}:${adhocTrip ? "adhoc" : ""}`;
      if (autoOpenedSaleKeyRef.current === key) return;
      autoOpenedSaleKeyRef.current = key;
      setSaleDoneAttempted(false);
      setSaleModalOpen(true);
    }, [
      adhocTrip,
      clientId,
      compact,
      saleLockedToLane,
      selectedLaneId,
      showPricing,
    ]);

    const handleSelectClient = useCallback(
      (client: ClientRow) => {
        onSelectClient(client);
      },
      [onSelectClient],
    );

    const handleChangeClient = useCallback(() => {
      setAdhocTrip(false);
      setSaleModalOpen(false);
      setSaleDoneAttempted(false);
      onClearLane?.();
      onClearClient();
      onExpandClientList();
    }, [onClearClient, onClearLane, onExpandClientList]);

    const handleChooseAdhoc = useCallback(() => {
      onClearLane?.();
      setAdhocTrip(true);
    }, [onClearLane]);

    const handleSelectLane = useCallback(
      (lane: ClientLaneRate) => {
        setAdhocTrip(false);
        onSelectLane?.(lane);
      },
      [onSelectLane],
    );

    const handleClearLane = useCallback(() => {
      onClearLane?.();
      setAdhocTrip(false);
    }, [onClearLane]);

    const handleSaleDone = useCallback(() => {
      if (saleMissing) {
        setSaleDoneAttempted(true);
        return;
      }
      setSaleDoneAttempted(false);
      setSaleModalOpen(false);
    }, [saleMissing]);

    // ── Phase: contract lane gate (full page) ─────────────────────────────
    if (showLaneGate && onSelectLane) {
      return (
        <CreateTripLaneGatePanel
          compact={compact}
          clientName={selectedClient?.name}
          lanes={contractLanes}
          loading={contractLanesLoading}
          selectedLaneId={selectedLaneId}
          onSelectLane={handleSelectLane}
          onClearLane={handleClearLane}
          onChooseAdhoc={handleChooseAdhoc}
          onChangeClient={handleChangeClient}
          laneSearch={laneSearch}
          onLaneSearchChange={onLaneSearchChange}
        />
      );
    }

    // ── Phase: mobile pricing keypad ──────────────────────────────────────
    if (compact && showPricing) {
      return (
        <View style={s.saleMobileKeypadRoot}>
          {laneGateEnabled && (selectedLaneId || adhocTrip) ? (
            <View style={s.lanePathBanner}>
              <Text style={s.lanePathBannerText} numberOfLines={1}>
                {selectedLaneId
                  ? "Contract lane selected · sale can be adjusted"
                  : "Adhoc trip · enter sale manually"}
              </Text>
              <Pressable onPress={handleClearLane} hitSlop={8}>
                <Text style={s.lanePathBannerAction}>
                  {selectedLaneId ? "Change lane" : "Use contract"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <ClientSaleKeypadFlow
            compact
            clientPrice={saleEntryValue}
            onClientPriceChange={onSaleEntryChange}
            partyPreview={partyPreview}
            onPartyPress={handleChangeClient}
            errorMessage={clientPriceError ? saleErrorLabel : undefined}
            saleRateBasis={saleRateBasis}
            onSaleRateBasisChange={onSaleRateBasisChange}
            saleBasisLocked={Boolean(selectedLaneId) && perMt}
          />
        </View>
      );
    }

    // ── Phase: client pick (+ desktop sale after gate) ────────────────────
    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={s.commodityClientSection}>
          {compact ? (
            <View style={s.compactPartyToolbar}>
              <View style={s.compactPartyToolbarTop}>
                <Text style={[s.sectionHeading, s.compactSectionHeading]}>
                  Billing client *
                </Text>
                <View style={s.desktopPickerHeaderActions}>
                  <DesktopPickerHeaderActions
                    showChange={showClientChange}
                    changeExpanded={clientListOpen}
                    onToggleChange={onToggleClientList}
                  />
                  <Pressable
                    onPress={onAddClient}
                    style={s.compactAddClientBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Add new client"
                    hitSlop={8}
                  >
                    <Plus
                      size={14}
                      color={Theme.textPrimaryDark}
                      strokeWidth={2.5}
                    />
                    <Text style={s.compactAddClientBtnText}>Add client</Text>
                  </Pressable>
                </View>
              </View>
              <DesktopPartySearchField
                compact
                value={partySearch}
                onChangeText={handlePartySearch}
                placeholder="Search client"
                accessibilityLabel="Search billing client"
              />
            </View>
          ) : (
            <View style={s.commodityClientHeaderRow}>
              <Text style={[s.sectionHeading, s.commodityClientHeaderTitle]}>
                Billing client *
              </Text>
              <DesktopPartySearchField
                value={partySearch}
                onChangeText={handlePartySearch}
                placeholder="Search client"
                accessibilityLabel="Search billing client"
              />
              <View style={s.desktopPickerHeaderActions}>
                <DesktopPickerHeaderActions
                  showChange={showClientChange}
                  changeExpanded={clientListOpen}
                  onToggleChange={onToggleClientList}
                />
                <Pressable
                  onPress={onAddClient}
                  style={s.commodityAddClientBtn}
                  accessibilityRole="button"
                >
                  <Plus
                    size={14}
                    color={Theme.textPrimaryDark}
                    strokeWidth={2.5}
                  />
                  <Text style={s.commodityAddClientBtnText}>Add new client</Text>
                </Pressable>
              </View>
            </View>
          )}
          <CreateTripDesktopClientGrid
            compact={compact}
            clients={filteredClients}
            clientsLoading={clientsLoading}
            selectedClientId={clientId}
            listExpanded={clientListOpen}
            onExpandList={onExpandClientList}
            onSelectClient={handleSelectClient}
            hasError={clientError}
          />

          {showPricing && !compact ? (
            <View style={s.sourceRatesBlock}>
              {laneGateEnabled && (selectedLaneId || adhocTrip) ? (
                <View style={s.lanePathBanner}>
                  <Text style={s.lanePathBannerText} numberOfLines={1}>
                    {selectedLaneId
                      ? "Contract lane applied"
                      : "Adhoc trip — no contract lane"}
                  </Text>
                  <Pressable onPress={handleClearLane} hitSlop={8}>
                    <Text style={s.lanePathBannerAction}>
                      {selectedLaneId ? "Change lane" : "Use contract"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <DesktopSectionHeading>Sale value</DesktopSectionHeading>
              <Pressable
                style={[
                  s.sourceRateSummaryCard,
                  clientPriceError && s.sourceRateSummaryCardError,
                ]}
                disabled={saleLockedToLane}
                onPress={() => {
                  if (saleLockedToLane) return;
                  setSaleDoneAttempted(false);
                  setSaleModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: saleLockedToLane }}
                accessibilityLabel={
                  saleLockedToLane
                    ? "Sale value set by the contract lane"
                    : "Edit sale value"
                }
              >
                <View style={s.sourceRateSummaryCopy}>
                  <Text style={s.sourceRateSummaryLabel}>Client sale</Text>
                  {saleDisplay ? (
                    <Text style={s.sourceRateSummaryValue}>{saleDisplay}</Text>
                  ) : (
                    <Text style={s.sourceRateSummaryValueMuted}>
                      {perMt ? "Tap to enter ₹ / MT" : "Tap to enter sale value"}
                    </Text>
                  )}
                  {clientPriceError ? (
                    <Text style={s.salePriceError}>{saleErrorLabel}</Text>
                  ) : null}
                  {saleLockedToLane ? (
                    <Text style={s.lanePathBannerText}>
                      From the contract lane — change the lane to change this
                    </Text>
                  ) : null}
                </View>
                {saleLockedToLane ? null : (
                  <View style={s.sourceRateSummaryAction}>
                    <Text style={s.sourceRateSummaryActionText}>
                      {saleDisplay ? "Edit" : "Add sale"}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        {!compact ? (
          <ClientSaleDesktopModal
            visible={saleModalOpen && Boolean(clientId) && showPricing}
            onClose={() => {
              setSaleDoneAttempted(false);
              setSaleModalOpen(false);
            }}
            onDone={handleSaleDone}
            clientPrice={saleEntryValue}
            onClientPriceChange={(v) => {
              setSaleDoneAttempted(false);
              onSaleEntryChange(v);
            }}
            partyPreview={partyPreview}
            onChangeClient={handleChangeClient}
            priceError={saleDoneAttempted && saleMissing}
            saleRateBasis={saleRateBasis}
            onSaleRateBasisChange={onSaleRateBasisChange}
            saleBasisLocked={Boolean(selectedLaneId) && perMt}
          />
        ) : null}
      </View>
    );
  },
);
