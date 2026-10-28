/**
 * Supplier Profile Hub — Metronic tabbed layout mirroring ClientProfileHub.
 * Tabs: Overview · KYC · Compliance · Contracts · Fleet · Drivers ·
 *        Warehouses · Performance · Finance · Timeline
 */
import {
  SupplierProfileCompliancePanel,
  SupplierProfileContractsPanel,
  SupplierProfileDriversPanel,
  SupplierProfileFinancePanel,
  SupplierProfileFleetPanel,
  SupplierProfileKycPanel,
  SupplierProfileOverviewPanel,
  SupplierProfilePerformancePanel,
  SupplierProfileTimelinePanel,
  SupplierProfileWarehousesPanel,
} from "@/features/suppliers/components/desktop/SupplierProfilePanels";
import {
  METRONIC,
  hubStyles as styles,
  supplierStyles,
} from "@/features/suppliers/components/desktop/supplierProfileHub.styles";
import {
  type SupplierManagementBundle,
  type SupplierProfileTab,
  type SupplierKycDocType,
  SUPPLIER_KYC_DOC_LABELS,
} from "@/features/suppliers/types/supplierManagement.types";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import {
  PartyProfileCompactChrome,
  publicEntityToChromeModel,
} from "@/features/party/components/PartyProfileCompactChrome";
import { supplierToPublicEntity } from "@/features/public-profile/mappers";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { SupplierProfileHubHero } from "@/features/suppliers/components/desktop/SupplierProfileHubHero";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { ROUTES } from "@/lib/routes";
import { EditSupplierModal } from "@/features/suppliers/components/EditSupplierModal";
import { getLinkedOrgProfileForSupplier, updateSupplier } from "@/features/suppliers/services/suppliers.service";
import {
  pickAndUploadSupplierKycDocument,
  notifySupplierKycUser,
} from "@/features/suppliers/utils/supplierKycUpload.util";
import { getSupplierTripCount } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FileText, Plus } from "lucide-react-native";

type SupplierSidebarProps = {
  bundle: SupplierManagementBundle;
  kycScore: number;
  perfScore: number;
  onTabChange: (tab: SupplierProfileTab) => void;
  onEdit?: () => void;
};

function SupplierPartyDetailSidebar({ bundle, kycScore, perfScore, onTabChange, onEdit }: SupplierSidebarProps) {
  const router = useRouter();
  const { can: canSurface } = useMemberAccess();
  const canCreateTrip =
    canSurface("tripops.trips.create_asset") ||
    canSurface("tripops.trips.create_aggregate");
  const { supplier } = bundle;
  const isIntegrated = supplier.supplier_type === "integrated" || Boolean(supplier.linked_organization_id);
  const isVerified = supplier.is_verified;
  const address = supplier.address?.trim() || null;
  const phone = supplier.phone?.trim() || null;
  const email = supplier.email?.trim() || null;
  const contactPerson = supplier.contact_person?.trim() || null;

  const onboardingStatus = supplier.onboarding_agreement_status;
  const onboardingSignedAt = supplier.onboarding_agreement_signed_at;
  const vehicleTypes = supplier.vehicle_types;
  const operatingAreas = supplier.operating_areas;

  const integrationLabel = isIntegrated ? "INTEGRATED" : (supplier.supplier_type ?? "OFFLINE").toUpperCase();
  const integrationBg = isIntegrated ? "#E8FFF3" : "#F1F1F4";
  const integrationColor = isIntegrated ? "#50CD89" : METRONIC.subtle;

  const onboardBg =
    onboardingStatus === "signed" ? "#E8FFF3" :
    onboardingStatus === "expired" || onboardingStatus === "terminated" ? "#FFF1F2" :
    "#FFF8DD";
  const onboardColor =
    onboardingStatus === "signed" ? "#50CD89" :
    onboardingStatus === "expired" || onboardingStatus === "terminated" ? "#F1416C" :
    "#F6C000";

  const kycBg = kycScore >= 80 ? "#E8FFF3" : kycScore >= 50 ? "#FFF8DD" : "#FFF1F2";
  const kycColor = kycScore >= 80 ? "#50CD89" : kycScore >= 50 ? "#F6C000" : "#F1416C";

  return (
    <View>
      {/* Highlights */}
      <View style={supplierStyles.sidebarCard}>
        <Text style={supplierStyles.sidebarCardTitle}>Highlights</Text>
        <View style={supplierStyles.sidebarKvRow}>
          <Text style={supplierStyles.sidebarKvLabel}>Type</Text>
          <View style={[supplierStyles.sidebarBadge, { backgroundColor: integrationBg }]}>
            <Text style={[supplierStyles.sidebarBadgeText, { color: integrationColor }]}>{integrationLabel}</Text>
          </View>
        </View>
        <View style={supplierStyles.sidebarKvRow}>
          <Text style={supplierStyles.sidebarKvLabel}>Verified</Text>
          <View style={[supplierStyles.sidebarBadge, { backgroundColor: isVerified ? "#E8FFF3" : "#F1F1F4" }]}>
            <Text style={[supplierStyles.sidebarBadgeText, { color: isVerified ? "#50CD89" : METRONIC.muted }]}>
              {isVerified ? "YES" : "NO"}
            </Text>
          </View>
        </View>
        <View style={supplierStyles.sidebarKvRow}>
          <Text style={supplierStyles.sidebarKvLabel}>KYC</Text>
          <View style={[supplierStyles.sidebarBadge, { backgroundColor: kycBg }]}>
            <Text style={[supplierStyles.sidebarBadgeText, { color: kycColor }]}>{kycScore}%</Text>
          </View>
        </View>
        {perfScore > 0 ? (
          <View style={supplierStyles.sidebarKvRow}>
            <Text style={supplierStyles.sidebarKvLabel}>Score</Text>
            <Text style={supplierStyles.sidebarKvValue}>{perfScore}</Text>
          </View>
        ) : null}
        {address ? (
          <View style={supplierStyles.sidebarKvRow}>
            <Text style={supplierStyles.sidebarKvLabel}>Location</Text>
            <Text style={supplierStyles.sidebarKvValue} numberOfLines={2}>{address}</Text>
          </View>
        ) : null}
        {vehicleTypes && vehicleTypes.length > 0 ? (
          <View style={supplierStyles.sidebarKvRow}>
            <Text style={supplierStyles.sidebarKvLabel}>Vehicles</Text>
            <Text style={supplierStyles.sidebarKvValue} numberOfLines={1}>{vehicleTypes.join(", ")}</Text>
          </View>
        ) : null}
        {operatingAreas && operatingAreas.length > 0 ? (
          <View style={supplierStyles.sidebarKvRow}>
            <Text style={supplierStyles.sidebarKvLabel}>Areas</Text>
            <Text style={supplierStyles.sidebarKvValue} numberOfLines={1}>{operatingAreas.slice(0, 3).join(", ")}</Text>
          </View>
        ) : null}
      </View>

      {/* Onboarding */}
      <View style={supplierStyles.sidebarCard}>
        <Text style={supplierStyles.sidebarCardTitle}>Onboarding</Text>
        <View style={supplierStyles.sidebarKvRow}>
          <Text style={supplierStyles.sidebarKvLabel}>Agreement</Text>
          {onboardingStatus ? (
            <View style={[supplierStyles.sidebarBadge, { backgroundColor: onboardBg }]}>
              <Text style={[supplierStyles.sidebarBadgeText, { color: onboardColor }]}>{onboardingStatus.toUpperCase()}</Text>
            </View>
          ) : (
            <Text style={[supplierStyles.sidebarKvValue, { color: METRONIC.muted }]}>Not started</Text>
          )}
        </View>
        {onboardingSignedAt ? (
          <View style={supplierStyles.sidebarKvRow}>
            <Text style={supplierStyles.sidebarKvLabel}>Signed</Text>
            <Text style={supplierStyles.sidebarKvValue}>{onboardingSignedAt.slice(0, 10)}</Text>
          </View>
        ) : null}
        <Pressable style={supplierStyles.sidebarActionBtn} onPress={() => onTabChange("compliance")} accessibilityRole="button">
          <FileText size={13} color={METRONIC.text} strokeWidth={2} />
          <Text style={supplierStyles.sidebarActionBtnText}>Compliance docs ({bundle.compliance_docs.length})</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={supplierStyles.sidebarCard}>
        <Text style={supplierStyles.sidebarCardTitle}>Actions</Text>
        {canCreateTrip ? (
          <Pressable
            style={[supplierStyles.sidebarActionBtn, supplierStyles.sidebarActionBtnPrimary]}
            onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
          >
            <Plus size={13} color="#fff" strokeWidth={2.5} />
            <Text style={[supplierStyles.sidebarActionBtnText, supplierStyles.sidebarActionBtnTextPrimary]}>Create trip</Text>
          </Pressable>
        ) : null}
        <Pressable style={supplierStyles.sidebarActionBtn} onPress={() => onTabChange("contracts")} accessibilityRole="button">
          <FileText size={13} color={METRONIC.text} strokeWidth={2} />
          <Text style={supplierStyles.sidebarActionBtnText}>Contracts ({bundle.contracts.length})</Text>
        </Pressable>
        <Pressable style={supplierStyles.sidebarActionBtn} onPress={() => onTabChange("finance")} accessibilityRole="button">
          <Text style={[supplierStyles.sidebarActionBtnText, { fontSize: 13 }]}>₹</Text>
          <Text style={supplierStyles.sidebarActionBtnText}>Ledger</Text>
        </Pressable>
        {onEdit ? (
          <Pressable style={[supplierStyles.sidebarActionBtn, { marginBottom: 0 }]} onPress={onEdit} accessibilityRole="button">
            <Text style={supplierStyles.sidebarActionBtnText}>Edit Profile</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Contact */}
      {(contactPerson || phone || email) ? (
        <View style={supplierStyles.sidebarCard}>
          <Text style={supplierStyles.sidebarCardTitle}>Contact</Text>
          {contactPerson ? (
            <View style={supplierStyles.sidebarKvRow}>
              <Text style={supplierStyles.sidebarKvLabel}>Name</Text>
              <Text style={supplierStyles.sidebarKvValue} numberOfLines={1}>{contactPerson}</Text>
            </View>
          ) : null}
          {phone ? (
            <Pressable style={supplierStyles.sidebarKvRow} onPress={() => void Linking.openURL(`tel:${phone}`)}>
              <Text style={supplierStyles.sidebarKvLabel}>Phone</Text>
              <Text style={[supplierStyles.sidebarKvValue, { color: METRONIC.link }]} numberOfLines={1}>{phone}</Text>
            </Pressable>
          ) : null}
          {email ? (
            <Pressable style={supplierStyles.sidebarKvRow} onPress={() => void Linking.openURL(`mailto:${email}`)}>
              <Text style={supplierStyles.sidebarKvLabel}>Email</Text>
              <Text style={[supplierStyles.sidebarKvValue, { color: METRONIC.link }]} numberOfLines={1}>{email}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const TABS: { id: SupplierProfileTab; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "kyc",         label: "KYC" },
  { id: "compliance",  label: "Compliance" },
  { id: "contracts",   label: "Contracts" },
  { id: "fleet",       label: "Fleet" },
  { id: "drivers",     label: "Drivers" },
  { id: "warehouses",  label: "Warehouses" },
  { id: "performance", label: "Performance" },
  { id: "finance",     label: "Finance" },
  { id: "timeline",    label: "Timeline" },
];

type Props = {
  bundle: SupplierManagementBundle;
  initialTab?: SupplierProfileTab;
  onBack?: () => void;
  onRefresh?: () => void;
};

export function SupplierProfileHub({
  bundle,
  initialTab = "overview",
  onBack,
  onRefresh,
}: Props) {
  const _router = useRouter();
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const { can: canSurface } = useMemberAccess();
  const canEditSupplier = canSurface("sales.suppliers.edit");
  const [tab, setTab] = useState<SupplierProfileTab>(initialTab);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const { supplier, trips, kyc_documents, performance } = bundle;
  const { data: exactTripCount } = useQuery({
    queryKey: queryKeys.trips.partyCount(
      supplier.organization_id,
      "supplier",
      supplier.id,
    ),
    queryFn: async () => {
      const res = await getSupplierTripCount(supplier.organization_id, supplier.id);
      if (res.error) throw res.error;
      return res.count;
    },
    enabled: Boolean(supplier.organization_id && supplier.id),
    staleTime: 60_000,
  });
  const totalTripCount = exactTripCount ?? trips.length;
  const displayName =
    (supplier.name || supplier.company_name || supplier.contact_person || "Supplier").trim();
  const isIntegrated =
    supplier.supplier_type === "integrated" || Boolean(supplier.linked_organization_id);
  const kycTotal = kyc_documents.length;
  const kycVerified = kyc_documents.filter((d) => d.status === "verified").length;
  const kycScore = kycTotal > 0 ? Math.round((kycVerified / kycTotal) * 100) : 0;
  const perfScore = performance?.overall_score ?? 0;

  const handleUploadDoc = (type: SupplierKycDocType) => {
    void (async () => {
      const result = await pickAndUploadSupplierKycDocument({
        orgId: supplier.organization_id,
        supplierId: supplier.id,
        docType: type,
        docLabel: SUPPLIER_KYC_DOC_LABELS[type],
        isMandatory: true,
      });
      if (result.status === "cancelled") return;
      if (result.status === "error") {
        notifySupplierKycUser("Upload failed", result.error.message);
        return;
      }
      onRefresh?.();
    })();
  };

  const orgId = supplier.organization_id;
  const sharedProps = { bundle, orgId, supplierId: supplier.id, onRefresh };

  const panel = (() => {
    switch (tab) {
      case "overview":
        return (
          <SupplierProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={supplier.linked_organization_id}
            totalTripCount={totalTripCount}
            onImportFromProfile={isIntegrated && supplier.linked_organization_id ? async () => {
              const { error, profile } = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id!);
              if (error || !profile) return;
              const patch: Parameters<typeof updateSupplier>[2] = {
                company_name: profile.organizationName || undefined,
                contact_person: profile.contactPerson || undefined,
                phone: profile.phone || undefined,
                email: profile.email || undefined,
              };
              if (profile.gstin && !supplier.gstin) patch.gstin = profile.gstin;
              if (profile.address && !supplier.address) patch.address = profile.address;
              await updateSupplier(orgId, supplier.id, patch);
              onRefresh?.();
            } : undefined}
          />
        );
      case "kyc":
        return <SupplierProfileKycPanel {...sharedProps} onUploadDoc={handleUploadDoc} />;
      case "compliance":
        return <SupplierProfileCompliancePanel {...sharedProps} />;
      case "contracts":
        return <SupplierProfileContractsPanel {...sharedProps} />;
      case "fleet":
        return <SupplierProfileFleetPanel {...sharedProps} />;
      case "drivers":
        return <SupplierProfileDriversPanel bundle={bundle} />;
      case "warehouses":
        return <SupplierProfileWarehousesPanel {...sharedProps} />;
      case "performance":
        return <SupplierProfilePerformancePanel bundle={bundle} />;
      case "finance":
        return <SupplierProfileFinancePanel bundle={bundle} />;
      case "timeline":
        return <SupplierProfileTimelinePanel bundle={bundle} />;
      default:
        return (
          <SupplierProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={supplier.linked_organization_id}
            totalTripCount={totalTripCount}
            onImportFromProfile={isIntegrated && supplier.linked_organization_id ? async () => {
              const { error, profile } = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id!);
              if (error || !profile) return;
              const patch: Parameters<typeof updateSupplier>[2] = {
                company_name: profile.organizationName || undefined,
                contact_person: profile.contactPerson || undefined,
                phone: profile.phone || undefined,
                email: profile.email || undefined,
              };
              if (profile.gstin && !supplier.gstin) patch.gstin = profile.gstin;
              if (profile.address && !supplier.address) patch.address = profile.address;
              await updateSupplier(orgId, supplier.id, patch);
              onRefresh?.();
            } : undefined}
          />
        );
    }
  })();

  const chromeModel = useMemo(
    () => publicEntityToChromeModel(supplierToPublicEntity(supplier)),
    [supplier],
  );

  const hubScroll = (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        compact && mobile.scrollContentCompact,
        { paddingBottom: layoutInsets.scrollBottomPadding(compact ? 16 : 24) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {compact ? (
        <PartyProfileCompactChrome
          model={chromeModel}
          onBack={onBack}
        />
      ) : (
        <SupplierProfileHubHero
          supplier={supplier}
          totalTrips={totalTripCount}
          totalPayable={0}
          kycScore={kycScore}
          performanceScore={perfScore}
          onBack={onBack}
        />
      )}

      <View style={[styles.tabBar, compact && mobile.tabBarCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={compact ? mobile.tabScrollCompact : styles.tabScroll}
          contentContainerStyle={compact ? mobile.tabScrollContentCompact : styles.tabScrollContent}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                style={[styles.tabBtn, compact && mobile.tabBtnCompact, active && styles.tabBtnActive]}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, compact && mobile.tabTextCompact, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

      </View>

      {compact ? panel : (
        <View style={supplierStyles.hubBodyRow}>
          <View style={supplierStyles.hubSidebarCol}>
            <SupplierPartyDetailSidebar
              bundle={bundle}
              kycScore={kycScore}
              perfScore={perfScore}
              onTabChange={setTab}
              onEdit={canEditSupplier ? () => setEditOpen(true) : undefined}
            />
          </View>
          <View style={supplierStyles.hubMainCol}>
            {panel}
          </View>
        </View>
      )}
    </ScrollView>
  );

  return (
    <>
      {hubScroll}
      <EditSupplierModal
        visible={editOpen && canEditSupplier}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSave={async (patch) => {
          await updateSupplier(supplier.organization_id, supplier.id, patch);
          setEditOpen(false);
          onRefresh?.();
        }}
      />
    </>
  );
}
