import Theme from '@/constants/Theme';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import { buildDriverInviteSalaryLines } from '@/features/drivers/utils/driverInviteOffer.util';
import { resolveDriverOrgAvatarUri } from '@/features/drivers/utils/resolveDriverOrgAvatar.util';
import { useOrgBrandingByIds } from '@/lib/hooks/useOrgBrandingByIds';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ArrowRight,
    Briefcase,
    Check,
    ChevronLeft,
    ChevronRight,
    MapPin,
    Percent,
    Sparkles,
    Wallet,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDriverInviteDetails } from '@/features/drivers/services/driverInviteNegotiation.service';
import { DriverInviteThread } from '@/features/drivers/components/DriverInviteThread';
import {
    ActivityIndicator,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  invite: DriverInviteRow;
  queueIndex?: number;
  queueTotal?: number;
  /** Switch between pending invites so the driver can compare offers. */
  onPrev?: () => void;
  onNext?: () => void;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onLater: () => void;
  /** Driver opens the first "request changes" message. */
  onRequestChanges?: () => void;
  /** Inline reply in the Messages thread. Resolves true when sent. */
  onSendMessage?: (message: string) => Promise<boolean>;
};

function salaryLineIcon(label: string, size = 18) {
  const key = label.toLowerCase();
  if (key.includes('salary') || key.includes('fixed')) {
    return <Wallet size={size} color={Theme.driverEmerald} strokeWidth={2.2} />;
  }
  if (key.includes('commission') || key.includes('%')) {
    return <Percent size={size} color={Theme.driverEmerald} strokeWidth={2.2} />;
  }
  return <MapPin size={size} color={Theme.driverEmerald} strokeWidth={2.2} />;
}

const EMERALD = Theme.driverEmerald;
const EMERALD_DARK = Theme.driverEmeraldDark;
const MINT = 'rgba(167,243,208,0.92)';

export function DriverInviteModal({
  visible,
  invite,
  queueIndex = 1,
  queueTotal = 1,
  onPrev,
  onNext,
  busy = false,
  onAccept,
  onDecline,
  onLater,
  onRequestChanges,
  onSendMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const orgId = invite.from_organization_id ?? '';
  const brandingById = useOrgBrandingByIds([orgId]);

  const orgLogoUri = useMemo(
    () =>
      resolveDriverOrgAvatarUri({
        orgId,
        orgName: invite.from_org_name,
        branding: brandingById[orgId],
        logoUrl: invite.from_org_logo_url,
        avatarSeed: invite.from_org_avatar_seed,
        avatarUrl: invite.from_org_avatar_url,
      }),
    [invite, orgId, brandingById],
  );

  // Job description, T&C and revise history (20271118120100).
  const detailsQ = useQuery({
    queryKey: ['q', 'driverInviteDetails', invite.id],
    queryFn: async () => (await getDriverInviteDetails([invite.id]))[invite.id] ?? null,
    enabled: visible && !!invite.id,
    staleTime: 30_000,
  });
  const jobDescription = detailsQ.data?.job_description?.trim() || null;
  const termsText = detailsQ.data?.terms_text?.trim() || null;
  const fleetReplied =
    (detailsQ.data?.rounds?.length ?? 0) > 1 && detailsQ.data?.last_action_by === 'fleet';
  const [termsOpen, setTermsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    // New invite (or the fleet changed the offer): agree again.
    setAgreed(false);
    setTermsOpen(false);
  }, [invite.id, invite.payable_amount, invite.commission_percent, invite.commission_per_km]);
  const hasThread = (detailsQ.data?.rounds ?? []).some((r) => !!r.note?.trim());
  const scrollRef = useRef<ScrollView>(null);
  const [termsY, setTermsY] = useState<number | null>(null);
  const openTerms = () => {
    setTermsOpen(true);
    if (termsY != null) scrollRef.current?.scrollTo({ y: Math.max(0, termsY - 12), animated: true });
  };
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => setReply(''), [invite.id]);
  const canSendReply = !!onSendMessage && reply.trim().length >= 2 && !sending && !busy;
  const handleSendReply = async () => {
    if (!onSendMessage || !canSendReply) return;
    setSending(true);
    try {
      const ok = await onSendMessage(reply.trim());
      if (ok) setReply('');
    } finally {
      setSending(false);
    }
  };
  // Wait for the details before allowing Accept, so T&C can't be skipped.
  const acceptBlocked = busy || detailsQ.isLoading || (!!termsText && !agreed);

  const salaryLines = buildDriverInviteSalaryLines(invite);
  const orgName = invite.from_org_name?.trim() || 'Fleet organisation';

  const inviteDateLabel = useMemo(() => {
    const raw = invite.created_at;
    if (!raw) return null;
    try {
      return new Date(raw).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [invite.created_at]);

  const nextSteps = useMemo(
    () => [
      'You will receive trip assignments from this fleet',
      'Your earnings will be tracked in your passbook',
      `Pay is settled by ${orgName}`,
    ],
    [orgName],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, Platform.OS === 'web' ? styles.backdropWeb : null]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 16) + 4,
            },
          ]}
        >
          {/* ── Hero band ─────────────────────────────── */}
          <LinearGradient
            colors={[EMERALD_DARK, EMERALD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            {/* Top row: eyebrow + queue badge */}
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={12} color={MINT} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>FLEET INVITATION</Text>
              </View>
              {queueTotal > 1 && (
                <View style={styles.queueNav}>
                  {onPrev ? (
                    <TouchableOpacity
                      onPress={onPrev}
                      disabled={busy}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 6 }}
                      style={styles.queueArrow}
                      accessibilityRole="button"
                      accessibilityLabel="Previous invite"
                    >
                      <ChevronLeft size={14} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.queueBadge}>
                    <Text style={styles.queueText}>{queueIndex}/{queueTotal}</Text>
                  </View>
                  {onNext ? (
                    <TouchableOpacity
                      onPress={onNext}
                      disabled={busy}
                      hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
                      style={styles.queueArrow}
                      accessibilityRole="button"
                      accessibilityLabel="Next invite"
                    >
                      <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>

            {/* Org logo + title row */}
            <View style={styles.heroBody}>
              {/* Org Logo */}
              <View style={styles.heroLogoWrap}>
                <Image
                  source={{ uri: orgLogoUri }}
                  style={styles.heroLogo}
                  resizeMode="cover"
                />
                <View style={styles.heroLogoBadge}>
                  <Briefcase size={9} color="#fff" strokeWidth={2.5} />
                </View>
              </View>

              {/* Title block */}
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  Join {orgName}
                </Text>
                <View style={styles.heroPillRow}>
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>Fleet Driver</Text>
                  </View>
                  {inviteDateLabel && (
                    <Text style={styles.heroDate}>Sent {inviteDateLabel}</Text>
                  )}
                </View>
              </View>
            </View>
          </LinearGradient>

          <ScrollView
            ref={scrollRef}
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: 12 }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Pay package ─────────────────────────── */}
            {salaryLines.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                    YOUR OFFER
                  </Text>
                  <View style={[styles.offerPill, { backgroundColor: colors.emeraldMuted }]}>
                    <Text style={[styles.offerPillText, { color: EMERALD }]}>
                      {salaryLines.length} benefit{salaryLines.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.payGrid}>
                  {salaryLines.map((line, i) => (
                    <View
                      key={line.label}
                      style={[
                        styles.payTile,
                        {
                          backgroundColor: i === 0 ? colors.emeraldMuted : colors.surfaceElevated,
                          borderColor: i === 0
                            ? Theme.driverEmeraldBorderSoft ?? `${EMERALD}30`
                            : colors.border,
                          flex: salaryLines.length === 1 ? 1 : undefined,
                          width: salaryLines.length > 1 ? '48%' : undefined,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.payTileIconWrap,
                          { backgroundColor: i === 0 ? '#fff' : colors.surface },
                        ]}
                      >
                        {salaryLineIcon(line.label, 16)}
                      </View>
                      <Text style={[styles.payTileAmount, { color: colors.text }]}>
                        {line.value}
                      </Text>
                      <Text style={[styles.payTileLabel, { color: EMERALD }]}>
                        {line.label}
                      </Text>
                      <Text
                        style={[styles.payTileHint, { color: colors.textMuted }]}
                        numberOfLines={2}
                      >
                        {line.hint}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View
                style={[
                  styles.emptyTerms,
                  { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                ]}
              >
                <FontAwesome name="info-circle" size={15} color={colors.textMuted} />
                <Text style={[styles.emptyTermsText, { color: colors.textMuted }]}>
                  Pay terms will be confirmed when you accept. View details in Requests after connecting.
                </Text>
              </View>
            )}

            {fleetReplied ? (
              <View
                style={[
                  styles.reminderBanner,
                  { backgroundColor: colors.emeraldMuted, borderColor: colors.emeraldBorderSoft },
                ]}
              >
                <FontAwesome name="refresh" size={12} color={EMERALD} />
                <Text style={[styles.reminderText, { color: colors.text }]}>
                  {orgName} replied. Read and reply below.
                </Text>
              </View>
            ) : null}

            {/* ── Messages with the fleet (thread + inline reply) ── */}
            {hasThread ? (
              <View
                style={[
                  styles.nextCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.nextTitle, { color: colors.text }]}>Messages</Text>
                <DriverInviteThread
                  rounds={detailsQ.data?.rounds ?? []}
                  viewer="driver"
                  fleetName={orgName}
                  driverName="You"
                />
                {onSendMessage ? (
                  <View style={[styles.composer, { borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.composerInput, { color: colors.text }]}
                      placeholder={`Reply to ${orgName}…`}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      maxLength={500}
                      value={reply}
                      onChangeText={setReply}
                      editable={!sending && !busy}
                    />
                    <TouchableOpacity
                      style={[styles.sendBtn, !canSendReply && styles.disabled]}
                      onPress={() => void handleSendReply()}
                      disabled={!canSendReply}
                      accessibilityRole="button"
                      accessibilityLabel="Send reply"
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <FontAwesome name="send" size={14} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── Job description ─────────────────────── */}
            {jobDescription ? (
              <View
                style={[
                  styles.nextCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.nextTitle, { color: colors.text }]}>Job description</Text>
                <Text style={[styles.nextText, { color: colors.textMuted }]}>{jobDescription}</Text>
              </View>
            ) : null}

            {/* ── Terms & conditions (read here; agree in the footer) ── */}
            {termsText ? (
              <View
                onLayout={(e) => setTermsY(e.nativeEvent.layout.y)}
                style={[
                  styles.nextCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.termsHeader}
                  onPress={() => setTermsOpen((v) => !v)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Terms and conditions"
                >
                  <FontAwesome name="file-text-o" size={14} color={EMERALD} />
                  <Text style={[styles.nextTitle, { color: colors.text, flex: 1, marginBottom: 0 }]}>
                    Terms & conditions
                  </Text>
                  <FontAwesome
                    name={termsOpen ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
                {termsOpen ? (
                  <ScrollView
                    style={[styles.termsBody, { borderColor: colors.border }]}
                    nestedScrollEnabled
                  >
                    <Text style={[styles.nextText, { color: colors.text }]}>{termsText}</Text>
                  </ScrollView>
                ) : null}
              </View>
            ) : null}

            {/* ── What happens next ───────────────────── */}
            <View
              style={[
                styles.nextCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.nextTitle, { color: colors.text }]}>What happens next</Text>
              {nextSteps.map((item) => (
                <View key={item} style={styles.nextRow}>
                  <ArrowRight size={13} color={EMERALD} strokeWidth={2.4} />
                  <Text style={[styles.nextText, { color: colors.textMuted }]}>{item}</Text>
                </View>
              ))}
            </View>

            {/* ── Reminder banner ─────────────────────── */}
            <View
              style={[
                styles.reminderBanner,
                {
                  backgroundColor: colors.emeraldMuted,
                  borderColor: colors.emeraldBorderSoft,
                },
              ]}
            >
              <FontAwesome name="bell" size={12} color={EMERALD} />
              <Text style={[styles.reminderText, { color: colors.textMuted }]}>
                This invitation stays active until you accept or decline.
              </Text>
            </View>
          </ScrollView>

          {/* ── Footer ──────────────────────────────── */}
          <View
            style={[styles.footer, { borderTopColor: colors.border }]}
          >
            {/* "I agree" sits right above Accept so it is always visible. */}
            {termsText ? (
              <View style={styles.agreeRow}>
                <TouchableOpacity
                  style={styles.agreeTap}
                  onPress={() => setAgreed((v) => !v)}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                >
                  <View
                    style={[
                      styles.agreeBox,
                      { borderColor: agreed ? EMERALD : colors.border },
                      agreed && { backgroundColor: EMERALD },
                    ]}
                  >
                    {agreed ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.agreeText, { color: colors.text }]}>
                    I agree to the Terms & Conditions
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openTerms} accessibilityRole="link">
                  <Text style={styles.viewLink}>View</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.declineBtn,
                  { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                ]}
                onPress={onDecline}
                disabled={busy}
                activeOpacity={0.82}
              >
                <Text style={[styles.declineText, { color: colors.textMuted }]}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptBtn, acceptBlocked && styles.disabled]}
                onPress={onAccept}
                disabled={acceptBlocked}
                activeOpacity={0.88}
                accessibilityState={{ disabled: acceptBlocked }}
              >
                <LinearGradient
                  colors={[EMERALD, EMERALD_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.acceptGradient}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Check size={15} color="#fff" strokeWidth={3} />
                      <Text style={styles.acceptText}>Accept & connect</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* First request only; once talking, the reply box is in Messages. */}
            {onRequestChanges && !hasThread ? (
              <TouchableOpacity
                onPress={onRequestChanges}
                disabled={busy}
                style={[styles.changesBtn, { borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <FontAwesome name="comment-o" size={12} color={colors.text} />
                <Text style={[styles.changesText, { color: colors.text }]}>
                  Request changes
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={onLater}
              disabled={busy}
              style={styles.laterBtn}
              activeOpacity={0.7}
            >
              <Text style={[styles.laterText, { color: colors.textMuted }]}>Remind me later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  termsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termsBody: {
    maxHeight: 200,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  agreeTap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  agreeText: { fontSize: 14, fontWeight: '600', flex: 1 },
  viewLink: { fontSize: 14, fontWeight: '700', color: EMERALD, textDecorationLine: 'underline' },
  composer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  composerInput: { flex: 1, fontSize: 14, minHeight: 36, maxHeight: 110, paddingVertical: 6 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: EMERALD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changesBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changesText: { fontSize: 14, fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'flex-end',
  },
  backdropWeb: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { width: '100%', maxWidth: 440, borderRadius: 28, maxHeight: '92%' }
      : {}),
  },

  // ── Hero ─────────────────────────────────────────────
  hero: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: MINT,
    textTransform: 'uppercase',
  },
  queueNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  queueArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  queueBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  queueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroLogoWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
    flexShrink: 0,
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  heroLogoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: EMERALD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroTextBlock: {
    flex: 1,
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  heroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  heroDate: {
    fontSize: 11,
    fontWeight: '500',
    color: MINT,
  },

  // ── Body ─────────────────────────────────────────────
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  offerPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  offerPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  payGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  payTile: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 5,
    minWidth: 140,
  },
  payTileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  payTileAmount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  payTileLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  payTileHint: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },

  emptyTerms: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  emptyTermsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  // ── What's next card ──────────────────────────────────
  nextCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  nextTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  nextText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },

  // ── Reminder ─────────────────────────────────────────
  reminderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reminderText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },

  // ── Footer ───────────────────────────────────────────
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  acceptGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  laterBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  laterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.6,
  },
});
