/**
 * DCO Self — tag this offline trip to a saved shipper or middleman.
 * Tagging is what rolls the trip into that party's AR. Collect is a
 * separate step and uses the tagged party.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import {
  EMPTY_DRIVER_PARTY_AVATAR,
  resolveClientPartyAvatarMap,
  type DriverPartyAvatarFields,
} from "@/features/drivers/utils/driverPartyAvatar.util";
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Theme from "@/constants/Theme";
import { getClientsByOrganization, type ClientRow } from "@/features/clients/services/clients.service";
import { tagTripWithDcoClient } from "@/features/drivers/services/driverTripClient.service";
import { type DriverCaptureLane } from "@/features/drivers/utils/driverCapturePayment.util";
import { parseDcoPartyTagFromNotes } from "@/features/drivers/utils/dcoTripPartyTag.util";
import {
  isTripTaggedToParty,
  tripReceivableBilled,
  tripReceivablePartyName,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import {
  partyMatchesAssigner,
  sortTagPartyOptions,
  tagPartyListDetail,
} from "@/features/drivers/utils/driverPartyTagRecommend.util";
import {
  ensureDcoWorkspace,
  getOrganizationsForUser,
} from "@/features/organization/services/organization.service";
import { DriverTagPartyDialogs } from "@/features/drivers/components/DriverTagPartyDialogs";
import { showAppAlert } from "@/lib/appAlert";
import { queryKeys } from "@/lib/queryKeys";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
import { ROUTES } from "@/lib/routes";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useQueryClient } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { Plus, UserPlus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PartyOption = {
  id: string;
  name: string;
  phone?: string | null;
  contactPerson?: string | null;
  linkedOrganizationId?: string | null;
  linkedToTrip?: boolean;
  matchesAssigner?: boolean;
  avatar: DriverPartyAvatarFields;
};

type Props = {
  visible: boolean;
  trip: TripRow;
  due: number;
  lane?: DriverCaptureLane;
  assignerName?: string | null;
  onClose: () => void;
  onTagged?: (party: { id: string; name: string }) => void;
};

export function DriverCollectFromSheet({
  visible,
  trip,
  due: _due,
  lane: _lane,
  assignerName,
  onClose,
  onTagged,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { canAddDcoShippers, canTagOfflineParty, isDco } = useDriverOperatingModeQuery();
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [pendingParty, setPendingParty] = useState<PartyOption | null>(null);
  const [receivableParty, setReceivableParty] = useState<PartyOption | null>(null);
  const [receivableAmount, setReceivableAmount] = useState("");
  const [billedForTag, setBilledForTag] = useState<number | null>(null);
  const [successParty, setSuccessParty] = useState<{ id: string; name: string } | null>(null);

  const fleetAssignerName = useMemo(() => {
    return (
      String(assignerName ?? "").trim() ||
      String(trip.organization_name ?? "").trim() ||
      ""
    );
  }, [assignerName, trip.organization_name]);

  const currentName = useMemo(() => {
    if (fleetAssignerName) return fleetAssignerName;
    if (isTripTaggedToParty(trip)) {
      const tagged = tripReceivablePartyName(trip);
      if (tagged && tagged !== "Untagged") return tagged;
    }
    return "Shipper";
  }, [fleetAssignerName, trip]);

  const taggedPartyId = useMemo(() => {
    const fromClient = String(trip.client_id ?? "").trim();
    if (fromClient) return fromClient;
    return parseDcoPartyTagFromNotes(trip.notes)?.id ?? "";
  }, [trip.client_id, trip.notes]);

  const loadParties = useCallback(async () => {
    if (!canTagOfflineParty && !canAddDcoShippers) {
      setParties([]);
      return;
    }
    setLoading(true);
    try {
      let orgId: string | null = null;
      let workspaceUnavailable = false;
      if (canAddDcoShippers) {
        const { organization, error } = await ensureDcoWorkspace();
        orgId = organization?.id ?? null;
        workspaceUnavailable = /not enabled on this environment|cannot create your shipper book/i.test(
          error?.message ?? "",
        );
      }
      if (!orgId && !workspaceUnavailable) {
        const listed = await getOrganizationsForUser();
        orgId = listed.organizations[0]?.id ?? null;
      }
      const rows: ClientRow[] = orgId
        ? ((await getClientsByOrganization(orgId)).clients ?? [])
        : [];
      const avatars = rows.length ? await resolveClientPartyAvatarMap(rows) : {};
      const mapped: PartyOption[] = rows.map((row) => {
        const name = row.name || row.contact_person || "Shipper";
        return {
          id: row.id,
          name,
          phone: row.phone,
          contactPerson: row.contact_person,
          linkedOrganizationId: row.linked_organization_id,
          linkedToTrip: !!taggedPartyId && row.id === taggedPartyId,
          matchesAssigner: partyMatchesAssigner(name, fleetAssignerName || currentName),
          avatar: avatars[row.id] ?? EMPTY_DRIVER_PARTY_AVATAR,
        };
      });
      setParties(sortTagPartyOptions(mapped, !isDco));
    } finally {
      setLoading(false);
    }
  }, [canAddDcoShippers, canTagOfflineParty, currentName, fleetAssignerName, isDco, taggedPartyId]);

  useEffect(() => {
    if (visible) void loadParties();
  }, [visible, loadParties]);

  const currentBilled = useMemo(() => tripReceivableBilled(trip), [trip]);

  const handlePick = useCallback((party: PartyOption) => {
    if (busyId || !party.id) return;
    setBilledForTag(null);
    setPendingParty(null);
    setReceivableParty(party);
    setReceivableAmount(currentBilled > 0 ? String(currentBilled) : "");
  }, [busyId, currentBilled]);

  const handleConfirmTag = useCallback(async () => {
    if (!pendingParty?.id || busyId) return;
    setBusyId(pendingParty.id);
    try {
      const { error } = await tagTripWithDcoClient(
        trip.id,
        {
          id: pendingParty.id,
          name: pendingParty.name,
        },
        billedForTag != null && billedForTag > 0 ? { billed: billedForTag } : undefined,
      );
      if (error) {
        showAppAlert("Could not tag party", error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(trip.id) });
      setSuccessParty({ id: pendingParty.id, name: pendingParty.name });
      setPendingParty(null);
      setReceivableParty(null);
      setBilledForTag(billedForTag);
    } finally {
      setBusyId(null);
    }
  }, [billedForTag, busyId, pendingParty, queryClient, trip.id]);

  const handleSuccessOk = useCallback(() => {
    const tagged = successParty;
    setSuccessParty(null);
    if (tagged) onTagged?.(tagged);
    onClose();
  }, [onClose, onTagged, successParty]);

  const openAddParty = useCallback(
    (partyName?: string) => {
      onClose();
      router.push(
        ROUTES.driverAddClient({
          tripId: trip.id,
          partyName,
        }) as Href,
      );
    },
    [onClose, router, trip.id],
  );

  const assignerToAdd = useMemo(() => {
    const name =
      currentName && currentName !== "Shipper" && currentName !== "Untagged"
        ? currentName
        : null;
    if (!name) return null;
    const key = name.trim().toLowerCase();
    const alreadySaved = parties.some((row) => row.name.trim().toLowerCase() === key);
    return alreadySaved ? null : name;
  }, [currentName, parties]);

  const flowOpen = !!(pendingParty || receivableParty || successParty);
  if (!visible && !flowOpen) return null;

  return (
    <>
    <Modal visible={visible && !flowOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.kicker}>Tag party</Text>
          <Text style={styles.title}>Who do you bill?</Text>
          {!isDco && fleetAssignerName ? (
            <View style={styles.assignerChip}>
              <Text style={styles.assignerKicker}>Recommended · Fleet</Text>
              <Text style={styles.assignerName} numberOfLines={1}>
                {fleetAssignerName}
              </Text>
            </View>
          ) : assignerToAdd ? (
            <View style={styles.assignerChip}>
              <Text style={styles.assignerKicker}>Assigned by</Text>
              <Text style={styles.assignerName} numberOfLines={1}>
                {assignerToAdd}
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>
              Tag a shipper or middleman from Self. This trip then shows under that party’s
              receivables.
            </Text>
          )}

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 28 }} color={Theme.primary} />
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>Your parties</Text>
              {parties.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No parties yet</Text>
                  <Text style={styles.empty}>
                    Add the shipper or middleman, then tag this trip.
                  </Text>
                </View>
              ) : (
                parties.map((party) => (
                  <TouchableOpacity
                    key={party.id}
                    style={[
                      styles.row,
                      party.linkedToTrip && styles.rowActive,
                      !isDco && party.matchesAssigner && !party.linkedToTrip && styles.rowRecommended,
                    ]}
                    onPress={() => void handlePick(party)}
                    disabled={!!busyId}
                    accessibilityRole="button"
                    accessibilityLabel={`Tag trip to ${party.name}`}
                  >
                    <EntityAvatar
                      name={party.name}
                      initialsColorSeed={party.id}
                      avatarUrl={party.avatar.avatarUrl}
                      avatarSeed={party.avatar.avatarSeed}
                      organizationImageUrl={party.avatar.organizationImageUrl}
                      organizationAvatarSeed={party.avatar.organizationAvatarSeed}
                      entityType="client"
                      isIntegrated={party.avatar.isIntegrated}
                      size={40}
                      showIntegrationBadge={false}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {party.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {tagPartyListDetail({
                          phone: party.phone,
                          contactPerson: party.contactPerson,
                          linkedOrganizationId: party.linkedOrganizationId,
                          matchesAssigner: party.matchesAssigner,
                          linkedToTrip: party.linkedToTrip,
                          recommendFleet: !isDco,
                        })}
                      </Text>
                    </View>
                    {busyId === party.id ? (
                      <ActivityIndicator size="small" color={Theme.primary} />
                    ) : (
                      <View style={[styles.tagPill, party.linkedToTrip && styles.tagPillActive]}>
                        <Text
                          style={[styles.tagPillText, party.linkedToTrip && styles.tagPillTextActive]}
                        >
                          {party.linkedToTrip ? "Tagged" : "Tag"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}

              {canTagOfflineParty ? (
                <View style={styles.addBlock}>
                  {assignerToAdd ? (
                    <TouchableOpacity
                      style={styles.addPrimary}
                      onPress={() => openAddParty(assignerToAdd)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${assignerToAdd} as party`}
                    >
                      <UserPlus size={16} color={Theme.buttonDarkText} strokeWidth={2.3} />
                      <Text style={styles.addPrimaryText} numberOfLines={1}>
                        Add {assignerToAdd} as party
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.addSecondary}
                    onPress={() => openAddParty()}
                    accessibilityRole="button"
                    accessibilityLabel="Add new party"
                  >
                    <Plus size={16} color={Theme.textPrimary} strokeWidth={2.4} />
                    <Text style={styles.addSecondaryText}>Add new party</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    <DriverTagPartyDialogs
      pendingName={pendingParty?.name ?? null}
      confirming={!!busyId}
      successName={successParty?.name ?? null}
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
              avatarUrl: receivableParty.avatar.avatarUrl,
              avatarSeed: receivableParty.avatar.avatarSeed,
              organizationImageUrl: receivableParty.avatar.organizationImageUrl,
              organizationAvatarSeed: receivableParty.avatar.organizationAvatarSeed,
              isIntegrated: receivableParty.avatar.isIntegrated,
            }
          : null
      }
      onChangeReceivableAmount={setReceivableAmount}
      onCancelReceivable={() => {
        setReceivableParty(null);
        setReceivableAmount("");
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
      onSuccessOk={handleSuccessOk}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "82%",
  },
  handleWrap: {
    alignItems: "center",
    paddingBottom: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.surfaceBorder,
  },
  kicker: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  title: {
    ...driverUIBold,
    marginTop: 4,
    fontSize: 22,
    letterSpacing: -0.4,
    color: Theme.textPrimary,
  },
  hint: {
    ...driverBodySecondary,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
  },
  assignerChip: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  assignerKicker: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  assignerName: {
    ...driverUIBold,
    flexShrink: 1,
    fontSize: 13,
    color: Theme.textPrimary,
  },
  list: {
    marginTop: 16,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  sectionLabel: {
    ...driverUISemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  row: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowActive: {
    borderColor: Theme.driverEmeraldBorder,
    backgroundColor: Theme.driverEmeraldMuted,
  },
  rowRecommended: {
    borderColor: Theme.primaryLight,
    backgroundColor: Theme.brandBlueSoft,
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
  tagPill: {
    minHeight: 32,
    minWidth: 56,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  tagPillActive: {
    backgroundColor: Theme.driverEmerald,
  },
  tagPillText: {
    ...driverUIBold,
    fontSize: 12,
    color: Theme.buttonDarkText,
  },
  tagPillTextActive: {
    color: Theme.buttonDarkText,
  },
  addBlock: {
    marginTop: 8,
    gap: 8,
  },
  addPrimary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Theme.actionBtnInk,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  addPrimaryText: {
    ...driverUIBold,
    flexShrink: 1,
    fontSize: 14,
    color: Theme.buttonDarkText,
  },
  addSecondary: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  addSecondaryText: {
    ...driverUIBold,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyTitle: {
    ...driverUIBold,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  empty: {
    ...driverBodySecondary,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  closeBtn: {
    marginTop: 4,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    ...driverUISemiBold,
    fontSize: 15,
    color: Theme.textSecondary,
  },
});
