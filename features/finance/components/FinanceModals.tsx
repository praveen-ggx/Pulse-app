/**
 * All finance modals and overlays: Add Transaction, Add Client/Supplier/Vehicle/Driver,
 * Entity Detail, Trip P&L, Ledger Report, Shared Ledger.
 */
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberAccess } from "@/lib/useMemberAccess";
import type { AddTransactionData } from "@/components/AddTransactionModal";
import type { PartyOption, TripOption } from "@/components/AddTransactionModal";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { AddClientModal } from "@/features/clients/components/AddClientModal";
import type {
  AddClientFormData,
  ConnectionInviteeMatch,
} from "@/features/clients/components/AddClientModal";
import { EditClientModal } from "@/features/clients/components/EditClientModal";
import type { ClientRow, UpdateClientData } from "@/features/clients/services/clients.service";
import { AddDriverModal } from "@/features/drivers/components/AddDriverModal";
import type { DriverFormData } from "@/features/drivers/components/AddDriverModal";
import { updateDriver, type DriverLedgerRow, type DriverOffer, type DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierFormData } from "@/features/suppliers/components/AddSupplierModal";
import { AddSupplierModal } from "@/features/suppliers/components/AddSupplierModal";
import { EditSupplierModal } from "@/features/suppliers/components/EditSupplierModal";
import type { SupplierRow, UpdateSupplierData } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { LedgerRow } from "../services/finance.service";
import { EntityDetailOverlay } from "./EntityDetailOverlay";
import type { FinancialRowData } from "./FinancialRow";
import { LedgerReportModal } from "./LedgerReportModal";
import { TripPnLDetailSheet } from "./TripPnLDetailSheet";
import type { FinanceSubTab } from "../types";

export interface FinanceModalsProps {
  // AddTransactionModal
  showTransactionModal: boolean;
  onCloseTransactionModal: () => void;
  onSubmitTransaction: (data: AddTransactionData, options?: { entryId: string }) => void;
  clients: { id: string; name: string }[];
  supplierPartyOptions: PartyOption[];
  supplierLinkedOrgIds: Record<string, string>;
  driverPartyOptions: PartyOption[];
  vehicleOptions: { id: string; vehicle_number: string }[];
  modalTripOptions: TripOption[];
  defaultPartyId: string | undefined;
  defaultPartyName: string | undefined;
  lockedPartyId: string | undefined;
  lockedPartyName: string | undefined;
  partyContext: "customers" | "suppliers" | "dco" | "all";
  initialEntry: LedgerRow | null;
  lockedAmount: number | undefined;
  /** Suggested receivable for Cash IN amount placeholder (empty field). */
  dueAmountIn?: number | null;
  /** Suggested payable for Cash OUT amount placeholder (empty field). */
  dueAmountOut?: number | null;
  salaryAmount: number | null | undefined;
  defaultTripId: string | undefined;
  tripLocked: boolean;
  defaultType: "in" | "out" | undefined;
  defaultContactId: string | undefined;
  defaultContactType: "client" | "supplier" | "driver" | undefined;
  defaultDriverPaymentType: import("@/components/AddTransactionModal").DriverPaymentType | null | undefined;
  /** Map linked_organization_id -> local_client_id (for integrated trips). */
  linkedClientIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Map linked_organization_id -> local_supplier_id. */
  linkedSupplierIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Current organization ID to detect if trip is "ours". */
  viewerOrgId?: string | null;
  financeSubTab: FinanceSubTab;

  // Add Client
  showAddClientModal: boolean;
  onCloseAddClientModal: () => void;
  onAddClientComplete: (data: AddClientFormData) => Promise<void>;
  organizationId: string | null;
  noOrganizationMessage: string | null;
  onRefreshOrganization: () => void;
  searchInviteeByPhone: (phone: string) => Promise<ConnectionInviteeMatch | null>;
  onSendClientInvitation: (toOrgId: string) => Promise<void>;

  // Edit Client
  editingClient: ClientRow | null;
  showEditClientModal: boolean;
  onCloseEditClientModal: () => void;
  onEditClientComplete: (patch: UpdateClientData) => Promise<void>;
  onEditClient?: (client: ClientRow) => void;

  // Add Supplier
  showAddSupplierModal: boolean;
  onCloseAddSupplierModal: () => void;
  onAddSupplierComplete: (data: SupplierFormData) => Promise<void>;
  onSendSupplierInvitation: (toOrgId: string) => Promise<void>;

  // Edit Supplier
  editingSupplier: SupplierRow | null;
  showEditSupplierModal: boolean;
  onCloseEditSupplierModal: () => void;
  onEditSupplierComplete: (patch: UpdateSupplierData) => Promise<void>;
  onEditSupplier?: (supplier: SupplierRow) => void;

  // Add Driver
  showAddDriverModal: boolean;
  onCloseAddDriverModal: () => void;
  onAddDriverInviteComplete: (data: DriverFormData) => Promise<void>;
  onAddDriverDirect: (data: DriverFormData) => Promise<void>;

  // Entity overlay
  selectedEntity: {
    data: FinancialRowData;
    entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER";
    subTab: FinanceSubTab;
    initialDetailTab?: "main" | "ledger";
  } | null;
  selectedEntityTrips: TripRow[];
  selectedEntityTransactions: LedgerRow[] | null;
  ledgerTransactions: LedgerRow[] | null;
  driverOffers: Record<string, DriverOffer>;
  selectedDriverLedgerEntries: DriverLedgerRow[] | null;
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  /** Full org lists for SUPPLIER finance trip grid (web desktop). */
  entityOverlayClientRows: ClientRow[];
  entityOverlaySupplierRows: SupplierRow[];
  onEntityOverlayBack: () => void;
  onEntityAddTransaction?: (context: import("./EntityDetailOverlay").TripEntryContext | null) => void;
  onEntityOverlayRefresh: () => void;

  // Trip PnL
  garageTripIdForPnL: string | null;
  onCloseTripPnL: () => void;
  tripRows: TripRow[];

  // Ledger Report
  showReportModal: boolean;
  onCloseReportModal: () => void;
  reportTransactions: LedgerRow[];
  reportTitle?: string;
  reportPeriodLabel?: string;
  reportCustom?: import("./LedgerReportModal").LedgerReportModalProps["customReport"];
  hideReportCashSummary?: boolean;

  orgId: string | null;
}

export function FinanceModals(props: FinanceModalsProps) {
  const {
    showTransactionModal,
    onCloseTransactionModal,
    onSubmitTransaction,
    clients,
    supplierPartyOptions,
    supplierLinkedOrgIds,
    driverPartyOptions,
    vehicleOptions,
    modalTripOptions,
    defaultPartyId,
    defaultPartyName,
    lockedPartyId,
    lockedPartyName,
    partyContext,
    initialEntry,
    lockedAmount,
    dueAmountIn,
    dueAmountOut,
    salaryAmount,
    defaultTripId,
    tripLocked,
    defaultType,
    defaultContactId,
    defaultContactType,
    defaultDriverPaymentType,
    linkedClientIdByOrgId,
    linkedSupplierIdByOrgId,
    viewerOrgId,
    showAddClientModal,
    onCloseAddClientModal,
    onAddClientComplete,
    organizationId,
    noOrganizationMessage,
    onRefreshOrganization,
    searchInviteeByPhone,
    onSendClientInvitation,
    editingClient,
    showEditClientModal,
    onCloseEditClientModal,
    onEditClientComplete,
    onEditClient,
    showAddSupplierModal,
    onCloseAddSupplierModal,
    onAddSupplierComplete,
    onSendSupplierInvitation,
    editingSupplier,
    showEditSupplierModal,
    onCloseEditSupplierModal,
    onEditSupplierComplete,
    onEditSupplier,
    showAddDriverModal,
    onCloseAddDriverModal,
    onAddDriverInviteComplete,
    onAddDriverDirect,
    selectedEntity,
    selectedEntityTrips,
    selectedEntityTransactions,
    ledgerTransactions,
    driverOffers,
    selectedDriverLedgerEntries,
    vehicleRows,
    driverRows,
    entityOverlayClientRows,
    entityOverlaySupplierRows,
    onEntityOverlayBack,
    onEntityAddTransaction,
    onEntityOverlayRefresh,
    garageTripIdForPnL,
    onCloseTripPnL,
    tripRows,
    showReportModal,
    onCloseReportModal,
    reportTransactions,
    reportTitle,
    reportPeriodLabel,
    reportCustom,
    hideReportCashSummary,
    orgId,
  } = props;

  const { t } = useLanguage();
  const { can: canSurface } = useMemberAccess();
  const canAssignDriverVehicle = canSurface("fleet.drivers.assign_vehicle");

  return (
    <>
      <AddTransactionModal
        visible={showTransactionModal}
        onClose={onCloseTransactionModal}
        onSubmit={onSubmitTransaction}
        clients={clients}
        suppliers={supplierPartyOptions}
        supplierLinkedOrgIds={supplierLinkedOrgIds}
        linkedClientIdByOrgId={linkedClientIdByOrgId}
        linkedSupplierIdByOrgId={linkedSupplierIdByOrgId}
        viewerOrgId={viewerOrgId}
        drivers={driverPartyOptions}
        vehicles={vehicleOptions}
        trips={modalTripOptions}
        defaultPartyId={defaultPartyId}
        defaultPartyName={defaultPartyName}
        lockedPartyId={lockedPartyId}
        lockedPartyName={lockedPartyName}
        partyContext={partyContext}
        initialEntry={initialEntry}
        lockedAmount={lockedAmount}
        dueAmountIn={dueAmountIn}
        dueAmountOut={dueAmountOut}
        salaryAmount={salaryAmount}
        defaultTripId={defaultTripId}
        tripLocked={tripLocked}
        defaultType={defaultType}
        defaultContactId={defaultContactId}
        defaultContactType={defaultContactType}
        defaultDriverPaymentType={defaultDriverPaymentType ?? undefined}
        ledgerTransactions={ledgerTransactions ?? null}
        driverOffersByDriverId={driverOffers}
      />

      <AddClientModal
        visible={showAddClientModal}
        onClose={onCloseAddClientModal}
        onComplete={onAddClientComplete}
        organizationId={organizationId}
        noOrganizationMessage={noOrganizationMessage}
        onRefreshOrganization={onRefreshOrganization}
        searchInviteeByPhone={searchInviteeByPhone}
        onSendInvitation={onSendClientInvitation}
      />

      <EditClientModal
        visible={showEditClientModal}
        client={editingClient}
        onClose={onCloseEditClientModal}
        onSave={onEditClientComplete}
        onSyncLatest={
          onEditClient && editingClient?.is_integrated
            ? async () => {
                await Promise.resolve(onEditClient(editingClient));
              }
            : undefined
        }
      />

      <AddSupplierModal
        visible={showAddSupplierModal}
        onClose={onCloseAddSupplierModal}
        onComplete={onAddSupplierComplete}
        organizationId={organizationId}
        noOrganizationMessage={noOrganizationMessage}
        onRefreshOrganization={onRefreshOrganization}
        searchInviteeByPhone={searchInviteeByPhone}
        onSendInvitation={onSendSupplierInvitation}
      />

      <EditSupplierModal
        visible={showEditSupplierModal}
        supplier={editingSupplier}
        onClose={onCloseEditSupplierModal}
        onSave={onEditSupplierComplete}
        onSyncLatest={
          onEditSupplier && editingSupplier?.supplier_type === "integrated"
            ? async () => {
                await Promise.resolve(onEditSupplier(editingSupplier));
              }
            : undefined
        }
      />

      <AddDriverModal
        visible={showAddDriverModal}
        onClose={onCloseAddDriverModal}
        onComplete={onAddDriverInviteComplete}
        onAddDriver={onAddDriverDirect}
        salariedOnly={true}
      />

      {selectedEntity && (
        <EntityDetailOverlay
          entity={selectedEntity.data}
          entityType={selectedEntity.entityType}
          subTab={
            selectedEntity.subTab === "cash"
              ? "ledger"
              : selectedEntity.subTab
          }
          trips={selectedEntityTrips}
          transactions={selectedEntityTransactions ?? undefined}
          allLedgerTransactions={ledgerTransactions ?? undefined}
          driverOffer={
            selectedEntity.entityType === "DRIVER"
              ? (driverOffers[selectedEntity.data.id] ?? null)
              : null
          }
          driverLedgerEntries={
            selectedEntity.entityType === "DRIVER"
              ? (selectedDriverLedgerEntries ?? [])
              : undefined
          }
          vehicle={
            selectedEntity.entityType === "VEHICLE"
              ? (vehicleRows.find((v) => v.id === selectedEntity.data.id) ?? null)
              : undefined
          }
          driverProfile={
            selectedEntity.entityType === "DRIVER"
              ? (driverRows.find((d) => d.id === selectedEntity.data.id) ?? null)
              : undefined
          }
          onBack={onEntityOverlayBack}
          onAddTransaction={
            onEntityAddTransaction
              ? (context) => onEntityAddTransaction(context ?? null)
              : undefined
          }
          organizationId={organizationId}
          onRefresh={onEntityOverlayRefresh}
          vehicles={selectedEntity?.entityType === "DRIVER" ? vehicleRows : undefined}
          onAssignVehicle={
            selectedEntity?.entityType === "DRIVER" && orgId && canAssignDriverVehicle
              ? async (driverId, vehicleId) => {
                  await updateDriver(orgId, driverId, { assigned_vehicle_id: vehicleId });
                  onEntityOverlayRefresh?.();
                }
              : undefined
          }
          drivers={
            selectedEntity?.entityType === "VEHICLE" ||
            selectedEntity?.entityType === "DRIVER"
              ? driverRows
              : undefined
          }
          onAssignDriver={
            selectedEntity?.entityType === "VEHICLE" && orgId && canAssignDriverVehicle
              ? async (vehicleId, driverId) => {
                  if (driverId == null) {
                    const current = driverRows.find((d) => d.assigned_vehicle_id === vehicleId);
                    if (current) await updateDriver(orgId, current.id, { assigned_vehicle_id: null });
                  } else {
                    const prev = driverRows.find((d) => d.assigned_vehicle_id === vehicleId);
                    if (prev) await updateDriver(orgId, prev.id, { assigned_vehicle_id: null });
                    await updateDriver(orgId, driverId, { assigned_vehicle_id: vehicleId });
                  }
                  onEntityOverlayRefresh?.();
                }
              : undefined
          }
          financeClientRows={entityOverlayClientRows}
          financeSupplierRows={entityOverlaySupplierRows}
          financePartyDrivers={driverRows}
          initialDetailTab={selectedEntity.initialDetailTab}
        />
      )}

      <TripPnLDetailSheet
        visible={garageTripIdForPnL != null}
        onClose={onCloseTripPnL}
        trip={tripRows.find((t) => t.id === garageTripIdForPnL) ?? null}
        transactions={ledgerTransactions ?? null}
      />

      <LedgerReportModal
        visible={showReportModal}
        onClose={onCloseReportModal}
        transactions={reportTransactions}
        title={reportTitle ?? t("ledgerReport")}
        periodLabel={reportPeriodLabel}
        customReport={reportCustom}
        hideCashSummary={hideReportCashSummary ?? !!reportCustom}
      />
    </>
  );
}
