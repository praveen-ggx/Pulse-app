import Theme from '@/constants/Theme';
import { resolveDriverOrgAvatarUri } from '@/features/drivers/utils/resolveDriverOrgAvatar.util';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import { useOrgBrandingByIds } from '@/lib/hooks/useOrgBrandingByIds';
import { getDriverInviteDetails } from '@/features/drivers/services/driverInviteNegotiation.service';
import { useQuery } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type InviteCardColors = {
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  emerald: string;
};

type Props = {
  invite: DriverInviteRow;
  colors: InviteCardColors;
  offerText: string;
  busy: boolean;
  fallbackAvatarUri?: string | null;
  onIgnore: () => void;
  onAccept: () => void;
  onClose?: () => void;
  acceptLabel?: string;
  /** Fleet's job description (vehicle, route, shift, duties). */
  jobDescription?: string | null;
  /** Fleet's terms & conditions — Accept stays off until the driver agrees. */
  termsText?: string | null;
  /** Driver can send changed pay terms back to the fleet. */
  onRequestChanges?: () => void;
  /** Driver already asked for changes; waiting for the fleet's answer. */
  waitingForFleet?: boolean;
  /** Short note shown above the actions (e.g. "Fleet agreed to your terms"). */
  statusNote?: string | null;
};

export function DriverInviteCard({
  invite,
  colors,
  offerText,
  busy,
  fallbackAvatarUri = null,
  onIgnore,
  onAccept,
  onClose,
  acceptLabel = 'Accept Invite',
  jobDescription: jobDescriptionProp,
  termsText: termsTextProp,
  onRequestChanges,
  waitingForFleet = false,
  statusNote = null,
}: Props) {
  // Loads job description / T&C itself so every screen showing this card
  // (Home popups included) enforces "I agree" before Accept.
  const detailsQ = useQuery({
    queryKey: ['q', 'driverInviteDetails', invite.id],
    queryFn: async () => (await getDriverInviteDetails([invite.id]))[invite.id] ?? null,
    enabled: !!invite.id && (jobDescriptionProp === undefined || termsTextProp === undefined),
    staleTime: 30_000,
  });
  const jobDescription = jobDescriptionProp ?? detailsQ.data?.job_description ?? null;
  const termsText = termsTextProp ?? detailsQ.data?.terms_text ?? null;
  const hasTerms = !!String(termsText ?? '').trim();
  const fleetReplied =
    (detailsQ.data?.rounds?.length ?? 0) > 1 && detailsQ.data?.last_action_by === 'fleet';
  const note =
    statusNote ??
    (fleetReplied ? 'The fleet replied to your request. Review the offer and accept.' : null);
  const [agreed, setAgreed] = useState(false);
  const acceptBlocked = busy || waitingForFleet || (hasTerms && !agreed);
  const orgId = invite.from_organization_id ?? '';
  const brandingById = useOrgBrandingByIds([orgId]);
  const orgLogo = useMemo(
    () =>
      resolveDriverOrgAvatarUri({
        orgId,
        orgName: invite.from_org_name,
        branding: brandingById[orgId],
        logoUrl: invite.from_org_logo_url,
        avatarSeed: invite.from_org_avatar_seed,
        avatarUrl: invite.from_org_avatar_url ?? fallbackAvatarUri,
      }),
    [invite, orgId, brandingById, fallbackAvatarUri],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {onClose ? (
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <FontAwesome name="times" size={14} color={Theme.textMuted} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <Image source={{ uri: orgLogo }} style={styles.avatarImage} resizeMode="cover" />
        </View>
        <View style={styles.orgInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.orgName, { color: colors.text }]} numberOfLines={1}>
              {invite.from_org_name || 'Organisation'}
            </Text>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <FontAwesome name="star" size={12} color={Theme.driverGold} style={styles.starIcon} />
            <Text style={[styles.statsText, { color: colors.textMuted }]}>4.9</Text>
            <View style={styles.statsDot} />
            <Text style={[styles.statsText, { color: colors.textMuted }]}>1.2k+ drivers</Text>
          </View>
        </View>
      </View>

      {jobDescription ? (
        <View style={[styles.detailBox, { borderColor: colors.border }]}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>JOB DESCRIPTION</Text>
          <Text style={[styles.detailText, { color: colors.text }]}>{jobDescription}</Text>
        </View>
      ) : null}
      {hasTerms ? (
        <View style={[styles.detailBox, { borderColor: colors.border }]}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>TERMS & CONDITIONS</Text>
          <Text style={[styles.detailText, { color: colors.text }]}>{termsText}</Text>
          {!waitingForFleet ? (
            <TouchableOpacity
              style={styles.agreeRow}
              onPress={() => setAgreed((v) => !v)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
            >
              <FontAwesome
                name={agreed ? 'check-square' : 'square-o'}
                size={16}
                color={agreed ? colors.emerald : colors.textMuted}
              />
              <Text style={[styles.detailText, { color: colors.text }]}>
                I agree to the terms & conditions
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {waitingForFleet || note ? (
        <Text style={[styles.statusNote, { color: colors.textMuted }]}>
          {waitingForFleet ? 'You asked for changes. Waiting for the fleet to reply.' : note}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <View style={[styles.offerBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <FontAwesome name="bolt" size={12} color={colors.primary} />
          <Text style={[styles.offerText, { color: colors.text }]} numberOfLines={1}>
            {offerText}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.ignoreBtn, busy && styles.disabled]}
            onPress={onIgnore}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Text style={[styles.ignoreText, { color: colors.textMuted }]}>Ignore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }, acceptBlocked && styles.disabled]}
            onPress={onAccept}
            disabled={acceptBlocked}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptText}>{acceptLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {onRequestChanges && !waitingForFleet ? (
        <TouchableOpacity
          style={[styles.changesBtn, { borderColor: colors.border }, busy && styles.disabled]}
          onPress={onRequestChanges}
          disabled={busy}
          activeOpacity={0.8}
        >
          <FontAwesome name="comment-o" size={12} color={colors.text} />
          <Text style={[styles.changesText, { color: colors.text }]}>Request changes</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  detailBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  detailLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  detailText: { fontSize: 13, lineHeight: 18 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusNote: { fontSize: 12, marginTop: 10 },
  changesBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changesText: { fontSize: 13, fontWeight: '600' },
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    paddingRight: 14,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  orgInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 28,
  },
  orgName: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  verifiedBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: {
    color: '#137333',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  starIcon: {
    marginRight: 4,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.textMuted,
    marginHorizontal: 6,
    opacity: 0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  offerBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    minWidth: 0,
    marginRight: 2,
  },
  offerText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  ignoreBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ignoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  acceptBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    minWidth: 120,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  disabled: {
    opacity: 0.6,
  },
});

