/**
 * DCO Self — pick a saved shipper / middleman, or add a new one.
 * Selecting an existing party tags the trip and does not open the create form.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DetailPageLayout } from "@/components/DetailPageLayout";
import { EntityAvatar } from "@/components/EntityAvatar";
import {
  AddClientModal,
  type AddClientFormData,
} from "@/features/clients/components/AddClientModal";
import {
  createConnectionRequest,
  getConnectionInviteeByPhone,
} from "@/features/connections/services/connectionRequests.service";
import { DriverTagPartyDialogs } from "@/features/drivers/components/DriverTagPartyDialogs";
import {
  dcoSelfIssueKey,
  issueDcoSelfReceivable,
  listDcoSelfParties,
  tagDcoSelfTrip,
  upsertDcoSelfParty,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import { useDcoSelfOutboxFlush } from "@/features/dco-self/hooks/useDcoSelfOutboxFlush";
import {
  driverIndieIssueKey,
  issueDriverIndieReceivable,
  listDriverIndieParties,
  tagDriverIndieTrip,
  upsertDriverIndieParty,
} from "@/features/driver-indie/services/driverIndieReceivable.service";
import { useDriverIndieOutboxFlush } from "@/features/driver-indie/hooks/useDriverIndieOutboxFlush";
import { ensureDcoWorkspace } from "@/features/organization/services/organization.service";
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Theme from "@/constants/Theme";
import { tripReceivableBilled } from "@/features/drivers/utils/driverPartyReceivables.util";
import { queryKeys } from "@/lib/queryKeys";
import { driverOfflinePartyBookKicker } from "@/features/drivers/domain/driverOperatingMode";
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
  const {
    canAddDcoShippers,
    canManageDcoSelfBook,
    canManageIndieBook,
    canTagOfflineParty,
    modeLoading,
    operatingMode,
  } = useDriverOperatingModeQuery();
  useDcoSelfOutboxFlush(canManageDcoSelfBook);
  useDriverIndieOutboxFlush(canManageIndieBook);
  const useIndieBook = canManageIndieBook && !canManageDcoSelfBook;
  const partyBookKicker = driverOfflinePartyBookKicker(operatingMode);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tripId?: string; partyName?: string }>();
  const tripId = param(params.tripId);
  const partyName = param(params.partyName);
  // Prefer driver trip detail when opened from Tag Party; wallet Self as last resort.
  const onBack = useSafeBack(
    tripId
      ? (`/driver-trip/${encodeURIComponent(tripId)}` as const)
      : ROUTES.driverWalletSelf(),
  );
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<CurrentOrganization | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [existingParties, setExistingParties] = useState<
    Array<{ id: string; name: string; phone?: string | null }>
  >([]);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingParty, setPendingParty] = useState<{ id: string; name: string } | null>(null);
  const [receivableParty, setReceivableParty] = useState<{ id: string; name: string } | null>(null);
  const [receivableAmount, setReceivableAmount] = useState("");
  const [billedForTag, setBilledForTag] = useState<number | null>(null);
  const [successParty, setSuccessParty] = useState<{ id: string; name: string } | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState(false);
  const tripQuery = useTripDetailQuery(tripId || null);
  const currentBilled = useMemo(() => {
    // Prefill only from an issued receivable — never trip mirrors / client_price.
    if (!tripQuery.data) return null;
    return tripReceivableBilled(tripQuery.data, null);
  }, [tripQuery.data]);
  const isShipperParty = useCallback(
    (name: string) => {
      const keys = [
        partyName,
        String(tripQuery.data?.client_name ?? ""),
      ]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const key = name.trim().toLowerCase();
      return !!key && keys.includes(key);
    },
    [partyName, tripQuery.data?.client_name],
  );
  const beginTag = useCallback(
    (row: { id: string; name: string }) => {
      if (isShipperParty(row.name)) {
        setBilledForTag(null);
        setReceivableParty(null);
        setPendingParty(row);
        return;
      }
      setBilledForTag(null);
      setPendingParty(null);
      setReceivableParty(row);
      setReceivableAmount(
        currentBilled != null && currentBilled > 0 ? String(currentBilled) : "",
      );
    },
    [currentBilled, isShipperParty],
  );

  const loadOrg = useCallback(async () => {
    // Wait until operating mode has settled — never treat "still loading" as deny.
    if (modeLoading) return;
    if (!canTagOfflineParty) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setWorkspaceError(null);
    try {
      // Independent DRIVER book only — never ensure DCO workspace / Self RPCs.
      if (canManageIndieBook && !canManageDcoSelfBook) {
        setOrg(null);
        const { error, parties } = await listDriverIndieParties();
        if (error) setWorkspaceError(error.message);
        setExistingParties(parties);
        return;
      }
      if (!canManageDcoSelfBook) {
        setOrg(null);
        setExistingParties([]);
        return;
      }
      const { organization, error: ensureError } = await ensureDcoWorkspace();
      if (!organization?.id) {
        setOrg(null);
        setExistingParties([]);
        setWorkspaceError(ensureError?.message ?? DCO_NO_WORKSPACE);
        return;
      }
      setOrg(organization);
      const { error, parties } = await listDcoSelfParties();
      if (error) {
        setWorkspaceError(error.message);
        setExistingParties([]);
        return;
      }
      setExistingParties(parties);
    } finally {
      setLoading(false);
    }
  }, [canManageDcoSelfBook, canManageIndieBook, canTagOfflineParty, modeLoading]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    // Only leave after mode is resolved and the caller is neither indie nor DCO.
    if (modeLoading) return;
    if (!canTagOfflineParty) onBack();
  }, [modeLoading, canTagOfflineParty, onBack]);

  const matchingSavedParty = useMemo(() => {
    const key = partyName.trim().toLowerCase();
    if (!key) return null;
    return (
      existingParties.find((row) => row.name.trim().toLowerCase() === key) ?? null
    );
  }, [existingParties, partyName]);

  // "Add {assigner} as party" deep-link: open create prefilled; back returns to the list.
  useEffect(() => {
    if (loading || modeLoading) return;
    if (!partyName.trim() || matchingSavedParty) return;
    setShowCreate(true);
  }, [loading, matchingSavedParty, modeLoading, partyName]);

  const finishWithClient = useCallback(
    async (client: { id: string; name: string }, billed?: number | null) => {
      if (!tripId) return { error: null as Error | null };
      // Tag never creates Due. Issue only when an amount is explicitly provided.
      if (canManageIndieBook && !canManageDcoSelfBook) {
        const tagged = await tagDriverIndieTrip({
          tripId,
          partyId: client.id,
          partyName: client.name,
        });
        if (tagged.error) return { error: tagged.error };
        const amount = billed != null && billed > 0 ? billed : 0;
        if (amount > 0) {
          const issued = await issueDriverIndieReceivable({
            partyId: client.id,
            billed: amount,
            idempotencyKey: driverIndieIssueKey(tripId),
            tripId,
            partyLabel: client.name,
          });
          if (issued.error) return { error: issued.error };
        }
      } else {
        const tagged = await tagDcoSelfTrip({
          tripId,
          partyBId: client.id,
          partyName: client.name,
        });
        if (tagged.error) return { error: tagged.error };
        const amount = billed != null && billed > 0 ? billed : 0;
        if (amount > 0) {
          const issued = await issueDcoSelfReceivable({
            partyBId: client.id,
            billed: amount,
            idempotencyKey: dcoSelfIssueKey(tripId),
            tripId,
            partyALabel: client.name,
          });
          if (issued.error) return { error: issued.error };
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      return { error: null as Error | null };
    },
    [canManageDcoSelfBook, canManageIndieBook, queryClient, tripId],
  );

  const handleClose = useCallback(() => {
    onBack();
  }, [onBack]);

  /** Create form back: return to party list when one exists; otherwise leave the screen. */
  const handleFormClose = useCallback(() => {
    if (tripId && showCreate && existingParties.length > 0) {
      setShowCreate(false);
      return;
    }
    handleClose();
  }, [existingParties.length, handleClose, showCreate, tripId]);

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
      const name = data.organizationName || data.contactPerson || "Party";
      const created =
        canManageIndieBook && !canManageDcoSelfBook
          ? await upsertDriverIndieParty({ name, phone: data.phone })
          : await upsertDcoSelfParty({ name, phone: data.phone });
      if (created.error || !created.party) {
        throw created.error ?? new Error("Could not save party.");
      }
      const party = created.party;
      setCreatedSuccess(true);
      if (tripId && !isShipperParty(party.name)) {
        beginTag(party);
      } else {
        const tagged = await finishWithClient(party);
        if (tagged.error) throw tagged.error;
        setSuccessParty(party);
      }
    },
    [
      beginTag,
      canManageDcoSelfBook,
      canManageIndieBook,
      finishWithClient,
      isShipperParty,
      tripId,
    ],
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

  const createForm = (
    <AddClientModal
      onClose={handleFormClose}
      onComplete={handleComplete}
      organizationId={org?.id ?? null}
      noOrganizationMessage={
        canAddDcoShippers && !org?.id ? workspaceError ?? DCO_NO_WORKSPACE : null
      }
      onRefreshOrganization={loadOrg}
      searchInviteeByPhone={searchInviteeByPhone}
      onSendInvitation={handleSendInvitation}
      successEntity="client"
      initialOrganizationName={matchingSavedParty ? "" : partyName}
      showSuccessOnComplete={!tripId}
      allowSinglePartyName
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
          ? { partyName: receivableParty.name, amount: receivableAmount }
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

  if (modeLoading || loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.primary} />;
  }

  if (!canTagOfflineParty) {
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
      <Text style={styles.kicker}>{partyBookKicker}</Text>
      <Text style={styles.hint}>
        {useIndieBook
          ? "Tap a customer to tag this trip. Add a new customer if they are not in this list."
          : "Tap a party to tag this trip. Details are already on file — only add a new party if they are not in this list."}
      </Text>
      {workspaceError ? <Text style={styles.error}>{workspaceError}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {existingParties.map((row) => {
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
                entityType="client"
                size={40}
                showIntegrationBadge={false}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {row.phone?.trim() || "Saved party"}
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
