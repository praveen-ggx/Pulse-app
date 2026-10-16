/**
 * Add Driver modal — fields match pulse-unified-base AddDriverWizard 100%.
 * Steps: Driver Info (driver source, phone*, name), Contact (email, emergency), Documents (license), Review.
 * Driver Source: Organization Driver | Partner Driver (clean, scalable terminology).
 * When visible is true, shows as Ledger-style bottom-sheet popup; when undefined, full-screen wizard (e.g. route).
 */
import { ThemedAlertModal } from '@/components/ThemedAlertModal';
import { partyAddModalChromeStyles } from '@/components/PartyAddModalChrome';
import { WizardStepLayout } from '@/components/WizardStepLayout';
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { getSignedAvatarUrl } from '@/lib/avatarUpload';
import { pickContactForNameAndPhone } from '@/lib/contactPicker';
import { validatePhone } from '@/lib/phoneValidation';
import { formatMobileNumber } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
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
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExistingDriverMatch } from '../services/drivers.service';
import { getDriverProfileAvatar, searchExistingDriversByPhone } from '../services/drivers.service';
import { hasDriverInviteCompensation } from '../utils/driverInviteCompensation.util';
import { DriverRegistrationPortalFlow } from './DriverRegistrationPortalFlow';

export type DriverSource = 'organization' | 'partner';

export interface DriverFormData {
  driverSource: DriverSource;
  name: string;
  phone: string;
  email: string;
  emergencyContact: string;
  emergencyName: string;
  licenseNumber: string;
  /** Optional offer: fixed salary (e.g. monthly ₹). */
  payableAmount: number | null;
  /** Optional offer: commission %. */
  commissionPercent: number | null;
  /** Optional offer: per-km rate (₹/km). */
  commissionPerKm: number | null;
}

const STEPS_FULL_KEYS = [
  { id: 'driver', titleKey: 'driverInfo', descriptionKey: 'basicDetails' },
  { id: 'contact', titleKey: 'contactStep', descriptionKey: 'phoneAndEmail' },
  { id: 'documents', titleKey: 'documents', descriptionKey: 'licenseInfo' },
  { id: 'salary', titleKey: 'salaryStep', descriptionKey: 'compensationRequired' },
  { id: 'review', titleKey: 'review', descriptionKey: 'sendInvite' },
];

const defaultFormData: DriverFormData = {
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
};

interface AddDriverModalProps {
  onClose: () => void;
  /** Called when "Send Invitation" is tapped. May return a Promise; modal closes after it resolves. */
  onComplete: (data: DriverFormData) => void | Promise<void>;
  /** Optional. When provided, "Add Driver" is shown on review step; called when tapped (add driver directly, no invite). */
  onAddDriver?: (data: DriverFormData) => void;
  /** When true, show as Ledger-style bottom-sheet popup. When undefined, full-screen (e.g. add-driver route). */
  visible?: boolean;
  /** When true (e.g. from Finance Drivers tab), only add salaried driver: step 1 = DL, name, phone; step 2 = salary split (fixed, commission %, per km). Requires onAddDriver; no invite. */
  salariedOnly?: boolean;
}

const PHONE_DEBOUNCE_MS = 400;
const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const DL_SANITIZE_REGEX = /[\s-]/g;
// Serial block is 7 or 8 digits: most states issue 15-char DLs, some (e.g. AP) 16.
const DL_FORMAT_REGEX = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7,8}$/;

const validateDrivingLicenseNumber = (licenseNumber: string): string | null => {
  const trimmed = licenseNumber.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase().replace(DL_SANITIZE_REGEX, '');
  if (DL_FORMAT_REGEX.test(normalized)) return null;
  return 'Enter a valid DL number (e.g. MH12 20180001234).';
};

export function AddDriverModal(props: AddDriverModalProps) {
  const { visible, salariedOnly = false, onClose, onComplete, onAddDriver } = props;
  if (visible === false) return null;
  if (salariedOnly) {
    return (
      <DriverRegistrationPortalFlow
        onClose={onClose}
        onComplete={onComplete}
        onAddDriver={onAddDriver}
        visible={visible}
      />
    );
  }
  return <AddDriverWizardModal {...props} />;
}

function AddDriverWizardModal({ onClose, onComplete, onAddDriver, visible }: AddDriverModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const STEPS_BASE = STEPS_FULL_KEYS;
  const STEPS = STEPS_BASE.map((s) => ({ id: s.id, title: t(s.titleKey), description: t(s.descriptionKey) }));
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<DriverFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingMatches, setExistingMatches] = useState<ExistingDriverMatch[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [phoneSearchError, setPhoneSearchError] = useState<string | null>(null);
  const [phoneValidationError, setPhoneValidationError] = useState<string | null>(null);
  const [emergencyPhoneValidationError, setEmergencyPhoneValidationError] = useState<string | null>(null);
  const [licenseValidationError, setLicenseValidationError] = useState<string | null>(null);
  const [selectedMatchUserId, setSelectedMatchUserId] = useState<string | null>(null);
  const [existingMatchAvatarByUserId, setExistingMatchAvatarByUserId] = useState<Record<string, string>>({});
  const [avatarLoadFailedByUserId, setAvatarLoadFailedByUserId] = useState<Record<string, boolean>>({});
  const [fleetWarningMatch, setFleetWarningMatch] = useState<ExistingDriverMatch | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [showDriverCreateSuccess, setShowDriverCreateSuccess] = useState(false);
  const searchIdRef = useRef(0);

  const handleDriverSuccessOk = () => {
    setShowDriverCreateSuccess(false);
    onClose();
  };

  const handleImportFromContacts = async () => {
    setError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setFormData((p) => ({ ...p, name: result.contact.name, phone: result.contact.phone }));
      } else if (result.reason === 'no_phone' || result.reason === 'permission_denied' || result.reason === 'unavailable') {
        setError(result.message ?? (result.reason === 'permission_denied' ? t('contactAccessDenied') : t('couldNotLoadContact')));
      }
    } finally {
      setImportLoading(false);
    }
  };

  const validateEmergencyPhone = (phone: string) => {
    const trimmed = phone.trim();
    if (trimmed === '') {
      setEmergencyPhoneValidationError(null);
      return;
    }
    const error = validatePhone(trimmed);
    setEmergencyPhoneValidationError(error);
  };

  // Reset form when modal opens so each open shows empty fields (not previous submission).
  useEffect(() => {
    if (visible === true) {
      setFormData(defaultFormData);
      setError(null);
      setSubmitting(false);
      setExistingMatches([]);
      setPhoneSearchLoading(false);
      setPhoneSearchError(null);
      setPhoneValidationError(null);
      setEmergencyPhoneValidationError(null);
      setLicenseValidationError(null);
      setSelectedMatchUserId(null);
      setExistingMatchAvatarByUserId({});
      setAvatarLoadFailedByUserId({});
      setFleetWarningMatch(null);
      setImportLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    const loadExistingDriverAvatars = async () => {
      if (existingMatches.length === 0) {
        setExistingMatchAvatarByUserId({});
        setAvatarLoadFailedByUserId({});
        return;
      }
      const pairs = await Promise.all(
        existingMatches.map(async (match) => {
          const directAvatarUrl = (match.avatar_url ?? '').trim();
          if (directAvatarUrl) {
            if (directAvatarUrl.startsWith('http://') || directAvatarUrl.startsWith('https://')) {
              return [match.user_id, directAvatarUrl] as const;
            }
            const directSignedUrl = await getSignedAvatarUrl(directAvatarUrl);
            if (directSignedUrl) return [match.user_id, directSignedUrl] as const;
          }

          const directSeed = (match.avatar_seed ?? '').trim();
          if (directSeed) return [match.user_id, getAvatarUriForSeed(directSeed)] as const;

          const { avatar } = await getDriverProfileAvatar(match.user_id);
          const avatarUrl = (avatar?.avatar_url ?? '').trim();
          if (avatarUrl) {
            if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
              return [match.user_id, avatarUrl] as const;
            }
            const signedUrl = await getSignedAvatarUrl(avatarUrl);
            if (signedUrl) return [match.user_id, signedUrl] as const;
          }
          const avatarSeed = (avatar?.avatar_seed ?? '').trim();
          if (avatarSeed) return [match.user_id, getAvatarUriForSeed(avatarSeed)] as const;
          const userPathFallback = await getSignedAvatarUrl(match.user_id);
          if (userPathFallback) return [match.user_id, userPathFallback] as const;
          return [match.user_id, ''] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      pairs.forEach(([userId, uri]) => {
        if (uri) next[userId] = uri;
      });
      setExistingMatchAvatarByUserId(next);
      setAvatarLoadFailedByUserId({});
    };
    loadExistingDriverAvatars();
    return () => {
      cancelled = true;
    };
  }, [existingMatches]);

  const step = STEPS[stepIndex];

  // Debounced lookup: when phone changes, after delay search existing drivers (single RPC, O(1) result).
  useEffect(() => {
    const normalized = formData.phone.trim().replace(/\s+/g, '');
    setExistingMatches([]);
    setPhoneSearchError(null);
    setSelectedMatchUserId(null);
    
    // Validate phone
    const phoneError = normalized ? validatePhone(normalized) : null;
    setPhoneValidationError(phoneError);
    
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++searchIdRef.current;
    setPhoneSearchLoading(true);
    const t = setTimeout(() => {
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (searchIdRef.current !== id) return;
        setPhoneSearchLoading(false);
        setPhoneSearchError(err?.message ?? null);
        setExistingMatches(matches);
        if (matches.length === 1) {
          const one = matches[0];
          setSelectedMatchUserId(one.user_id);
          setFormData((prev) =>
            prev.name.trim()
              ? prev
              : {
                  ...prev,
                  name: one.full_name,
                  phone: one.phone,
                  email: one.email?.trim() ?? prev.email,
                  emergencyName: one.emergency_contact_name?.trim() ?? prev.emergencyName,
                  emergencyContact: one.emergency_contact_phone?.trim() ?? prev.emergencyContact,
                  licenseNumber: one.license_number?.trim() ?? prev.licenseNumber,
                }
          );
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [formData.phone]);
  useEffect(() => {
    setLicenseValidationError(validateDrivingLicenseNumber(formData.licenseNumber));
  }, [formData.licenseNumber]);
  const isReview = step.id === 'review';
  const canProceedDriver = !!formData.phone.trim() && !phoneValidationError;
  /**
   * Pay terms are mandatory. Without them every trip this driver runs falls back
   * to a silent 10%-of-trip-value guess that nobody agreed to, so the terms have
   * to be settled here rather than invented later.
   */
  const canProceedSalary = hasDriverInviteCompensation({
    payableAmount: formData.payableAmount,
    commissionPercent: formData.commissionPercent,
    commissionPerKm: formData.commissionPerKm,
  });
  const canProceed =
    step.id === 'driver'
      ? canProceedDriver
      : step.id === 'salary'
        ? canProceedSalary
        : true;

  /**
   * On review: show Send Invitation only when phone maps to an existing driver account.
   * If no existing account is found for this phone, fall back to Add Driver.
   */
  const reviewUseInvite = Boolean(onComplete) && existingMatches.length > 0;

  const handleNext = () => {
    if (step.id === 'driver') {
      const inFleetMatch = existingMatches.find((m) => m.is_in_fleet === true) ?? null;
      if (inFleetMatch) {
        setFleetWarningMatch(inFleetMatch);
        return;
      }
    }
    if (isReview) {
      setError(null);
      setSubmitting(true);
      if (reviewUseInvite) {
        const result = onComplete(formData);
        const p = result as void | Promise<unknown>;
        if (typeof p?.then === 'function') {
          p.then(() => {
            setSubmitting(false);
            onClose();
          }).catch((err: Error) => {
            setSubmitting(false);
            setError(err?.message ?? 'Failed to send invitation');
          });
        } else {
          setSubmitting(false);
          onClose();
        }
      } else if (onAddDriver) {
        const result = onAddDriver(formData) as void | Promise<unknown>;
        if (typeof result?.then === 'function') {
          result
            .then(() => {
              setSubmitting(false);
              setShowDriverCreateSuccess(true);
            })
            .catch((err: Error) => {
              setSubmitting(false);
              setError(err?.message ?? 'Failed to add driver');
            });
        } else {
          setSubmitting(false);
          setShowDriverCreateSuccess(true);
        }
      }
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else onClose();
  };

  const inputStyle = [styles.input, { borderColor: Theme.borderInput, backgroundColor: Theme.surfaceForm, color: Theme.textPrimary }];
  const labelStyle = [styles.label, { color: Theme.textMutedDemo }];

  const renderStep = () => {
    switch (step.id) {
      case 'driver':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>Driver Source</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.toggleOption,
                      formData.driverSource === 'organization' && styles.toggleOptionActive,
                    ]}
                    onPress={() => setFormData((p) => ({ ...p, driverSource: 'organization' as const }))}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        formData.driverSource === 'organization' && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('organizationDriver')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleOption, formData.driverSource === 'partner' && styles.toggleOptionActive]}
                    onPress={() => setFormData((p) => ({ ...p, driverSource: 'partner' as const }))}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        formData.driverSource === 'partner' && styles.toggleOptionTextActive,
                      ]}
                    >
                      Partner Driver
                    </Text>
                  </TouchableOpacity>
                </View>
            <Text style={labelStyle}>
              Phone number <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TextInput
              testID="driver-phone-input"
              style={inputStyle}
              placeholder="+91 98765 43210"
              placeholderTextColor={Theme.placeholder}
              value={formData.phone}
              onChangeText={(v) => setFormData((p) => ({ ...p, phone: formatMobileNumber(v) }))}
              keyboardType="phone-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            {phoneValidationError && (
              <Text style={[styles.errorText, { color: Theme.negative }]}>
                {phoneValidationError}
              </Text>
            )}
            <Text style={labelStyle}>
              Contact name <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TextInput
              testID="driver-name-input"
              style={inputStyle}
              placeholder="e.g. Suresh Kumar"
              placeholderTextColor={Theme.placeholder}
              value={formData.name}
              onChangeText={(v) => setFormData((p) => ({ ...p, name: v }))}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <TouchableOpacity
              style={styles.importFromContactsRow}
              onPress={handleImportFromContacts}
              disabled={importLoading}
              activeOpacity={0.7}
            >
              <View style={styles.importFromContactsIconWrap}>
                {importLoading ? (
                  <ActivityIndicator size="small" color={Theme.buttonMatteBlackText} />
                ) : (
                  <FontAwesome name="address-book-o" size={14} color={Theme.buttonMatteBlackText} />
                )}
              </View>
              <View style={styles.importFromContactsTextWrap}>
                <Text style={styles.importFromContactsText}>
                  {importLoading ? t('linking') : t('importFromContacts')}
                </Text>
                <Text style={styles.importFromContactsSubtitle}>
                  Fill name and phone from your address book.
                </Text>
              </View>
            </TouchableOpacity>
            {phoneSearchLoading && (
              <View style={styles.existingRow}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.existingHint}>Searching for existing drivers…</Text>
              </View>
            )}
            {!phoneSearchLoading && phoneSearchError && (
              <Text style={[styles.existingError, { color: Theme.negative }]}>{phoneSearchError}</Text>
            )}
            {!phoneSearchLoading && existingMatches.length > 0 && (
              <View style={styles.existingList}>
                <Text style={styles.existingLabel}>{t('existingDriverOnPlatform')}</Text>
                {existingMatches.map((match) => {
                  const inFleet = match.is_in_fleet === true;
                  const avatarUri = existingMatchAvatarByUserId[match.user_id] ?? '';
                  const avatarFailed = avatarLoadFailedByUserId[match.user_id] === true;
                  const initial = (match.full_name || match.phone || 'D').trim().charAt(0).toUpperCase();
                  return (
                    <TouchableOpacity
                      key={match.user_id}
                      style={[
                        styles.existingItem,
                        selectedMatchUserId === match.user_id && styles.existingItemSelected,
                      ]}
                      onPress={() => {
                        if (inFleet) {
                          setFleetWarningMatch(match);
                          return;
                        }
                        setFormData((p) => ({
                          ...p,
                          phone: match.phone,
                          name: match.full_name || p.name,
                          email: match.email?.trim() ?? p.email,
                          emergencyName: match.emergency_contact_name?.trim() ?? p.emergencyName,
                          emergencyContact: match.emergency_contact_phone?.trim() ?? p.emergencyContact,
                          licenseNumber: match.license_number?.trim() ?? p.licenseNumber,
                        }));
                        setSelectedMatchUserId(match.user_id);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.existingHeadRow}>
                        <View style={styles.existingAvatar}>
                          {avatarUri && !avatarFailed ? (
                            <Image
                              source={{ uri: avatarUri }}
                              style={styles.existingAvatarImage}
                              onError={() =>
                                setAvatarLoadFailedByUserId((prev) => ({
                                  ...prev,
                                  [match.user_id]: true,
                                }))
                              }
                            />
                          ) : (
                            <Text style={styles.existingAvatarInitial}>{initial}</Text>
                          )}
                        </View>
                        <View style={styles.existingHeadInfo}>
                          <Text style={styles.existingItemName} numberOfLines={1}>
                            {match.full_name || match.phone || 'Driver'}
                          </Text>
                          {match.phone ? (
                            <Text style={styles.existingItemPhone} numberOfLines={1}>
                              {match.phone}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Text
                        style={inFleet ? styles.existingFleetStatusInFleet : styles.existingFleetStatusNeutral}
                      >
                        {inFleet ? t('existingDriverInFleet') : t('existingDriverNotInFleet')}
                      </Text>
                      {inFleet ? (
                        <Text style={styles.existingFleetStatusDetail}>
                          {t('existingDriverInFleetDetail')}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      case 'contact':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>{t('email')}</Text>
            <TextInput
              style={inputStyle}
              placeholder="driver@email.com"
              placeholderTextColor={Theme.placeholder}
              value={formData.email}
              onChangeText={(v) => setFormData((p) => ({ ...p, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>{t('emergencyContactLabel')}</Text>
            <View style={styles.emergencyBox}>
              <TextInput
                style={inputStyle}
                placeholder="Emergency contact name"
                placeholderTextColor={Theme.placeholder}
                value={formData.emergencyName}
                onChangeText={(v) => setFormData((p) => ({ ...p, emergencyName: v }))}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <TextInput
                style={inputStyle}
                placeholder="Emergency phone number"
                placeholderTextColor={Theme.placeholder}
                value={formData.emergencyContact}
                onChangeText={(v) => {
                  const formatted = formatMobileNumber(v);
                  setFormData((p) => ({ ...p, emergencyContact: formatted }));
                  validateEmergencyPhone(formatted);
                }}
                keyboardType="phone-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {emergencyPhoneValidationError && (
                <Text style={[styles.errorText, { color: Theme.negative }]}>
                  {emergencyPhoneValidationError}
                </Text>
              )}
            </View>
          </View>
        );
      case 'documents':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>License Number</Text>
            <TextInput
              style={[inputStyle, { fontFamily: 'monospace' }]}
              placeholder="DL-XXXXXXXXXX"
              placeholderTextColor={Theme.placeholder}
              value={formData.licenseNumber}
              onChangeText={(v) => setFormData((p) => ({ ...p, licenseNumber: v }))}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            {licenseValidationError && (
              <Text style={[styles.errorText, { color: Theme.negative }]}>
                {licenseValidationError}
              </Text>
            )}
          </View>
        );
      case 'salary':
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.errorText, { color: Theme.textMuted, marginBottom: 8 }]}>
              Set at least one pay term. Trips are priced from these, so leaving them
              blank means the driver&apos;s earnings get estimated instead of agreed.
            </Text>
            <Text style={labelStyle}>Fixed salary (₹)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 25000"
              placeholderTextColor={Theme.placeholder}
              value={formData.payableAmount != null && formData.payableAmount !== 0 ? String(formData.payableAmount) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                setFormData((p) => ({ ...p, payableAmount: n != null && !Number.isNaN(n) ? n : null }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>Commission (%)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 10"
              placeholderTextColor={Theme.placeholder}
              value={formData.commissionPercent != null && formData.commissionPercent !== 0 ? String(formData.commissionPercent) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                const val = n != null && !Number.isNaN(n) ? Math.min(100, Math.max(0, n)) : null;
                setFormData((p) => ({ ...p, commissionPercent: val }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>Per km (₹/km)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 8"
              placeholderTextColor={Theme.placeholder}
              value={formData.commissionPerKm != null && formData.commissionPerKm !== 0 ? String(formData.commissionPerKm) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                setFormData((p) => ({ ...p, commissionPerKm: n != null && !Number.isNaN(n) && n >= 0 ? n : null }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
        );
      case 'review':
        return (
          <ScrollView style={styles.reviewScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewAvatar}>
                  <FontAwesome name="user" size={24} color={Theme.textMutedDemo} />
                </View>
                <View style={styles.reviewHeaderContent}>
                  <Text style={styles.reviewName}>{formData.name || 'New Driver'}</Text>
                  <Text style={styles.reviewSub}>
                    {formData.driverSource === 'organization' ? t('organizationDriver') : t('partnerDriver')}
                  </Text>
                  {reviewUseInvite && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending Invitation</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.reviewDivider} />

              <View style={styles.reviewSection}>
                <View style={styles.reviewRow}>
                  <FontAwesome name="phone" size={14} color={Theme.textMutedDemo} style={styles.reviewIcon} />
                  <Text style={styles.reviewValue}>{formData.phone}</Text>
                </View>
                {formData.email ? (
                  <View style={styles.reviewRow}>
                    <FontAwesome name="envelope" size={14} color={Theme.textMutedDemo} style={styles.reviewIcon} />
                    <Text style={styles.reviewValue}>{formData.email}</Text>
                  </View>
                ) : null}
                {formData.licenseNumber ? (
                  <View style={styles.reviewRow}>
                    <FontAwesome name="id-card" size={14} color={Theme.textMutedDemo} style={styles.reviewIcon} />
                    <Text style={styles.reviewValue}>DL: {formData.licenseNumber}</Text>
                  </View>
                ) : null}
              </View>

              {((formData.payableAmount != null && formData.payableAmount > 0) ||
                (formData.commissionPercent != null && formData.commissionPercent > 0) ||
                (formData.commissionPerKm != null && formData.commissionPerKm > 0)) && (
                <>
                  <View style={styles.reviewDivider} />
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Offer</Text>
                    {formData.payableAmount != null && formData.payableAmount > 0 && (
                      <View style={styles.reviewOfferRow}>
                        <Text style={styles.reviewOfferLabel}>Salary</Text>
                        <Text style={styles.reviewOfferValue}>₹{formData.payableAmount.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {formData.commissionPercent != null && formData.commissionPercent > 0 && (
                      <View style={styles.reviewOfferRow}>
                        <Text style={styles.reviewOfferLabel}>Commission</Text>
                        <Text style={styles.reviewOfferValue}>{formData.commissionPercent}%</Text>
                      </View>
                    )}
                    {formData.commissionPerKm != null && formData.commissionPerKm > 0 && (
                      <View style={styles.reviewOfferRow}>
                        <Text style={styles.reviewOfferLabel}>Per km</Text>
                        <Text style={styles.reviewOfferValue}>₹{formData.commissionPerKm}/km</Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {(formData.emergencyName || formData.emergencyContact) && (
                <>
                  <View style={styles.reviewDivider} />
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>{t('emergencyContactLabel')}</Text>
                    <View style={styles.reviewRow}>
                      <FontAwesome name="heart" size={14} color={Theme.negative} style={styles.reviewIcon} />
                      <Text style={styles.reviewValue}>
                        {formData.emergencyName} - {formData.emergencyContact}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
            {onAddDriver && (
              <TouchableOpacity
                style={[styles.addDriverBtn, submitting && styles.addDriverBtnDisabled]}
                disabled={submitting}
                onPress={async () => {
                  setError(null);
                  setSubmitting(true);
                  const result = onAddDriver(formData) as void | Promise<unknown>;
                  if (typeof result?.then === 'function') {
                    result
                      .then(() => {
                        setSubmitting(false);
                        setShowDriverCreateSuccess(true);
                      })
                      .catch((err: Error) => {
                        setSubmitting(false);
                        setError(err?.message ?? 'Failed to add driver');
                      });
                  } else {
                    setSubmitting(false);
                    setShowDriverCreateSuccess(true);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.addDriverBtnText}>{submitting ? 'Adding…' : 'Add Driver'}</Text>
              </TouchableOpacity>
            )}
            {error ? (
              <Text style={[styles.errorText, { color: Theme.negative }]}>{error}</Text>
            ) : null}
          </ScrollView>
        );
      default:
        return null;
    }
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
          <View style={styles.fleetWarningIconWrap}>
            <FontAwesome name="exclamation-triangle" size={18} color={Theme.negative} />
          </View>
          <Text style={styles.fleetWarningEyebrow}>Action needed</Text>
          <Text style={styles.fleetWarningTitle}>{t('existingDriverInFleet')}</Text>
          <Text style={styles.fleetWarningBody}>
            {t('existingDriverInFleetDetail')}
          </Text>
          {fleetWarningMatch?.full_name ? (
            <View style={styles.fleetWarningDriverChip}>
              <Text style={styles.fleetWarningDriverName}>
                Driver: {fleetWarningMatch.full_name}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.fleetWarningActionBtn}
            onPress={() => setFleetWarningMatch(null)}
            activeOpacity={0.85}
          >
            <Text style={styles.fleetWarningActionText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (visible === true) {
    const windowHeight = Dimensions.get('window').height;
    const windowWidth = Dimensions.get('window').width;
    const shellMaxH = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight,
      windowHeight * 0.92,
    );
    const shellMaxW = Math.min(540, Math.max(280, windowWidth - 36));
    const popupHeight = shellMaxH;
    const footerRightLabel =
      isReview && submitting
        ? (reviewUseInvite ? t('sending') : t('adding'))
        : isReview
          ? (reviewUseInvite ? t('sendInvitation') : t('addDriver'))
          : 'Continue';
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
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
                {
                  maxWidth: shellMaxW,
                  maxHeight: shellMaxH,
                  height: popupHeight,
                },
              ]}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  paddingHorizontal: 24,
                  paddingTop: 24,
                  paddingBottom: insets.bottom + Layout.modalBottomPadding,
                }}
              >
              <View style={popupStyles.headerRow}>
                <Text style={popupStyles.title}>Add Driver</Text>
              </View>
              <View style={popupStyles.dotsRow}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[popupStyles.dot, i === stepIndex && popupStyles.dotActive]} />
                ))}
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={popupStyles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={popupStyles.scrollContent}
              >
                {renderStep()}
              </ScrollView>
              <View style={popupStyles.footer}>
                <TouchableOpacity style={popupStyles.footerLeft} onPress={handleBack}>
                  <Text style={popupStyles.footerLeftText}>{stepIndex > 0 ? 'Back' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={isReview ? 'invite-submit-btn' : undefined}
                  style={[
                    popupStyles.footerRight,
                    (submitting || (!isReview && !canProceed)) && popupStyles.footerRightDisabled,
                  ]}
                  onPress={handleNext}
                  disabled={submitting || (!isReview && !canProceed)}
                >
                  <Text style={popupStyles.footerRightText}>{footerRightLabel}</Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          </View>
          {fleetWarningModal}
        </KeyboardAvoidingView>
      </Modal>
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
    <WizardStepLayout
      title="Add Driver"
      stepLabel={step.title}
      stepIndex={stepIndex}
      stepCount={STEPS.length}
      onBack={handleBack}
      onClose={onClose}
      footerLeftLabel={stepIndex > 0 ? 'Back' : 'Cancel'}
      footerRightLabel={
        isReview && submitting
          ? (reviewUseInvite ? t('sending') : t('adding'))
          : isReview
            ? (reviewUseInvite ? t('sendInvitation') : t('addDriver'))
            : 'Continue'
      }
      onFooterLeft={handleBack}
      onFooterRight={handleNext}
      footerRightDisabled={submitting || (!isReview && !canProceed)}
      footerRightTestID={isReview ? 'invite-submit-btn' : undefined}
    >
      {renderStep()}
      {fleetWarningModal}
    </WizardStepLayout>
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
  stepContent: { gap: 14 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
  },
  requiredMark: {
    color: Theme.negative,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
  toggleOptionActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceLight,
  },
  toggleOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  toggleOptionTextActive: {
    color: Theme.textPrimaryDark,
  },
  importFromContactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: Theme.screenBackground,
  },
  importFromContactsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importFromContactsTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  importFromContactsText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  importFromContactsSubtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  existingHint: {
    fontSize: 12,
    color: Theme.textMutedDemo,
  },
  existingError: {
    fontSize: 12,
    marginBottom: 4,
  },
  existingList: {
    gap: 8,
    marginBottom: 4,
  },
  existingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  existingItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  existingItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  existingHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  existingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  existingAvatarImage: {
    width: '100%',
    height: '100%',
  },
  existingAvatarInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  existingHeadInfo: {
    flex: 1,
    minWidth: 0,
  },
  existingItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  existingItemPhone: {
    fontSize: 12,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  /** Driver is linked to at least one org with left_at IS NULL — warn dispatcher. */
  existingFleetStatusInFleet: {
    fontSize: 11,
    marginTop: 6,
    color: Theme.negative,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  /** Driver account exists but no active drivers row — invite flow is appropriate. */
  existingFleetStatusNeutral: {
    fontSize: 11,
    marginTop: 6,
    color: Theme.textMutedDemo,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  existingFleetStatusDetail: {
    fontSize: 11,
    marginTop: 4,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  fleetWarningBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fleetWarningCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
  },
  fleetWarningIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(244,63,94,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  fleetWarningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  fleetWarningEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.negative,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  fleetWarningBody: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  fleetWarningDriverChip: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  fleetWarningDriverName: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  fleetWarningActionBtn: {
    marginTop: 16,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(244,63,94,0.14)',
    borderWidth: 1,
    borderColor: Theme.negative,
    alignItems: 'center',
  },
  fleetWarningActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.negative,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 52,
    backgroundColor: Theme.screenBackground,
  },
  emergencyBox: { gap: 12 },
  reviewScroll: { flex: 1 },
  reviewCard: {
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
    overflow: 'hidden',
  },
  reviewHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 16,
    backgroundColor: Theme.surfaceLight,
  },
  reviewAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewHeaderContent: {
    flex: 1,
  },
  reviewName: { fontSize: 16, fontWeight: '700', color: Theme.textPrimaryDark, textTransform: 'uppercase' },
  reviewSub: { fontSize: 12, color: Theme.textMutedDemo, marginTop: 2 },
  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.warningMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.warning,
    textTransform: 'uppercase',
  },
  reviewDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
  },
  reviewSection: {
    padding: 16,
    gap: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewIcon: {
    width: 16,
    textAlign: 'center',
  },
  reviewLabel: { fontSize: 10, color: Theme.textMutedDemo, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5, marginBottom: -4 },
  reviewValue: { fontSize: 14, color: Theme.textPrimary, fontWeight: '500' },
  reviewOfferRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  reviewOfferLabel: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  reviewOfferValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  emergencyReview: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Theme.borderLight },
  addDriverBtn: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  addDriverBtnDisabled: { opacity: 0.6 },
  addDriverBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorText: { fontSize: 12, marginTop: 12, marginBottom: 4 },
});

const popupStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.borderInput,
  },
  dotActive: {
    backgroundColor: Theme.textPrimaryDark,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingBottom: 8,
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  footerLeft: { paddingVertical: 6, paddingHorizontal: 4 },
  footerLeftText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerRight: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    backgroundColor: Theme.buttonMatteBlack,
  },
  footerRightDisabled: { opacity: 0.5 },
  footerRightText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.buttonMatteBlackText,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
