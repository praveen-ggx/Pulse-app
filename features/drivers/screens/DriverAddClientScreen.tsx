/**
 * DCO Self — pick a saved shipper / middleman, or add a new one.
 * Selecting an existing party tags the trip and does not open the create form.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DetailPageLayout } from "@/components/DetailPageLayout";
import { EntityAvatar } from "@/components/EntityAvatar";
import {
  EMPTY_DRIVER_PARTY_AVATAR,
  resolveClientPartyAvatarMap,
  type DriverPartyAvatarFields,
} from "@/features/drivers/utils/driverPartyAvatar.util";
import {
  AddClientModal,
  type AddClientFormData,
} from "@/features/clients/components/AddClientModal";
import { createClient, getClientsByOrganization } from "@/features/clients/services/clients.service";
import {
  createConnectionRequest,
  getConnectionInviteeByPhone,
} from "@/features/connections/services/connectionRequests.service";
import { DriverTagPartyDialogs } from "@/features/drivers/components/DriverTagPartyDialogs";
import {
  listDriverOfflineParties,
  rememberDriverOfflineParty,
} from "@/features/drivers/offline/driverOfflineParty";
import { tagTripWithDcoClient } from "@/features/drivers/services/driverTripClient.service";
import {
  ensureDcoWorkspace,
  getOrganizationsForUser,
} from "@/features/organization/services/organization.service";
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Theme from "@/constants/Theme";
import { tripReceivableBilled } from "@/features/drivers/utils/driverPartyReceivables.util";
import {
  partyMatchesAssigner,
  sortTagPartyOptions,
  tagPartyListDetail,
} from "@/features/drivers/utils/driverPartyTagRecommend.util";
import { queryKeys } from "@/lib/queryKeys";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
import { useTripDetailQuery } from "@/lib/queries/useTripsQuery";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import type { CurrentOrganization } from "@/types/organization";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const DCO_NO_WORKSPACE =
  "Could not open your shipper book. Refresh, or finish DCO approval if it is still pending.";

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export default function DriverAddClientScreen() {
  const onBack = useSafeBack(ROUTES.driverWalletSelf());
  const { canAddDcoShippers, canTagOfflineParty, isDco, isLoading: modeLoading } =
    useDriverOperatingModeQuery();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tripId?: string; partyName?: string }>();
  const tripId = param(params.tripId);
  const partyName = param(params.partyName);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<CurrentOrganization | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [existingParties, setExistingParties] = useState<
    Array<{
      id: string;
      name: string;
      phone?: string | null;
      contactPerson?: string | null;
      linkedOrganizationId?: string | null;
      avatar?: DriverPartyAvatarFields;
    }>
  >([]);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingParty, setPendingParty] = useState<{ id: string; name: string } | null>(null);
  const [receivableParty, setReceivableParty] = useState<{
    id: string;
    name: string;
    phone?: string | null;
    contactPerson?: string | null;
    linkedOrganizationId?: string | null;
    avatar?: DriverPartyAvatarFields;
  } | null>(null);
  const [receivableAmount, setReceivableAmount] = useState("");
  const [billedForTag, setBilledForTag] = useState<number | null>(null);
  const [successParty, setSuccessParty] = useState<{ id: string; name: string } | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState(false);
  const tripQuery = useTripDetailQuery(tripId || null);
  const currentBilled = useMemo(
    () => (tripQuery.data ? tripReceivableBilled(tripQuery.data) : 0),
    [tripQuery.data],
  );
  const beginTag = useCallback(
    (row: {
      id: string;
      name: string;
      phone?: string | null;
      contactPerson?: string | null;
      linkedOrganizationId?: string | null;
      avatar?: DriverPartyAvatarFields;
    }) => {
      setBilledForTag(null);
      setPendingParty(null);
      setReceivableParty(row);
      setReceivableAmount(currentBilled > 0 ? String(currentBilled) : "");
    },
    [currentBilled],
  );

  const loadOrg = useCallback(async () => {
    if (modeLoading) {
      return;
    }
    if (!canTagOfflineParty) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setWorkspaceError(null);
    try {
      let ensureError: Error | null = null;
      let next: CurrentOrganization | null = null;
      if (canAddDcoShippers) {
        const ensured = await ensureDcoWorkspace();
        ensureError = ensured.error ?? null;
        next = ensured.organization?.id ? ensured.organization : null;
      }
      const workspaceUnavailable = /not enabled on this environment|cannot create your shipper book/i.test(
        ensureError?.message ?? "",
      );
      if (!next?.id && !workspaceUnavailable) {
        const { organizations, error: listError } = await getOrganizationsForUser();
        next = organizations[0] ?? null;
        if (!next?.id) {
          setOrg(null);
          const softUnavailable = /not enabled on this environment|cannot create your shipper book/i.test(
            ensureError?.message ?? "",
          );
          setWorkspaceError(
            softUnavailable
              ? null
              : ensureError?.message ?? listError?.message ?? DCO_NO_WORKSPACE,
          );
          const local = await listDriverOfflineParties();
          setExistingParties(
            local.map((row) => ({
              id: row.id,
              name: row.name,
              phone: row.phone,
            })),
          );
          return;
        }
      }
      if (!next?.id) {
        // Offline Self tagging still works without a server workspace.
        // Do not block the picker with a red environment banner.
        setOrg(null);
        setWorkspaceError(null);
        const local = await listDriverOfflineParties();
        setExistingParties(
          local.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
          })),
        );
        return;
      }
      setOrg(next);
      const [{ clients: rows }, local] = await Promise.all([
        getClientsByOrganization(next.id),
        listDriverOfflineParties(),
      ]);
      const avatars = rows.length ? await resolveClientPartyAvatarMap(rows) : {};
      const serverRows = rows.map((row) => ({
        id: row.id,
        name: row.name || row.contact_person || "Shipper",
        phone: row.phone,
        contactPerson: row.contact_person,
        linkedOrganizationId: row.linked_organization_id,
        avatar: avatars[row.id] ?? EMPTY_DRIVER_PARTY_AVATAR,
      }));
      const serverIds = new Set(serverRows.map((row) => row.id));
      setExistingParties([
        ...local
          .filter((row) => !serverIds.has(row.id))
          .map((row) => ({ id: row.id, name: row.name, phone: row.phone })),
        ...serverRows,
      ]);
    } finally {
      setLoading(false);
    }
  }, [canAddDcoShippers, canTagOfflineParty, modeLoading]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (!modeLoading && !canTagOfflineParty) onBack();
  }, [modeLoading, canTagOfflineParty, onBack]);

  const matchingSavedParty = useMemo(() => {
    const key = partyName.trim().toLowerCase();
    if (!key) return null;
    return (
      existingParties.find((row) => row.name.trim().toLowerCase() === key) ?? null
    );
  }, [existingParties, partyName]);

  const sortedExistingParties = useMemo(
    () =>
      sortTagPartyOptions(
        existingParties.map((row) => ({
          ...row,
          matchesAssigner: partyMatchesAssigner(row.name, partyName),
        })),
        !isDco,
      ),
    [existingParties, isDco, partyName],
  );

  const finishWithClient = useCallback(
    async (client: { id: string; name: string }, billed?: number | null) => {
      if (!tripId) return { error: null as Error | null };
      const { error } = await tagTripWithDcoClient(
        tripId,
        client,
        billed != null && billed > 0 ? { billed } : undefined,
      );
      if (error) return { error };
      await queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      return { error: null as Error | null };
    },
    [queryClient, tripId],
  );

  const handleClose = useCallback(() => {
    onBack();
  }, [onBack]);

  const handlePickExisting = useCallback((row: { id: string; name: string }) => {
    if (pickingId) return;
    setWorkspaceError(null);
    beginTag(row);
  }, [beginTag, pickingId]);

  const handleConfirmTag = useCallback(async () => {
    if (!pendingParty || pickingId) return;
    setPickingId(pendingParty.id);
    try {
      const { error } = await finishWithClient(pendingParty, billedForTag);
      if (error) {
        setWorkspaceError(error.message);
        setPendingParty(null);
        return;
      }
      setSuccessParty(pendingParty);
      setPendingParty(null);
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : String(e));
      setPendingParty(null);
    } finally {
      setPickingId(null);
    }
  }, [billedForTag, finishWithClient, pendingParty, pickingId]);

  const handleComplete = useCallback(
    async (data: AddClientFormData) => {
      const displayName =
        data.organizationName?.trim() || data.contactPerson?.trim() || "Party";

      if (!org?.id) {
        const local = await rememberDriverOfflineParty({
          name: displayName,
          phone: data.phone,
        });
        const created = { id: local.id, name: local.name };
        setExistingParties((prev) =>
          prev.some((row) => row.id === created.id)
            ? prev
            : [created, ...prev],
        );
        setCreatedSuccess(true);
        if (tripId) {
          beginTag({ ...created, phone: data.phone, contactPerson: data.contactPerson });
        } else {
          const tagged = await finishWithClient(created);
          if (tagged.error) throw tagged.error;
          setSuccessParty(created);
        }
        return;
      }

      const { error, client } = await createClient(org.id, {
        contact_person: data.contactPerson,
        phone: data.phone,
        organization_name: data.organizationName || undefined,
      });
      if (error) throw error;
      if (client?.id) {
        const created = {
          id: client.id,
          name: client.name || data.organizationName || data.contactPerson,
        };
        setCreatedSuccess(true);
        if (tripId) {
          beginTag({
            ...created,
            phone: data.phone,
            contactPerson: data.contactPerson,
          });
        } else {
          const tagged = await finishWithClient(created);
          if (tagged.error) throw tagged.error;
          setSuccessParty(created);
        }
      }
      await queryClient.refetchQueries({ queryKey: queryKeys.clients.all(org.id) });
    },
    [beginTag, finishWithClient, org?.id, queryClient, tripId],
  );

  const searchInviteeByPhone = useCallback(
    async (phone: string) => {
      if (!org?.id) return null;
      const { error, invitee } = await getConnectionInviteeByPhone(phone, org.id);
      if (error || !invitee) return null;
      return {
        organization_id: invitee.organization_id,
        full_name: invitee.full_name,
        phone: invitee.phone,
        organization_name: invitee.organization_name,
        profile_company_name: invitee.profile_company_name,
        profile_role: invitee.profile_role,
      };
    },
    [org?.id],
  );

  const handleSendInvitation = useCallback(
    async (toOrgId: string) => {
      if (!org?.id) throw new Error(workspaceError ?? DCO_NO_WORKSPACE);
      const { error } = await createConnectionRequest(org.id, toOrgId, {
        requestShipperClient: true,
        requestCarrierSupplier: false,
      });
      if (error) throw error;
    },
    [org?.id, workspaceError],
  );

  const closeCreateForm = useCallback(() => {
    if (tripId && showCreate && existingParties.length > 0) {
      setShowCreate(false);
      return;
    }
    handleClose();
  }, [existingParties.length, handleClose, showCreate, tripId]);

  const createForm = (
    <AddClientModal
      onClose={closeCreateForm}
      onComplete={handleComplete}
      organizationId={org?.id ?? null}
      noOrganizationMessage={
        org?.id
          ? null
          : workspaceError && !/not enabled on this environment/i.test(workspaceError)
            ? workspaceError
            : null
      }
      allowOfflineWithoutOrganization={!org?.id}
      onRefreshOrganization={loadOrg}
      searchInviteeByPhone={searchInviteeByPhone}
      onSendInvitation={handleSendInvitation}
      successEntity="client"
      initialOrganizationName={matchingSavedParty ? "" : partyName}
      showSuccessOnComplete={!tripId}
      existingParties={sortedExistingParties}
      onSelectExistingParty={handlePickExisting}
      existingPartyBusyId={pickingId}
    />
  );

  const dialogs = (
    <DriverTagPartyDialogs
      pendingName={pendingParty?.name ?? null}
      confirming={!!pickingId}
      successName={successParty?.name ?? null}
      created={createdSuccess}
      billedAmount={billedForTag}
      receivable={
        receivableParty
          ? {
              partyName: receivableParty.name,
              amount: receivableAmount,
              subtitle: tagPartyListDetail({
                phone: receivableParty.phone,
                contactPerson: receivableParty.contactPerson,
                linkedOrganizationId: receivableParty.linkedOrganizationId,
              }),
              avatarUrl: receivableParty.avatar?.avatarUrl,
              avatarSeed: receivableParty.avatar?.avatarSeed,
              organizationImageUrl: receivableParty.avatar?.organizationImageUrl,
              organizationAvatarSeed: receivableParty.avatar?.organizationAvatarSeed,
              isIntegrated: receivableParty.avatar?.isIntegrated,
            }
          : null
      }
      onChangeReceivableAmount={setReceivableAmount}
      onCancelReceivable={() => {
        setReceivableParty(null);
        setReceivableAmount("");
        setCreatedSuccess(false);
      }}
      onContinueReceivable={(value) => {
        if (!receivableParty) return;
        const amount = Math.round(Number(String(value ?? receivableAmount).replace(/,/g, "")) || 0);
        if (amount <= 0) return;
        setReceivableAmount(String(amount));
        setBilledForTag(amount);
        setPendingParty(receivableParty);
      }}
      onBackConfirm={() => {
        setPendingParty(null);
      }}
      onCancelConfirm={() => {
        setPendingParty(null);
        setBilledForTag(null);
      }}
      onConfirm={() => void handleConfirmTag()}
      onSuccessOk={() => {
        setSuccessParty(null);
        setCreatedSuccess(false);
        setBilledForTag(null);
        handleClose();
      }}
    />
  );

  if (modeLoading || !canTagOfflineParty || loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.primary} />;
  }

  if (!tripId) {
    return createForm;
  }

  if (showCreate || existingParties.length === 0) {
    return (
      <>
        {createForm}
        {dialogs}
      </>
    );
  }

  return (
    <>
    <DetailPageLayout title="Select party" onBack={onBack} titleAlign="left">
      <Text style={styles.kicker}>Saved in Self</Text>
      <Text style={styles.hint}>
        Tap a party to tag this trip. Details are already on file — only add a new
        party if they are not in this list.
      </Text>
      {workspaceError ? <Text style={styles.error}>{workspaceError}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sortedExistingParties.map((row) => {
          const busy = pickingId === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              style={[styles.row, busy && styles.rowBusy]}
              onPress={() => void handlePickExisting(row)}
              disabled={!!pickingId}
              accessibilityRole="button"
              accessibilityLabel={`Select ${row.name}`}
            >
              <EntityAvatar
                name={row.name}
                initialsColorSeed={row.id}
                avatarUrl={row.avatar?.avatarUrl}
                avatarSeed={row.avatar?.avatarSeed}
                organizationImageUrl={row.avatar?.organizationImageUrl}
                organizationAvatarSeed={row.avatar?.organizationAvatarSeed}
                entityType="client"
                isIntegrated={row.avatar?.isIntegrated}
                size={40}
                showIntegrationBadge={false}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {tagPartyListDetail({
                    phone: row.phone,
                    contactPerson: row.contactPerson,
                    linkedOrganizationId: row.linkedOrganizationId,
                    matchesAssigner: row.matchesAssigner,
                    recommendFleet: !isDco,
                  })}
                </Text>
              </View>
              {busy ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <Text style={styles.rowAction}>Select</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowCreate(true)}
        accessibilityRole="button"
        accessibilityLabel="Add new party"
      >
        <Plus size={16} color={Theme.buttonDarkText} strokeWidth={2.3} />
        <Text style={styles.addBtnText}>Add new party</Text>
      </TouchableOpacity>
    </DetailPageLayout>
    {dialogs}
    </>
  );
}

const styles = StyleSheet.create({
  kicker: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 6,
  },
  hint: {
    ...driverBodySecondary,
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  error: {
    ...driverBodySecondary,
    fontSize: 13,
    color: Theme.negative,
    marginBottom: 10,
  },
  list: {
    gap: 8,
    paddingBottom: 16,
  },
  row: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowBusy: {
    opacity: 0.7,
  },
  rowName: {
    ...driverUIBold,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  rowMeta: {
    ...driverBodySecondary,
    marginTop: 2,
    fontSize: 12,
    color: Theme.textMuted,
  },
  rowAction: {
    ...driverUIBold,
    fontSize: 13,
    color: Theme.primary,
  },
  addBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Theme.actionBtnInk,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  addBtnText: {
    ...driverUIBold,
    fontSize: 14,
    color: Theme.buttonDarkText,
  },
});
