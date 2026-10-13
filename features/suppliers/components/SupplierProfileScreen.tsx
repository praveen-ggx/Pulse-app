/**
 * Full-screen partner profile — CounterpartyProfileSystemCard (matches customer party page).
 */
import {
  CounterpartyProfileSystemCard,
  type ProfileContract,
  type ProfileWarehouse,
} from "@/components/CounterpartyProfileSystemCard";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSupplierManagementBundleQuery } from "@/features/suppliers/hooks/useSupplierManagementBundleQuery";
import { readSupplierPrimaryRegion } from "@/features/suppliers/services/suppliers.service";
import type { SupplierManagementBundle } from "@/features/suppliers/types/supplierManagement.types";
import { mapSupplierVerificationVaultDocs } from "@/features/suppliers/utils/supplierVerificationVault.util";
import { SupplierVendorOnboardingVault } from "@/features/suppliers/components/vendor-onboarding/SupplierVendorOnboardingVault";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { formatINR } from "@/lib/format";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  supplierId: string;
  onBack: () => void;
};

function mapWarehouses(bundle: SupplierManagementBundle): ProfileWarehouse[] {
  return bundle.warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    address: [w.address, w.city, w.state, w.pincode].filter(Boolean).join(", ") || "—",
    phone: w.contact_number,
  }));
}

function mapContracts(bundle: SupplierManagementBundle): ProfileContract[] {
  const rows: ProfileContract[] = [];
  for (const contract of bundle.contracts) {
    for (const lane of contract.lane_rates ?? []) {
      rows.push({
        id: lane.id,
        pickup: lane.origin,
        destination: lane.destination,
        price: Number(lane.rate) || 0,
        pricingType: contract.rate_type === "per_ton" ? "per_ton" : "per_trip",
        vehicleType: lane.vehicle_type,
      });
    }
  }
  return rows;
}

export function SupplierProfileScreen({ supplierId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { can: canSurface } = useMemberAccess();
  const bundleQ = useSupplierManagementBundleQuery(orgId, supplierId);

  const bundle = bundleQ.data;
  const supplier = bundle?.supplier;

  const warehouses = useMemo(
    () => (bundle ? mapWarehouses(bundle) : []),
    [bundle],
  );
  const contracts = useMemo(
    () => (bundle ? mapContracts(bundle) : []),
    [bundle],
  );
  const kycDocs = useMemo(
    () => mapSupplierVerificationVaultDocs(bundle?.kyc_documents ?? []),
    [bundle],
  );
  const networkTrustLabel = useMemo(() => {
    if (!bundle) return "—";
    const total = bundle.kyc_documents.length;
    if (total === 0) return "—";
    const verified = bundle.kyc_documents.filter((d) => d.status === "verified").length;
    return `${Math.round((verified / total) * 100)}%`;
  }, [bundle]);

  const volumeLabel = useMemo(() => {
    const trips = bundle?.trips ?? [];
    const spend = trips.reduce((s, t) => s + (Number(t.supplier_rate) || 0), 0);
    return spend > 0 ? formatINR(spend) : "—";
  }, [bundle]);

  if (!orgId || bundleQ.isLoading) return <CenteredLoadingView />;
  if (bundleQ.isError || !bundle || !supplier) {
    return (
      <ContentErrorState
        variant="generic"
        message={
          bundleQ.error instanceof Error
            ? bundleQ.error.message
            : "Supplier not found"
        }
        onRetry={() => void bundleQ.refetch()}
      />
    );
  }

  const displayName =
    (supplier.name || supplier.company_name || supplier.contact_person || "Partner").trim();
  const isIntegrated =
    supplier.supplier_type === "integrated" || Boolean(supplier.linked_organization_id);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Theme.screenBackground,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <CounterpartyProfileSystemCard
        visible
        presentation="page"
        profileTitle="Partner Profile"
        type="supplier"
        organizationName={displayName}
        adminName={supplier.contact_person}
        email={supplier.email}
        phone={supplier.phone}
        gstNumber={supplier.gstin}
        panNumber={supplier.pan_number}
        billingAddress={supplier.address}
        primaryRegion={readSupplierPrimaryRegion(supplier)}
        gridVolumeLabel={volumeLabel}
        networkTrustLabel={networkTrustLabel}
        isIntegrated={isIntegrated}
        entityDisplayId={supplier.id?.slice(0, 8) ?? null}
        warehouses={warehouses}
        contracts={contracts}
        kycDocs={kycDocs}
        organizationId={orgId}
        supplierId={supplierId}
        supplierVaultSlot={
          orgId && supplierId ? (
            <SupplierVendorOnboardingVault
              organizationId={orgId}
              supplierId={supplierId}
              canEdit={canSurface("sales.suppliers.edit")}
            />
          ) : undefined
        }
        onClose={onBack}
        onEditPress={() => {}}
        onProfileEntitiesChange={() => bundleQ.refetch()}
      />
    </View>
  );
}
