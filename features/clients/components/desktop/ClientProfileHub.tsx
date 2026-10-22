/**
 * Client Profile Hub — Access Control–style layout:
 * compact header + full-width underline tabs + edge-to-edge panel
 * (no left rail / no wasted center gutter).
 * Contracts nest under a warehouse; lanes nest under a contract (Warehouses tab).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { ClientProfileOverviewPanel } from "@/features/clients/components/desktop/ClientProfileOverviewPanel";
import { ClientProfileKycPanel } from "@/features/clients/components/desktop/ClientProfileKycPanel";
import {
  ClientProfileContactsPanel,
  ClientProfileFinancePanel,
  ClientProfileVaultPanel,
  ClientProfileWarehousesPanel,
} from "@/features/clients/components/desktop/ClientProfileDataPanels";
import {
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { ClientManagementBundle, ClientProfileTab } from "@/features/clients/types/clientManagement.types";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { computeKycScore } from "@/features/clients/utils/clientManagement.util";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import {
  PartyProfileCompactChrome,
  publicEntityToChromeModel,
} from "@/features/party/components/PartyProfileCompactChrome";
import { clientToPublicEntity } from "@/features/public-profile/mappers";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { EditClientModal } from "@/features/clients/components/EditClientModal";
import { getLinkedOrgProfile, updateClient } from "@/features/clients/services/clients.service";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const TABS: { id: ClientProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "kyc", label: "KYC" },
  { id: "warehouses", label: "Warehouses" },
  { id: "finance", label: "Finance" },
  { id: "vault", label: "Document vault" },
];

type Props = {
  client: ClientRow;
  bundle: ClientManagementBundle;
  initialTab?: ClientProfileTab;
  onBack?: () => void;
  onRefresh?: () => void;
};

function HeaderPill({
  label,
  tone,
}: {
  label: string;
  tone?: "green" | "muted" | "warn" | "link";
}) {
  const bg =
    tone === "green" ? "#E8FFF3" : tone === "warn" ? "#FFF8DD" : tone === "link" ? "#EEF6FF" : "#F1F1F4";
  const color =
    tone === "green" ? "#50CD89" : tone === "warn" ? "#F6C000" : tone === "link" ? METRONIC.link : METRONIC.subtle;
  return (
    <View style={[ac.pill, { backgroundColor: bg }]}>
      <Text style={[ac.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function ClientProfileHub({
  client,
  bundle,
  initialTab = "overview",
  onBack,
  onRefresh,
}: Props) {
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ClientProfileTab>(initialTab);
  const [editOpen, setEditOpen] = useState(false);
  const orgId = String((bundle.client as Record<string, unknown>)?.organization_id ?? client.organization_id ?? "");
  const clientId = client.id;
  const kyc = computeKycScore(bundle.kyc_documents);
  const isIntegrated =
    client.is_integrated ?? Boolean(client.linked_organization_id);
  const status = (client as { client_status?: string | null }).client_status ?? "customer";
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const sharedProps = { bundle, orgId, clientId, onRefresh: onRefresh ?? (() => {}) };

  const overviewImport =
    isIntegrated && client.linked_organization_id
      ? async () => {
          const { error, profile } = await getLinkedOrgProfile(client.linked_organization_id!);
          if (error || !profile) return;
          const patch: Parameters<typeof updateClient>[2] = {
            organization_name: profile.organizationName || undefined,
            contact_person: profile.contactPerson || undefined,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
          };
          if (profile.gstin && !client.gstin) patch.gstin = profile.gstin;
          if (profile.address && !client.address) patch.address = profile.address;
          await updateClient(orgId, clientId, patch);
          onRefresh?.();
        }
      : undefined;

  const panel = (() => {
    switch (tab) {
      case "overview":
        return (
          <ClientProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            clientId={clientId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={client.linked_organization_id}
            onImportFromProfile={overviewImport}
          />
        );
      case "contacts":
        return <ClientProfileContactsPanel {...sharedProps} />;
      case "kyc":
        return (
          <ClientProfileKycPanel
            bundle={bundle}
            onUploadDoc={() =>
              Alert.alert("Upload KYC", "Document upload will connect to storage in the next step.")
            }
          />
        );
      case "warehouses":
      case "contracts":
      case "commercials":
        return <ClientProfileWarehousesPanel {...sharedProps} />;
      case "finance":
        return <ClientProfileFinancePanel {...sharedProps} />;
      case "vault":
        return <ClientProfileVaultPanel bundle={bundle} />;
      default:
        return (
          <ClientProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            clientId={clientId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={client.linked_organization_id}
            onImportFromProfile={overviewImport}
          />
        );
    }
  })();

  const chromeModel = useMemo(
    () => publicEntityToChromeModel(clientToPublicEntity(client)),
    [client],
  );

  const isTabActive = (id: ClientProfileTab) =>
    id === tab || (id === "warehouses" && (tab === "contracts" || tab === "commercials"));

  const displayName = client.name?.trim() || "Client";

  // Desktop: Access Control pattern — header strip + underline tabs + full-bleed body.
  const desktopLayout = (
    <View style={ac.root}>
      <View style={ac.header}>
        {onBack ? (
          <Pressable onPress={onBack} style={ac.backBtn} hitSlop={8} accessibilityRole="button">
            <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
          </Pressable>
        ) : (
          <View style={ac.backBtnPlaceholder} />
        )}

        <View style={ac.headerIdentity}>
          <PartyAvatar
            entityType="client"
            name={displayName}
            avatarUrl={client.avatar_url}
            avatarSeed={client.avatar_seed}
            size={36}
          />
          <View style={ac.headerTextCol}>
            <Text style={ac.headerTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={ac.pillRow}>
              <HeaderPill label="CLIENT" tone="link" />
              <HeaderPill label={isIntegrated ? "INTEGRATED" : "NOT IN APP"} tone={isIntegrated ? "green" : "muted"} />
              <HeaderPill label={status.toUpperCase()} tone="warn" />
              <HeaderPill label={`KYC ${kyc.score}%`} tone={kyc.score >= 80 ? "green" : "warn"} />
            </View>
          </View>
        </View>

        <View style={ac.headerStats}>
          <Text style={ac.headerStat}>{bundle.warehouses.length} WH</Text>
          <Text style={ac.headerStatDot}>·</Text>
          <Text style={ac.headerStat}>{bundle.agreements.length} CTR</Text>
          <Text style={ac.headerStatDot}>·</Text>
          <Text style={ac.headerStat}>{bundle.lane_rates.length} LANES</Text>
        </View>
      </View>

      <View style={ac.tabRow}>
        {TABS.map((t) => {
          const active = isTabActive(t.id);
          return (
            <Pressable
              key={t.id}
              style={[ac.tab, active && ac.tabOn]}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[ac.tabText, active && ac.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={ac.bodyScroll}
        contentContainerStyle={[
          ac.bodyContent,
          { paddingBottom: layoutInsets.scrollBottomPadding(24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {panel}
      </ScrollView>
    </View>
  );

  // Compact / mobile: stacked chrome + horizontal tab bar.
  const compactScroll = (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        mobile.scrollContentCompact,
        { paddingBottom: layoutInsets.scrollBottomPadding(16) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <PartyProfileCompactChrome
        model={chromeModel}
        onBack={onBack}
      />

      <View style={[styles.tabBar, mobile.tabBarCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={mobile.tabScrollCompact}
          contentContainerStyle={mobile.tabScrollContentCompact}
        >
          {TABS.map((t) => {
            const active = isTabActive(t.id);
            return (
              <Pressable
                key={t.id}
                style={[styles.tabBtn, mobile.tabBtnCompact, active && styles.tabBtnActive]}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, mobile.tabTextCompact, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {panel}
    </ScrollView>
  );

  return (
    <>
      {compact ? compactScroll : desktopLayout}
      <EditClientModal
        visible={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
        onSave={async (patch) => {
          await updateClient(orgId, clientId, patch);
          setEditOpen(false);
          await queryClient.invalidateQueries({
            queryKey: queryKeys.clients.all(orgId),
          });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.invoicing.draftClientsRoot,
          });
          onRefresh?.();
        }}
        onSyncLatest={isIntegrated && client.linked_organization_id ? async () => {
          const { error, profile } = await getLinkedOrgProfile(client.linked_organization_id!);
          if (error || !profile) return undefined;
          const patch: Parameters<typeof updateClient>[2] = {
            organization_name: profile.organizationName || undefined,
            contact_person: profile.contactPerson || undefined,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
          };
          if (profile.gstin && !client.gstin) patch.gstin = profile.gstin;
          if (profile.address && !client.address) patch.address = profile.address;
          await updateClient(orgId, clientId, patch);
          onRefresh?.();
          return {
            companyName: profile.organizationName,
            contactPerson: profile.contactPerson,
            phone: profile.phone,
            email: profile.email,
            gstin: profile.gstin ?? undefined,
            address: profile.address ?? undefined,
          };
        } : undefined}
      />
    </>
  );
}

const ac = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
    backgroundColor: Theme.cardWhite,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPlaceholder: { width: 38 },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  headerStat: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.subtle,
    letterSpacing: 0.2,
  },
  headerStatDot: {
    fontSize: 11,
    color: METRONIC.muted,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabOn: {
    borderBottomColor: Theme.accentGold,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSection,
  },
  tabTextOn: {
    color: Theme.textPrimaryDark,
    fontWeight: "800",
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
