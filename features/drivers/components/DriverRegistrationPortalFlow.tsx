/**
 * Driver add / invite flow — same single-page layout as Finance `PartyRegistrationPortal`.
 * Used for send-request and allocation "Add new driver" on native.
 */
import { ThemedAlertModal } from '@/components/ThemedAlertModal';
import { partyAddModalChromeStyles } from '@/components/PartyAddModalChrome';
import { FinanceTxnTypography } from '@/constants/FinanceTxnTypography';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { validateEmail } from '@/lib/emailValidation';
import { formatMobileNumber } from '@/lib/format';
import { pickContactForNameAndPhone } from '@/lib/contactPicker';
import {
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  Key,
  Mail,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExistingDriverMatch } from '../services/drivers.service';
import { searchExistingDriversByPhone } from '../services/drivers.service';
import type { DriverFormData } from './AddDriverModal';
import {
  DriverRegistrationFormFields,
  driverRegistrationFormStyles,
} from './DriverRegistrationFormFields';

const PHONE_DEBOUNCE_MS = 400;
const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const DL_SANITIZE_REGEX = /[\s-]/g;
// Serial block is 7 or 8 digits: most states issue 15-char DLs, some (e.g. AP) 16.
const DL_FORMAT_REGEX = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7,8}$/;

const READY_TO_SAVE_COPY =
  'Saved records stay private to your current organization — Finance, trips, and assignments will pick them up automatically.';

function validateDrivingLicenseNumber(licenseNumber: string): string | null {
  const trimmed = licenseNumber.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase().replace(DL_SANITIZE_REGEX, '');
  if (DL_FORMAT_REGEX.test(normalized)) return null;
  return 'Enter a valid DL number (e.g. MH12 20180001234).';
}

type Props = {
  onClose: () => void;
  onComplete: (data: DriverFormData) => void | Promise<void>;
  onAddDriver?: (data: DriverFormData) => void | Promise<void>;
  /** When true, bottom-sheet popup; when undefined, full-screen route. */
  visible?: boolean;
};

export function DriverRegistrationPortalFlow({
  onClose,
  onComplete,
  onAddDriver,
  visible,
}: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const layoutWide = windowWidth >= 720;

  const [step, setStep] = useState<'form' | 'review'>('form');
  const [formData, setFormData] = useState<DriverFormData>({
    driverSource: 'organization',
    name: '',
    phone: '',
    email: '',
    emergencyContact: '',
    emergencyName: '',
    licenseNumber: '',
    payableAmount: null,
    commissionPercent: null,
    commissionPerKm: null,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [existingMatches, setExistingMatches] = useState<ExistingDriverMatch[]>([]);
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [phoneLookupError, setPhoneLookupError] = useState<string | null>(null);
  const [preferOfflineOnly, setPreferOfflineOnly] = useState(false);
  const [fleetWarningMatch, setFleetWarningMatch] = useState<ExistingDriverMatch | null>(
    null,
  );
  const [showDriverCreateSuccess, setShowDriverCreateSuccess] = useState(false);
  const searchIdRef = useRef(0);

  useEffect(() => {
    if (visible === true) {
      setStep('form');
      setFormData({
        driverSource: 'organization',
        name: '',
        phone: '',
        email: '',
        emergencyContact: '',
        emergencyName: '',
        licenseNumber: '',
        payableAmount: null,
        commissionPercent: null,
        commissionPerKm: null,
      });
      setFormError(null);
      setSubmitting(false);
      setExistingMatches([]);
      setPhoneLookupLoading(false);
      setPhoneLookupError(null);
      setPreferOfflineOnly(false);
      setImportError(null);
    }
  }, [visible]);

  useEffect(() => {
    const normalized = formData.phone.trim().replace(/\s+/g, '');
    setExistingMatches([]);
    setPhoneLookupError(null);
    setPreferOfflineOnly(false);

    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneLookupLoading(false);
      return;
    }

    const id = ++searchIdRef.current;
    setPhoneLookupLoading(true);
    const timer = setTimeout(() => {
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (searchIdRef.current !== id) return;
        setPhoneLookupLoading(false);
        setPhoneLookupError(err?.message ?? null);
        setExistingMatches(matches);
        if (matches.length === 1) {
          const one = matches[0];
          setFormData((prev) =>
            prev.name.trim()
              ? prev
              : {
                  ...prev,
                  name: one.full_name,
                  phone: formatMobileNumber(one.phone.replace(/^\+91/, '')),
                  email: one.email?.trim() ?? prev.email,
                  licenseNumber: one.license_number?.trim() ?? prev.licenseNumber,
                },
          );
        }
      });
    }, PHONE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [formData.phone]);

  const formValues = useMemo(
    () => ({
      name: formData.name,
      phone: formData.phone,
      licenseNumber: formData.licenseNumber,
      email: formData.email,
      payableAmount: formData.payableAmount,
      commissionPercent: formData.commissionPercent,
      commissionPerKm: formData.commissionPerKm,
    }),
    [formData],
  );

  const buildPayload = (): DriverFormData => {
    const pn =
      normalizeIndianPhoneForMetadata(formData.phone) ?? formData.phone.trim();
    return {
      ...formData,
      name: formData.name.trim(),
      phone: pn,
      email: formData.email.trim(),
      licenseNumber: formData.licenseNumber.trim().toUpperCase(),
    };
  };

  const validateForm = (): boolean => {
    setFormError(null);
    if (existingMatches.some((m) => m.is_in_fleet === true)) {
      setFormError(t('existingDriverInFleetDetail'));
      return false;
    }
    if (formData.name.trim().length < 2) {
      setFormError("Enter the driver's name.");
      return false;
    }
    const pErr = validatePhone(formData.phone);
    if (pErr) {
      setFormError(pErr);
      return false;
    }
    if (!formData.licenseNumber.trim()) {
      setFormError('Enter the driving licence number.');
      return false;
    }
    const dlErr = validateDrivingLicenseNumber(formData.licenseNumber);
    if (dlErr) {
      setFormError(dlErr);
      return false;
    }
    const emailTrim = formData.email.trim();
    if (emailTrim) {
      const eErr = validateEmail(emailTrim);
      if (eErr) {
        setFormError(eErr);
        return false;
      }
    }
    return true;
  };

  const reviewUseInvite =
    existingMatches.length > 0 && !preferOfflineOnly && Boolean(onComplete);

  const reviewSaveLabel = reviewUseInvite ? t('sendInvitation') : t('addDriver');

  const phoneDisplay = useMemo(
    () => normalizeIndianPhoneForMetadata(formData.phone) ?? formData.phone.trim(),
    [formData.phone],
  );

  const summaryLines = useMemo(
    () => [
      {
        label: 'Driver name',
        value: formData.name.trim(),
        Icon: UserPlus,
        emphasis: true as const,
      },
      { label: 'Mobile', value: phoneDisplay, Icon: Smartphone },
      {
        label: 'Driving licence',
        value: formData.licenseNumber.trim().toUpperCase(),
        Icon: Key,
      },
      ...(formData.email.trim()
        ? [{ label: 'Email', value: formData.email.trim(), Icon: Mail }]
        : []),
      ...(formData.payableAmount != null && formData.payableAmount > 0
        ? [
            {
              label: 'Fixed salary',
              value: `₹${formData.payableAmount.toLocaleString('en-IN')}`,
              Icon: Building2,
            },
          ]
        : []),
      ...(formData.commissionPercent != null && formData.commissionPercent > 0
        ? [
            {
              label: 'Commission',
              value: `${formData.commissionPercent}%`,
              Icon: Building2,
            },
          ]
        : []),
      ...(formData.commissionPerKm != null && formData.commissionPerKm > 0
        ? [
            {
              label: 'Per km',
              value: `₹${formData.commissionPerKm}/km`,
              Icon: Building2,
            },
          ]
        : []),
    ],
    [formData, phoneDisplay],
  );

  const handleImportFromContacts = async () => {
    setImportError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setFormData((p) => ({
          ...p,
          name: result.contact.name,
          phone: formatMobileNumber(
            result.contact.phone.replace(/^\+91/, '').replace(/^\+/, ''),
          ),
        }));
        setExistingMatches([]);
        setPhoneLookupError(null);
      } else if (result.reason !== 'cancelled') {
        setImportError(
          result.message ?? 'Could not load contact. Please type manually.',
        );
      }
    } finally {
      setImportLoading(false);
    }
  };

  const goReview = () => {
    if (!validateForm()) return;
    const inFleet = existingMatches.find((m) => m.is_in_fleet === true);
    if (inFleet) {
      setFleetWarningMatch(inFleet);
      return;
    }
    setStep('review');
  };

  const confirmSave = async () => {
    if (!validateForm()) {
      setStep('form');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload = buildPayload();
    try {
      if (reviewUseInvite) {
        const result = onComplete(payload);
        if (typeof (result as Promise<unknown>)?.then === 'function') {
          await result;
        }
        onClose();
        return;
      }
      if (onAddDriver) {
        const result = onAddDriver(payload);
        if (typeof (result as Promise<unknown>)?.then === 'function') {
          await result;
        }
        setShowDriverCreateSuccess(true);
        return;
      }
      const result = onComplete(payload);
      if (typeof (result as Promise<unknown>)?.then === 'function') {
        await result;
      }
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : 'Something went wrong. Try again.';
      setFormError(msg);
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDriverSuccessOk = () => {
    setShowDriverCreateSuccess(false);
    onClose();
  };

  const fleetWarningModal = (
    <Modal
      transparent
      animationType="fade"
      visible={fleetWarningMatch != null}
      onRequestClose={() => setFleetWarningMatch(null)}
    >
      <View style={styles.fleetWarningBackdrop}>
        <View style={styles.fleetWarningCard}>
          <FontAwesome name="exclamation-triangle" size={18} color={Theme.negative} />
          <Text style={styles.fleetWarningTitle}>{t('existingDriverInFleet')}</Text>
          <Text style={styles.fleetWarningBody}>{t('existingDriverInFleetDetail')}</Text>
          <Pressable
            style={styles.fleetWarningActionBtn}
            onPress={() => setFleetWarningMatch(null)}
          >
            <Text style={styles.fleetWarningActionText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const body = (
    <>
      <View style={styles.portalHeader}>
        <Pressable style={styles.backBtn} onPress={onClose} hitSlop={12}>
          <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
        </Pressable>
      </View>

      {step === 'form' ? (
        <>
          <View style={styles.formHeader}>
            <View style={styles.liveDot} />
            <Text style={styles.formHeaderTitle}>New Driver</Text>
          </View>
          <Text style={styles.formHeaderHint}>Fill required fields and continue.</Text>
        </>
      ) : null}

      {formError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText}>{formError}</Text>
        </View>
      ) : null}

      {step === 'form' ? (
        <DriverRegistrationFormFields
          values={formValues}
          layoutWide={layoutWide}
          inviteMode
          importLoading={importLoading}
          importError={importError}
          onImportFromContacts={() => void handleImportFromContacts()}
          onChangeName={(v) => setFormData((p) => ({ ...p, name: v }))}
          onChangePhone={(v) => setFormData((p) => ({ ...p, phone: v }))}
          onChangeLicense={(v) => setFormData((p) => ({ ...p, licenseNumber: v }))}
          onChangeEmail={(v) => setFormData((p) => ({ ...p, email: v }))}
          onChangePayableAmount={(v) => setFormData((p) => ({ ...p, payableAmount: v }))}
          onChangeCommissionPercent={(v) =>
            setFormData((p) => ({ ...p, commissionPercent: v }))
          }
          onChangeCommissionPerKm={(v) =>
            setFormData((p) => ({ ...p, commissionPerKm: v }))
          }
          phoneLookupLoading={phoneLookupLoading}
          phoneLookupError={phoneLookupError}
          existingMatches={existingMatches}
          existingDriverHint={`${t('existingDriverOnPlatform')}. If this number matches a driver account, you can send an in-app invitation on the next step.`}
          existingDriverInFleetDetail={t('existingDriverInFleetDetail')}
          existingDriverNotInFleetHint="Tap Continue, then use Send request on the review screen to invite them in the app."
          onAddOfflineInstead={() => setPreferOfflineOnly(true)}
          preferOfflineOnly={preferOfflineOnly}
          submitting={submitting}
        />
      ) : (
        <View style={[styles.summarySheet, layoutWide && styles.summarySheetDesktop]}>
          <View style={styles.summaryDetailsCard}>
            <Text style={styles.summaryDetailsHeading}>Details</Text>
            {summaryLines.map((line, idx) => (
              <View
                key={`${line.label}-${idx}`}
                style={[
                  styles.summaryDetailRow,
                  line.emphasis && styles.summaryDetailRowEmphasis,
                ]}
              >
                <View style={styles.summaryDetailAccent} />
                <View style={styles.summaryDetailIconBubble}>
                  <line.Icon size={18} color="#334155" strokeWidth={2.2} />
                </View>
                <View style={styles.summaryDetailCopy}>
                  <Text style={styles.summaryDetailLabel}>{line.label}</Text>
                  <Text
                    style={[
                      styles.summaryDetailValue,
                      line.emphasis && styles.summaryDetailValueEmphasis,
                    ]}
                    numberOfLines={4}
                  >
                    {line.value || '—'}
                  </Text>
                </View>
              </View>
            ))}
            <View style={[styles.summaryDetailRow, styles.summaryDetailRowEmphasis]}>
              <View style={styles.summaryDetailAccent} />
              <View style={styles.summaryDetailIconBubble}>
                <ShieldCheck size={18} color="#1d4ed8" strokeWidth={2.2} />
              </View>
              <View style={styles.summaryDetailCopy}>
                <Text style={styles.summaryDetailLabel}>Ready to save</Text>
                <Text style={styles.summaryDetailValueProse} numberOfLines={12}>
                  {READY_TO_SAVE_COPY}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {step === 'review' &&
      existingMatches.length > 0 &&
      !existingMatches.some((m) => m.is_in_fleet === true) &&
      !preferOfflineOnly ? (
        <Pressable
          onPress={() => setPreferOfflineOnly(true)}
          disabled={submitting}
          style={styles.offlineLinkWrap}
        >
          <Text style={driverRegistrationFormStyles.offlineLinkText}>
            Add as offline driver instead
          </Text>
        </Pressable>
      ) : null}

      {step === 'form' ? (
        <Pressable
          style={[
            styles.primaryBtn,
            (existingMatches.some((m) => m.is_in_fleet === true) || submitting) &&
              styles.primaryBtnDisabled,
          ]}
          onPress={goReview}
          disabled={existingMatches.some((m) => m.is_in_fleet === true) || submitting}
          testID="driver-continue-btn"
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
          <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
      ) : (
        <View style={[styles.reviewActionsBar, layoutWide && styles.reviewActionsBarWide]}>
          <Pressable
            style={styles.reviewGhostBtn}
            onPress={() => setStep('form')}
            hitSlop={8}
            testID="driver-edit-details-btn"
          >
            <Text style={styles.ghostBtnText}>← Edit details</Text>
          </Pressable>
          <Pressable
            style={[
              styles.confirmBtn,
              styles.confirmBtnFlexible,
              submitting && styles.primaryBtnDisabled,
            ]}
            onPress={() => void confirmSave()}
            disabled={submitting}
            testID="invite-submit-btn"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Check size={22} color="#fff" strokeWidth={2.8} />
                <Text style={styles.confirmBtnText}>{reviewSaveLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </>
  );

  if (visible === true) {
    const windowHeight = Dimensions.get('window').height;
    const shellMaxH = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight,
      windowHeight * 0.92,
    );
    const shellMaxW = Math.min(540, Math.max(280, windowWidth - 36));

    return (
      <>
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={onClose}
          presentationStyle="overFullScreen"
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 16}
          >
            <View style={partyAddModalChromeStyles.overlay}>
              <Pressable
                style={partyAddModalChromeStyles.overlayDismissHit}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              />
              <View
                style={[
                  partyAddModalChromeStyles.shell,
                  { maxWidth: shellMaxW, maxHeight: shellMaxH },
                ]}
              >
                <ScrollView
                  style={styles.mainScroll}
                  contentContainerStyle={[
                    styles.mainScrollContent,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {body}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        {fleetWarningModal}
        <ThemedAlertModal
          visible={showDriverCreateSuccess}
          title="Driver added successfully"
          message=""
          okText="OK"
          onOk={handleDriverSuccessOk}
          onRequestClose={handleDriverSuccessOk}
          variant="neutral"
          okVariant="primary"
        />
      </>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.fullScreenRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[
            styles.mainScrollContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
      {fleetWarningModal}
      <ThemedAlertModal
        visible={showDriverCreateSuccess}
        title="Driver added successfully"
        message=""
        okText="OK"
        onOk={handleDriverSuccessOk}
        onRequestClose={handleDriverSuccessOk}
        variant="neutral"
        okVariant="primary"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fullScreenRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mainScroll: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#ffffff',
  },
  mainScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    flexGrow: 1,
  },
  portalHeader: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    backgroundColor: '#22c55e',
  },
  formHeaderTitle: {
    ...FinanceTxnTypography.partyTitle,
    flexShrink: 1,
  },
  formHeaderHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    lineHeight: 14,
    marginBottom: 12,
  },
  errorBar: {
    backgroundColor: '#fee2e2',
    padding: 12,
    marginBottom: 14,
  },
  errorBarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },
  summarySheet: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 12,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow:
            '0 2px 8px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.06)',
        } as ViewStyle)
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 20,
          elevation: 6,
        }),
  },
  summarySheetDesktop: {
    alignSelf: 'center',
    maxWidth: 560,
  },
  summaryDetailsCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#f8fafc',
    gap: 0,
  },
  summaryDetailsHeading: {
    ...FinanceTxnTypography.columnTitle,
    marginBottom: 10,
  },
  summaryDetailRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    marginBottom: 10,
    overflow: 'hidden',
  },
  summaryDetailRowEmphasis: {
    backgroundColor: '#fafbff',
  },
  summaryDetailAccent: {
    width: 4,
    backgroundColor: '#3b82f6',
  },
  summaryDetailIconBubble: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRightWidth: 1,
    borderRightColor: '#eef2f7',
  },
  summaryDetailCopy: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 0,
  },
  summaryDetailLabel: {
    ...FinanceTxnTypography.tripId,
    marginBottom: 4,
  },
  summaryDetailValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
  },
  summaryDetailValueEmphasis: {
    fontWeight: '700',
  },
  summaryDetailValueProse: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    lineHeight: 15,
    color: Theme.textSecondary,
  },
  offlineLinkWrap: {
    paddingBottom: 8,
  },
  primaryBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonDarkText,
    letterSpacing: 0.75,
  },
  ghostBtnText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.buttonPrimary,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 14,
  },
  confirmBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.75,
  },
  confirmBtnFlexible: {
    flex: 1,
    minHeight: 52,
  },
  reviewActionsBar: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 20,
    paddingTop: 4,
  },
  reviewActionsBarWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  reviewGhostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  fleetWarningBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fleetWarningCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  fleetWarningTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  fleetWarningBody: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  fleetWarningActionBtn: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  fleetWarningActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
