import { Plus } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";

import { ClientSaleDesktopModal } from "./ClientSaleDesktopModal";
import { ClientSaleKeypadFlow } from "./ClientSaleKeypadFlow";
import {
  CreateTripDesktopClientGrid,
  DesktopPartySearchField,
  DesktopPickerHeaderActions,
  filterClientsByPartyQuery,
} from "./CreateTripDesktopPickers";
import { DesktopSectionHeading } from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

function formatInr(raw: string): string | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")}`;
}

export type CreateTripDesktopCommodityClientStepProps = {
  vehicleType: string;
  loadType: string;
  tons: string;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  onTonsChange: (value: string) => void;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
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
  /** Stack load + client columns on mobile. */
  compact?: boolean;
};

export const CreateTripDesktopCommodityClientStep = memo(
  function CreateTripDesktopCommodityClientStep({
    vehicleType,
    loadType,
    tons,
    onVehicleTypeChange,
    onLoadTypeChange,
    onTonsChange,
    vehicleTypeError,
    loadTypeError,
    tonsError,
    indentVehicleType,
    indentLoadType,
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
  }: CreateTripDesktopCommodityClientStepProps) {
    const showClientChange = Boolean(clientId);
    const [saleModalOpen, setSaleModalOpen] = useState(false);
    const [saleDoneAttempted, setSaleDoneAttempted] = useState(false);
    const [partySearch, setPartySearch] = useState("");

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

    const saleDisplay = formatInr(clientPrice);

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

    const showMobileSaleKeypad = compact && Boolean(clientId);

    const handleSelectClient = useCallback(
      (client: ClientRow) => {
        onSelectClient(client);
        if (!compact) {
          setSaleDoneAttempted(false);
          setSaleModalOpen(true);
        }
      },
      [compact, onSelectClient],
    );

    const handleChangeClientFromModal = useCallback(() => {
      setSaleModalOpen(false);
      setSaleDoneAttempted(false);
      onClearClient();
      onExpandClientList();
    }, [onClearClient, onExpandClientList]);

    const handleSaleDone = useCallback(() => {
      if (!formatInr(clientPrice)) {
        setSaleDoneAttempted(true);
        return;
      }
      setSaleDoneAttempted(false);
      setSaleModalOpen(false);
    }, [clientPrice]);

    if (showMobileSaleKeypad) {
      return (
        <View style={s.saleMobileKeypadRoot}>
          <ClientSaleKeypadFlow
            clientPrice={clientPrice}
            onClientPriceChange={onClientPriceChange}
            partyPreview={partyPreview}
            onPartyPress={() => {
              onClearClient();
              onExpandClientList();
            }}
            errorMessage={
              clientPriceError
                ? "Enter a sale price greater than 0"
                : undefined
            }
          />
        </View>
      );
    }

    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={compact ? s.compactStack : s.commodityClientGrid}>
          <View style={compact ? s.compactCol : s.commodityClientLoadCol}>
            <View style={s.commodityClientSection}>
              <Text style={s.sectionHeading}>Load details</Text>
              <View style={s.fieldSection}>
                <TripCommodityFields
                  useVehicleCatalog
                  vehicleType={vehicleType}
                  loadType={loadType}
                  tons={tons}
                  onVehicleTypeChange={onVehicleTypeChange}
                  onLoadTypeChange={onLoadTypeChange}
                  onTonsChange={onTonsChange}
                  vehicleTypeError={vehicleTypeError}
                  loadTypeError={loadTypeError}
                  tonsError={tonsError}
                  indentVehicleType={indentVehicleType}
                  indentLoadType={indentLoadType}
                  isWide={false}
                  useFormChrome
                  preferWebSelect={Platform.OS === "web" && !compact}
                  desktopChrome
                  fieldLabelStyle={s.desktopFieldLabel}
                  fieldInputStyle={[s.inputBoxClean, s.formFieldInput]}
                />
              </View>
            </View>
          </View>
          <View style={compact ? s.compactCol : s.commodityClientPickerCol}>
            <View style={s.commodityClientSection}>
              <View
                style={[s.commodityClientHeaderRow, compact && s.compactHeaderRow]}
              >
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

              {clientId && !compact ? (
                <View style={s.sourceRatesBlock}>
                  <DesktopSectionHeading>Sale value</DesktopSectionHeading>
                  <Pressable
                    style={[
                      s.sourceRateSummaryCard,
                      clientPriceError && s.sourceRateSummaryCardError,
                    ]}
                    onPress={() => {
                      setSaleDoneAttempted(false);
                      setSaleModalOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Edit sale value"
                  >
                    <View style={s.sourceRateSummaryCopy}>
                      <Text style={s.sourceRateSummaryLabel}>Client sale</Text>
                      {saleDisplay ? (
                        <Text style={s.sourceRateSummaryValue}>{saleDisplay}</Text>
                      ) : (
                        <Text style={s.sourceRateSummaryValueMuted}>
                          Tap to enter sale value
                        </Text>
                      )}
                      {clientPriceError ? (
                        <Text style={s.salePriceError}>
                          Enter a sale price greater than 0
                        </Text>
                      ) : null}
                    </View>
                    <View style={s.sourceRateSummaryAction}>
                      <Text style={s.sourceRateSummaryActionText}>
                        {saleDisplay ? "Edit" : "Add sale"}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {!compact ? (
          <ClientSaleDesktopModal
            visible={saleModalOpen && Boolean(clientId)}
            onClose={() => {
              setSaleDoneAttempted(false);
              setSaleModalOpen(false);
            }}
            onDone={handleSaleDone}
            clientPrice={clientPrice}
            onClientPriceChange={(v) => {
              setSaleDoneAttempted(false);
              onClientPriceChange(v);
            }}
            partyPreview={partyPreview}
            onChangeClient={handleChangeClientFromModal}
            priceError={saleDoneAttempted && !formatInr(clientPrice)}
          />
        ) : null}
      </View>
    );
  },
);
