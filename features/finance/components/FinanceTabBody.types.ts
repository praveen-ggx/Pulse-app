import type { TripOption } from "@/components/AddTransactionModal";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type {
  DriverOffer,
  DriverRow,
} from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { DriversViewTab } from "@/features/drivers/components/DriversTab";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import type { CustomersViewTab } from "@/features/clients/components/CustomersTab";
import type { SuppliersViewTab } from "@/features/suppliers/components/SuppliersTab";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import type { ConnectionRequestRow } from "@/features/connections/services/connectionRequests.service";
import type { ReactNode } from "react";
import type { LedgerRow } from "../services/finance.service";
import type { FinanceSubTab } from "../types";
import type { FinancialRowData } from "./FinancialRow";
import type { EntityListFilter } from "./TreasurySummaryCard";
import type { SupplierPartyKindFilter } from "@/features/finance/domain/financeCounterpartyLane";

export interface FinanceTabBodyProps {
  financeSubTab: FinanceSubTab;
  organizationId: string | null;
  ledgerLoading: boolean;
  ledgerFetchError?: string | null;
  ledgerTransactions: LedgerRow[] | null;
  ledgerForEntityAggregation?: LedgerRow[] | null;
  filteredLedgerForDisplay: LedgerRow[];
  /** Cash kanban — all party columns; ignores toolbar ledger category + in/out chips. */
  filteredLedgerForKanban: LedgerRow[];
  ledgerRefreshKey: number;
  onLedgerRowSelect: (data: FinancialRowData) => void;
  getVehicleNumberForTripId: (tripId: string | null) => string | null;
  tripOptions: TripOption[];
  tripDetailsMap?: Record<
    string,
    {
      trip_number: string;
      drop_location?: string;
      pickup_area?: string;
      client_name?: string;
      pickup_date?: string | null;
      vehicle_number?: string | null;
      client_price?: number | null;
      supplier_rate?: number | null;
      driver_commission?: number | null;
    }
  >;
  clientRows: ClientRow[];
  tripRows: TripRow[];
  supplierRows: SupplierRow[];
  tripsWhereOrgIsClient: TripRow[];
  tripsWhereOrgIsSupplier?: TripRow[];
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  driverOffers: Record<string, DriverOffer>;
  entitiesLoading: boolean;
  clientsLoading?: boolean;
  suppliersLoading?: boolean;
  onTabTotals: (totals: { totalIn: number; totalOut: number }) => void;
  onEntityRowSelect: (
    data: FinancialRowData,
    entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER",
    subTab: FinanceSubTab,
  ) => void;
  searchQuery: string;
  entityFilter: EntityListFilter;
  /** Finance → Suppliers: All / Supplier / DCO. DCO stays contact_type=dco. */
  supplierPartyKind?: SupplierPartyKindFilter;
  onSupplierPartyKindChange?: (kind: SupplierPartyKindFilter) => void;
  connectionRequestsSent: ConnectionRequestRow[];
  tripPartyMap: Record<
    string,
    {
      client_id?: string | null;
      supplier_id?: string | null;
      driver_id?: string | null;
    }
  >;
  garagePeriod: string;
  onGaragePeriodChange: (v: string) => void;
  garageViewTab: GarrageViewTab;
  onGarageViewTabChange: (v: GarrageViewTab) => void;
  driverViewTab: DriversViewTab;
  onDriverViewTabChange: (v: DriversViewTab) => void;
  customerViewTab: CustomersViewTab;
  onCustomerViewTabChange: (v: CustomersViewTab) => void;
  supplierViewTab: SuppliersViewTab;
  onSupplierViewTabChange: (v: SuppliersViewTab) => void;
  onTripSelect: (tripId: string) => void;
  onAddTransactionPress?: () => void;
  /** Opens add-party flow for customers / suppliers / drivers / garage (matches Finance FAB). */
  onAddPartyPress?: () => void;
  /** Cash kanban column CTAs when ledger is empty (desktop). */
  onKanbanPartyAddPress?: (
    column: "customers" | "suppliers" | "garage" | "drivers",
  ) => void;
  fetchNextLedgerPage?: () => void;
  hasNextLedgerPage?: boolean;
  ledgerPageLoading?: boolean;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  /** Mobile finance: parent ScrollView owns vertical scroll (header + body). */
  embedInParentScroll?: boolean;
  /** RBAC-filtered fiscal tabs to mount. */
  visibleTabs?: readonly { id: FinanceSubTab; label: string }[];
  /** Cash kanban columns (customers / suppliers / garage / drivers). */
  kanbanVisibleColumns?: readonly (
    | "customers"
    | "suppliers"
    | "garage"
    | "drivers"
  )[];
  profileImages: Record<string, string>;
  linkedOrgDisplayMap: Record<string, LinkedOrgDisplay>;
  tripFinanceAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
}
