/**
 * Collect salary / pay terms before sending an in-app fleet invitation.
 * Layout aligned with driver-side `DriverInviteModal` (emerald hero, offer tiles, footer).
 */
import { PartyAvatar } from '@/components/PartyAvatar';
import Theme from '@/constants/Theme';
import {
  buildCompensationSalaryLines,
  type DriverInviteSalaryLine,
} from '@/features/drivers/utils/driverInviteOffer.util';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Briefcase,
  MapPin,
  Percent,
  Sparkles,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DriverInviteCompensation } from '../utils/driverInviteCompensation.util';
import {
  hasDriverInviteCompensation,
  validateDriverInviteCompensation,
} from '../utils/driverInviteCompensation.util';

export type DriverFleetInviteSalaryModalMode =
  | 'fleet_reinvite'
  | 'signup_match'
  /** Edit pay terms on an already-connected driver — saves, sends no invite. */
  | 'edit_terms'
  /** Fleet answers a driver's "request changes" with revised terms. */
  | 'fleet_revise'
  /** Driver asks the fleet for different pay terms. */
  | 'driver_counter';

type Props = {
  visible: boolean;
  mode: DriverFleetInviteSalaryModalMode;
  driverName: string;
  driverAvatarUri?: string | null;
  driverAvatarSeed?: string | null;
  initialCompensation: DriverInviteCompensation;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (compensation: DriverInviteCompensation) => void | Promise<void>;
  /** Optional chat shown at the top (e.g. the driver's change request thread). */
  conversation?: ReactNode;
  /** Optional message sent with the offer (e.g. reply to the driver). */
  message?: { value: string; onChange: (v: string) => void; placeholder?: string };
};

const EMERALD = Theme.driverEmerald;
const EMERALD_DARK = Theme.driverEmeraldDark;
const MINT = 'rgba(167,243,208,0.92)';

function salaryLineIcon(label: string, size = 16) {
  const key = label.toLowerCase();
  if (key.includes('salary') || key.includes('fixed')) {
    return <Wallet size={size} color={EMERALD} strokeWidth={2.2} />;
  }
  if (key.includes('commission') || key.includes('%')) {
    return <Percent size={size} color={EMERALD} strokeWidth={2.2} />;
  }
  return <MapPin size={size} color={EMERALD} strokeWidth={2.2} />;
}

function PayPreviewTiles({
  lines,
  compact,
}: {
  lines: DriverInviteSalaryLine[];
  compact: boolean;
}) {
  if (lines.length === 0) {
    return (
      <View style={styles.emptyPreview}>
        <FontAwesome name="info-circle" size={13} color={Theme.textMuted} />
        <Text style={styles.emptyPreviewText}>
          Add at least one pay term — shown in the driver invite popup.
        </Text>
      </View>
    );
  }

  const useGrid = !compact && lines.length > 1;

  return (
    <View style={[styles.payGrid, !useGrid && styles.payGridStacked]}>
      {lines.map((line, i) => (
        <View
          key={line.label}
          style={[
            styles.payTile,
            i === 0 ? styles.payTilePrimary : styles.payTileSecondary,
            useGrid ? styles.payTileGridCell : styles.payTileFull,
          ]}
        >
          <View style={[styles.payTileIconWrap, i === 0 && styles.payTileIconWrapPrimary]}>
            {salaryLineIcon(line.label, 15)}
          </View>
          <Text style={styles.payTileAmount} numberOfLines={1} adjustsFontSizeToFit>
            {line.value}
          </Text>
          <Text style={styles.payTileLabel} numberOfLines={1}>
            {line.label}
          </Text>
          {!compact ? (
            <Text style={styles.payTileHint} numberOfLines={2}>
              {line.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function DriverFleetInviteSalaryModal({
  visible,
  mode,
  driverName,
  driverAvatarUri,
  driverAvatarSeed,
  initialCompensation,
  submitting = false,
  onClose,
  onSubmit,
  conversation,
  message,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 768;
  const isCompact = width < 400;
  const [compensation, setCompensation] =
    useState<DriverInviteCompensation>(initialCompensation);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCompensation(initialCompensation);
      setError(null);
    }
  }, [visible, initialCompensation]);

  const copy = useMemo(() => {
    const firstName = driverName.split(/\s+/).filter(Boolean)[0] ?? driverName;
    if (mode === 'edit_terms') {
      return {
        eyebrow: 'COMPENSATION TERMS',
        title: `${firstName}'s pay terms`,
        pill: 'Fleet driver',
        subtitle: 'Used to price every trip they run',
        note: 'At least one pay term is required.',
        nextSteps: [
          'Applies to trips assigned from now on',
          'Trips already priced keep their amount',
          'Driver sees these terms in the app',
        ],
      };
    }
    if (mode === 'fleet_revise') {
      return {
        eyebrow: 'REVISE OFFER',
        title: `Revise ${firstName}'s offer`,
        pill: 'Asked for changes',
        subtitle: 'Prefilled with what the driver asked for',
        note: 'At least one pay term is required.',
        nextSteps: [
          'Driver sees your revised offer',
          'They accept, decline or ask again',
          'Assign trips after they connect',
        ],
      };
    }
    if (mode === 'driver_counter') {
      return {
        eyebrow: 'REQUEST CHANGES',
        title: `Your terms for ${driverName}`,
        pill: 'Counter-offer',
        subtitle: 'Salary, commission % and per km add up',
        note: 'At least one pay term is required.',
        nextSteps: [
          'The fleet sees what you asked for',
          'They agree, revise or withdraw',
          'You accept once you are happy',
        ],
      };
    }
    if (mode === 'fleet_reinvite') {
      return {
        eyebrow: 'RECONNECT DRIVER',
        title: `Reconnect ${firstName}`,
        pill: 'Former fleet driver',
        subtitle: 'Pay terms show in their invite popup',
        note: 'Required every time you reconnect a driver.',
        nextSteps: [
          'Driver gets an in-app invitation',
          'They accept to rejoin your fleet',
          'Trips can be assigned again',
        ],
      };
    }
    return {
      eyebrow: 'FLEET INVITATION',
      title: `Invite ${firstName}`,
      pill: 'Fleet driver',
      subtitle: 'Pay terms show in the driver app',
      note: 'At least one pay term is required.',
      nextSteps: [
        'Driver sees this offer in the app',
        'They accept or decline from Requests',
        'Assign trips after they connect',
      ],
    };
  }, [driverName, mode]);

  const previewLines = useMemo(
    () => buildCompensationSalaryLines(compensation),
    [compensation],
  );

  const handleSubmit = async () => {
    const validationError = validateDriverInviteCompensation(compensation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    await onSubmit(compensation);
  };

  if (!visible) return null;

  const sheetMaxH = Math.min(height * (isWebDesktop ? 0.92 : 0.94), 660);

  const renderField = (
    label: string,
    placeholder: string,
    value: string,
    onChangeText: (v: string) => void,
    options?: { flex?: number },
  ) => (
    <View style={[styles.fieldWrap, options?.flex != null ? { flex: options.flex, minWidth: 0 } : null]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Theme.placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        editable={!submitting}
      />
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <View style={[styles.backdrop, isWebDesktop && styles.backdropWeb]}>
          <Pressable
            style={styles.backdropDismiss}
            onPress={submitting ? undefined : onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.sheet,
              isWebDesktop ? styles.sheetWeb : styles.sheetMobile,
              { maxHeight: sheetMaxH, paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <LinearGradient
              colors={[EMERALD_DARK, EMERALD]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, !isWebDesktop && styles.heroMobile]}
            >
              {!isWebDesktop ? (
                <View style={styles.handleRow}>
                  <View style={styles.handle} />
                </View>
              ) : null}

              <View style={styles.heroTopRow}>
                <View style={styles.heroEyebrowRow}>
                  <Sparkles size={11} color={MINT} strokeWidth={2.5} />
                  <Text style={styles.heroEyebrow} numberOfLines={1}>
                    {copy.eyebrow}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  disabled={submitting}
                  style={styles.heroCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close"
                >
                  <FontAwesome name="times" size={15} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.heroBody}>
                <View style={styles.heroAvatarWrap}>
                  {driverAvatarUri ? (
                    <Image
                      source={{ uri: driverAvatarUri }}
                      style={styles.heroAvatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <PartyAvatar
                      name={driverName}
                      avatarUrl={null}
                      avatarSeed={driverAvatarSeed ?? null}
                      entityType="driver"
                      size={60}
                    />
                  )}
                  <View style={styles.heroAvatarBadge}>
                    <Briefcase size={8} color="#fff" strokeWidth={2.5} />
                  </View>
                </View>

                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {copy.title}
                  </Text>
                  <View style={styles.heroPillRow}>
                    <View style={styles.heroPill}>
                      <Text style={styles.heroPillText} numberOfLines={1}>
                        {copy.pill}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.heroSubtitle} numberOfLines={2}>
                    {copy.subtitle}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {conversation ? (
                <View style={styles.nextCard}>
                  <Text style={styles.nextTitle}>Conversation</Text>
                  {conversation}
                </View>
              ) : null}

              <View style={styles.reminderBanner}>
                <FontAwesome name="info-circle" size={11} color={EMERALD} />
                <Text style={styles.reminderText}>{copy.note}</Text>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>SET PAY TERMS</Text>
                {hasDriverInviteCompensation(compensation) ? (
                  <View style={styles.offerPill}>
                    <Text style={styles.offerPillText}>
                      {previewLines.length} benefit{previewLines.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>

              {renderField(
                'Fixed salary (₹ / month)',
                'e.g. 25000',
                compensation.payableAmount != null && compensation.payableAmount !== 0
                  ? String(compensation.payableAmount)
                  : '',
                (v) => {
                  const n =
                    v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                  setCompensation((p) => ({
                    ...p,
                    payableAmount:
                      n != null && !Number.isNaN(n) && n > 0 ? n : null,
                  }));
                  setError(null);
                },
              )}

              <View style={[styles.splitRow, isCompact && styles.splitRowStacked]}>
                {renderField(
                  'Trip commission (%)',
                  'e.g. 10',
                  compensation.commissionPercent != null &&
                    compensation.commissionPercent !== 0
                    ? String(compensation.commissionPercent)
                    : '',
                  (v) => {
                    const n =
                      v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                    const val =
                      n != null && !Number.isNaN(n)
                        ? Math.min(100, Math.max(0, n))
                        : null;
                    setCompensation((p) => ({
                      ...p,
                      commissionPercent: val != null && val > 0 ? val : null,
                    }));
                    setError(null);
                  },
                  { flex: 1 },
                )}
                {renderField(
                  'Per km (₹/km)',
                  'e.g. 8',
                  compensation.commissionPerKm != null &&
                    compensation.commissionPerKm !== 0
                    ? String(compensation.commissionPerKm)
                    : '',
                  (v) => {
                    const n =
                      v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                    setCompensation((p) => ({
                      ...p,
                      commissionPerKm:
                        n != null && !Number.isNaN(n) && n > 0 ? n : null,
                    }));
                    setError(null);
                  },
                  { flex: 1 },
                )}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>DRIVER WILL SEE IN APP</Text>
              </View>
              <PayPreviewTiles lines={previewLines} compact={isCompact || previewLines.length >= 3} />

              {message ? (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>MESSAGE (OPTIONAL)</Text>
                  </View>
                  <TextInput
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                    placeholder={message.placeholder ?? 'Add a message'}
                    placeholderTextColor={Theme.textMuted}
                    multiline
                    maxLength={500}
                    value={message.value}
                    onChangeText={message.onChange}
                    editable={!submitting}
                  />
                </>
              ) : null}

              <View style={styles.nextCard}>
                <Text style={styles.nextTitle}>What happens next</Text>
                {copy.nextSteps.map((item) => (
                  <View key={item} style={styles.nextRow}>
                    <ArrowRight size={12} color={EMERALD} strokeWidth={2.4} />
                    <Text style={styles.nextText}>{item}</Text>
                  </View>
                ))}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <View style={[styles.actions, isCompact && styles.actionsStacked]}>
                <TouchableOpacity
                  style={[styles.cancelBtn, isCompact && styles.actionFull]}
                  onPress={onClose}
                  disabled={submitting}
                  activeOpacity={0.82}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    isCompact && styles.actionFull,
                    submitting && styles.btnDisabled,
                  ]}
                  onPress={() => void handleSubmit()}
                  disabled={submitting}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[EMERALD, EMERALD_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <FontAwesome
                          name={mode === 'edit_terms' ? 'check' : 'send'}
                          size={12}
                          color="#fff"
                        />
                        <Text style={styles.submitBtnText}>
                          {mode === 'edit_terms'
                            ? 'Save pay terms'
                            : mode === 'driver_counter'
                              ? 'Send to fleet'
                              : mode === 'fleet_revise'
                                ? 'Send revised offer'
                                : 'Send invitation'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'flex-end',
  },
  backdropWeb: {
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed' as 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100000,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }
      : {}),
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flexDirection: 'column',
    backgroundColor: Theme.surface,
    overflow: 'hidden',
    zIndex: 1,
    width: '100%',
  },
  sheetWeb: {
    maxWidth: 440,
    borderRadius: 28,
  },
  sheetMobile: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  hero: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 12,
  },
  heroMobile: {
    paddingTop: 8,
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroEyebrowRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  heroEyebrow: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: MINT,
    textTransform: 'uppercase',
  },
  heroCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 12px rgba(0,0,0,0.16)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.16,
          shadowRadius: 6,
          elevation: 5,
        }),
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroAvatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: EMERALD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  heroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: '100%',
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: MINT,
    lineHeight: 15,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 10,
  },
  reminderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.driverEmeraldBorderSoft,
    backgroundColor: Theme.driverEmeraldMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reminderText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  offerPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.driverEmeraldMuted,
    flexShrink: 0,
  },
  offerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: EMERALD,
  },
  fieldWrap: {
    minWidth: 0,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  splitRowStacked: {
    flexDirection: 'column',
    gap: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMuted,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 9,
    fontSize: 15,
    color: Theme.text,
    backgroundColor: Theme.surface,
  },
  payGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payGridStacked: {
    flexDirection: 'column',
  },
  payTile: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 2,
    minWidth: 0,
  },
  payTilePrimary: {
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: Theme.driverEmeraldBorderSoft,
  },
  payTileSecondary: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.border,
  },
  payTileFull: {
    width: '100%',
  },
  payTileGridCell: {
    flexBasis: '48%',
    flexGrow: 1,
    maxWidth: '48%',
  },
  payTileIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    marginBottom: 2,
  },
  payTileIconWrapPrimary: {
    backgroundColor: '#fff',
  },
  payTileAmount: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 24,
    color: Theme.text,
  },
  payTileLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: EMERALD,
  },
  payTileHint: {
    fontSize: 10,
    lineHeight: 13,
    color: Theme.textMuted,
  },
  emptyPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    padding: 12,
  },
  emptyPreviewText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
  },
  nextCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 6,
  },
  nextTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.text,
    marginBottom: 2,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  nextText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
  },
  errorText: {
    fontSize: 12,
    color: Theme.negative,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    flexShrink: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
  },
  actionFull: {
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  submitBtn: {
    flex: 1.55,
    height: 46,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    // White on the green gradient (matches the white send icon).
    color: '#fff',
    letterSpacing: -0.2,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
