/**
 * Driver sign-up: multi-step widget (moving pages).
 * Step 1: Phone number
 * Step 2: OTP entry (UI only; any 4 digits to proceed)
 * Step 3: Full name, email (optional), password
 * Step 4: Choose avatar
 * Step 5: Success, go to app
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PULSE_PILOT_BRAND_WORD } from '@/lib/brand/pulseBrandMark.tokens';
import { getSignupPresetAvatars } from '@/constants/DriverLevels';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { checkExistingUserByPhone, setPendingOAuthMetadata } from '@/features/auth/services/auth.service';
import { useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';
import { validateEmail } from '@/lib/emailValidation';
import { isPhoneValid, validatePhone } from '@/lib/phoneValidation';
import { formatMobileNumber } from '@/lib/format';
import { showAppAlert } from '@/lib/appAlert';
import { supabase } from '@/lib/supabase';
import { useSafeBack } from '@/lib/useSafeBack';
import { signUpPasswordInputProps } from '@/lib/signupPasswordInput.util';
import { VALIDATION, validatePassword } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputKeyPressEventData,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import { SignUpMobileShell } from '@/features/auth/signup/SignUpMobileShell';
import { PHONE_CHECK_DEBOUNCE_MS } from '@/features/auth/signup/signUpConstants';
import { SignUpPhotoPickerBody } from '@/features/auth/signup/components/SignUpPhotoPickerStep';
import { DriverSignupSuccessStep } from '@/features/auth/signup/steps/DriverSignupSuccessStep';
import { SignUpPulseField } from '@/features/auth/signup/SignUpPulseField';
import { SignUpPulseKeypadStep } from '@/features/auth/signup/SignUpPulseKeypadStep';
import { SignUpPulsePrimaryButton } from '@/features/auth/signup/SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from '@/features/auth/signup/SignUpPulseTitle';
import { SignUpOtpBoxes } from '@/features/auth/signup/SignUpOtpBoxes';
import { formatSignupPhoneDisplay } from '@/features/auth/signup/signUpKeypad.util';
import { DRIVER_SIGNUP } from '@/features/auth/signup/signUpDriverTheme';
import { DRIVER_SIGNUP_HERO_MASCOT } from '@/features/auth/signup/signUpDriverLottieAssets';
import { createPulseSignUpTextStyles } from '@/features/auth/signup/signUpTypography';
import { suiteSignUpCopy } from '@/lib/suite/suiteAuthContent';
import { updateProfile } from '@/features/auth/services/auth.service';
import { pickLocalAvatar, uploadAvatarFromLocal } from '@/lib/avatarUpload';
import { submitDriverKycDocument } from '@/features/drivers/services/driverKycDocuments.service';
import {
  clearDriverSignupSuccess,
  hydrateDriverSignupSuccessFlag,
  setDriverSignupSuccessActive,
} from '@/lib/onboarding/businessSignupBranding.util';
import { ROUTES } from '@/lib/routes';
import { signUpMobileStyles as mobileSignup } from '@/features/auth/signup/signUpMobile.styles';

const DRIVER_AVATAR_STORAGE_KEY = 'driver_avatar_seed';

const DRIVER_STEP_LABELS = [
  'Phone',
  'Verify',
  'Account',
  'License',
  'Aadhaar',
  'PAN',
  'Photo',
  'Done',
] as const;

// Professional wording per step (title + subtitle), no "Step 1/2" labels
const STEP_CONTENT = [
  { title: 'Welcome aboard as driver', subtitle: 'Enter your Indian mobile number to get started.' },
  { title: 'Verify your number', subtitle: 'Enter the 4-digit code we sent to your number.' },
  { title: 'Finish signing up', subtitle: 'Enter your name and password. Email is optional.' },
  { title: 'Driving license', subtitle: 'Upload your license, or skip all documents and add them later.' },
  { title: 'Aadhaar', subtitle: 'Upload your Aadhaar, or skip remaining documents and add them later.' },
  { title: 'PAN', subtitle: 'Upload your PAN, or skip and add documents later from your profile.' },
  { title: 'Your profile photo', subtitle: 'Upload a photo or pick a preset to finish your driver profile.' },
  { title: "You're in", subtitle: 'Your account is ready. You can start using the driver app.' },
];

const OTP_LENGTH = 4;

const driverText = createPulseSignUpTextStyles(DRIVER_SIGNUP);

const keypadFooterStyles = StyleSheet.create({
  signIn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  signInText: driverText.linkSmall,
  signInLink: driverText.linkEmphasis,
});

const INDIA_DIAL_CODE = '91';

// Light theme for driver signup (white bg, dark text, green/black accents)
const LIGHT = {
  background: '#ffffff',
  surface: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  inputBg: '#ffffff',
  placeholder: '#94a3b8',
  accent: Theme.driverEmerald,
  buttonPrimary: Theme.driverEmerald,
};

// Validation limits (aligned with lib/validation.ts)
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 255;
type DriverSignupDocKey = 'license' | 'aadhaar' | 'pan';
type DriverSignupDocAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  base64?: string;
  fileSize?: number;
};

function normalizeDocMimeType(rawMime: string | null | undefined): string {
  const mime = (rawMime ?? '').toLowerCase();
  if (mime.includes('png')) return 'image/png';
  if (mime.includes('webp')) return 'image/webp';
  if (mime.includes('pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (value: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(normalized, 'base64');
  throw new Error('Base64 decoding is not available on this device');
}

async function readDocumentBytes(doc: DriverSignupDocAsset): Promise<ArrayBuffer | Uint8Array> {
  if (doc.base64 && doc.base64.length > 0) {
    return base64ToUint8Array(doc.base64);
  }

  // Web picker commonly returns blob: URLs; fetch() reads these reliably.
  try {
    const response = await fetch(doc.uri);
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0) return bytes;
    }
  } catch {
    // fall through to expo-file-system
  }

  const file = new File(doc.uri);
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('Could not read selected document');
  return bytes;
}

/** Normalize phone: strip spaces, allow optional leading +, then digits only. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, '');
  const withPlus = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return withPlus.replace(/\D/g, '');
}

/** Full phone for API (India: +91 + 10 digits). */
function getFullPhoneIndia(national: string): string {
  const digits = normalizePhone(national);
  return digits.length === 10 ? `+${INDIA_DIAL_CODE}${digits}` : '';
}

/** Step 1 valid: 10-digit Indian number. */
function isPhoneStepValid(national: string): boolean {
  const digits = normalizePhone(national);
  return digits.length === 10 && isPhoneValid(digits);
}

/** Inline phone error for Step 1 (India 10 digits). */
function getPhoneInlineError(national: string): string | null {
  const t = national.trim();
  if (t.length === 0) return null;
  const digits = normalizePhone(national);
  if (digits.length !== 10) return digits.length > 10 ? 'Enter at most 10 digits.' : 'Enter a 10-digit number.';
  return validatePhone(digits);
}

/** Step 2 valid: name, optional email (if present must be valid), password valid. */
function isStep2Valid(
  callsign: string,
  email: string,
  pwd: string,
  confirmPwd: string,
): boolean {
  const name = callsign.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) return false;
  if (email.trim() && validateEmail(email) !== null) return false;
  if (validatePassword(pwd) !== null) return false;
  if (pwd !== confirmPwd) return false;
  return true;
}

/**
 * Auth requires an email; when the driver skips the field, use a phone-derived
 * placeholder for login only (profile contact email stays empty).
 */
function driverSignupAuthEmailFromPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '').slice(-10);
  return `d${digits}@drivers.pulse.app`;
}

export default function DriverSignUpScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const safeBack = useSafeBack('/sign-in');
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const isOnline = useIsOnline();
  /** Per-page vertical scroll (horizontal pager does not scroll vertically). */
  const pageVerticalScrollRefs = useRef<Array<ScrollView | null>>([]);
  /** Mobile shell scroll (driver signup step body on phone / mobile web). */
  const mobileScrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const signupAvatars = useMemo(() => getSignupPresetAvatars(), []);
  const [avatarSeed, setAvatarSeed] = useState(() => getSignupPresetAvatars()[0]!.seed);
  const [profilePreviewUri, setProfilePreviewUri] = useState<string | null>(null);
  const [profileLocalBase64, setProfileLocalBase64] = useState<string | null>(null);
  const [profileUploading, setProfileUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [licenseUploaded, setLicenseUploaded] = useState(false);
  const [aadhaarUploaded, setAadhaarUploaded] = useState(false);
  const [panUploaded, setPanUploaded] = useState(false);
  const [licenseSkipped, setLicenseSkipped] = useState(false);
  const [aadhaarSkipped, setAadhaarSkipped] = useState(false);
  const [panSkipped, setPanSkipped] = useState(false);
  const [licenseUploadMethod, setLicenseUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [aadhaarUploadMethod, setAadhaarUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [panUploadMethod, setPanUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [pendingDocs, setPendingDocs] = useState<Record<DriverSignupDocKey, DriverSignupDocAsset | null>>({
    license: null,
    aadhaar: null,
    pan: null,
  });
  const [uploadedDocPaths, setUploadedDocPaths] = useState<Partial<Record<DriverSignupDocKey, string>>>({});
  const [previewDocUri, setPreviewDocUri] = useState<string | null>(null);
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean;
    exists: boolean;
    email?: string;
    masked_email?: string;
  } | null>(null);
  const phoneCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneCheckGenRef = useRef(0);
  const otpInputRef = useRef<TextInput>(null);
  /** Step index 2: approximate Y from top of scroll content for keyboard scroll. */
  const PROFILE_FIELD_SCROLL_Y = { callsign: 0, email: 112, password: 224, confirmPassword: 336 } as const;
  const isDesktop = width >= 1024;
  const useMobileLayout = true;
  const driverSignUpCopy = suiteSignUpCopy('pilot');
  const pageWidth = isDesktop ? Math.min(560, width - 120) : width;

  useEffect(() => {
    let cancelled = false;
    void hydrateDriverSignupSuccessFlag().then((active) => {
      if (!cancelled && active) setStep(7);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pageBody = (pageIndex: number, content: React.ReactNode) => {
    // Always gate on current step — the horizontal pager doesn't work reliably on web.
    if (pageIndex !== step) return null;

    const inner = (
      <View
        style={[
          styles.pageContent,
          (pageIndex === 0 || pageIndex === 1) && styles.pageContentKeypad,
          pageIndex === 7 && styles.pageContentSuccess,
        ]}
      >
        {content}
      </View>
    );

    if (useMobileLayout) {
      return (
        <View key={`driver-step-${pageIndex}`} style={styles.mobileStepFlex}>
          {inner}
        </View>
      );
    }

    return (
      <View key={pageIndex} style={[styles.page, { width: pageWidth }]}>
        <ScrollView
          ref={(el) => {
            pageVerticalScrollRefs.current[pageIndex] = el;
          }}
          style={styles.pageInnerScroll}
          contentContainerStyle={[
            styles.pageInnerScrollContent,
            { paddingBottom: insets.bottom + 88 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {inner}
        </ScrollView>
      </View>
    );
  };

  /** Extra scroll offset so focused field stays above keyboard. */
  const SCROLL_OFFSET_DEFAULT = 100;
  const { keyboardVisible } = useKeyboardVisible();
  const pendingScrollFieldRef = useRef<keyof typeof PROFILE_FIELD_SCROLL_Y | null>(null);

  const runPendingFieldScroll = () => {
    const name = pendingScrollFieldRef.current;
    pendingScrollFieldRef.current = null;
    if (!name) return;
    if (useMobileLayout) {
      // Let the browser keep the focused input visible on web. Forcing our own
      // scroll here fought the browser's native focus scroll on Android: two
      // scrollers moving the same content while the keyboard animated made the
      // page jump and re-fire viewport resizes. `scrollToEnd` was also simply
      // wrong per-field — focusing "Full name" slammed the form to the bottom.
      if (Platform.OS === 'web') return;
      mobileScrollRef.current?.scrollToEnd({ animated: true });
      return;
    }
    const inner = pageVerticalScrollRefs.current[2];
    const y = PROFILE_FIELD_SCROLL_Y[name];
    inner?.scrollTo({
      y: Math.max(0, y - SCROLL_OFFSET_DEFAULT),
      animated: true,
    });
  };

  // Web: scroll fires off the real keyboard-open transition (see effect below),
  // not a guessed delay — the previous 400ms/220px constants were estimates of
  // when the iOS Safari keyboard animation finished and drifted from reality
  // (autofill/QuickType bars change the timing per field).
  useEffect(() => {
    if (Platform.OS !== 'web' || !keyboardVisible) return;
    runPendingFieldScroll();
  }, [keyboardVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToField = (name: keyof typeof PROFILE_FIELD_SCROLL_Y) => {
    if (Platform.OS !== 'web') {
      const delay = 80;
      setTimeout(() => {
        pendingScrollFieldRef.current = name;
        runPendingFieldScroll();
      }, delay);
      return;
    }
    pendingScrollFieldRef.current = name;
    if (keyboardVisible) {
      // Keyboard already open (focus moved between adjacent fields) — no open
      // transition will fire, so scroll on the next frame instead of waiting.
      requestAnimationFrame(runPendingFieldScroll);
    }
    // Otherwise the effect above runs this once keyboardVisible flips true.
  };

  const fullPhoneForApi = getFullPhoneIndia(phone);

  useEffect(() => {
    if (!fullPhoneForApi) {
      setPhoneExistsCheck(null);
      phoneCheckGenRef.current += 1;
      if (phoneCheckTimeoutRef.current) {
        clearTimeout(phoneCheckTimeoutRef.current);
        phoneCheckTimeoutRef.current = null;
      }
      return;
    }
    if (!isOnline) {
      setPhoneExistsCheck(null);
      return;
    }
    if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);

    const generation = ++phoneCheckGenRef.current;
    phoneCheckTimeoutRef.current = setTimeout(async () => {
      phoneCheckTimeoutRef.current = null;
      if (generation !== phoneCheckGenRef.current) return;
      setPhoneExistsCheck((prev) =>
        prev ? { ...prev, loading: true } : { loading: true, exists: false },
      );
      const result = await checkExistingUserByPhone(fullPhoneForApi);
      if (generation !== phoneCheckGenRef.current) return;
      setPhoneExistsCheck({
        loading: false,
        exists: result.exists,
        email: result.email,
        masked_email: result.masked_email,
      });
    }, PHONE_CHECK_DEBOUNCE_MS);

    return () => {
      if (phoneCheckTimeoutRef.current) {
        clearTimeout(phoneCheckTimeoutRef.current);
        phoneCheckTimeoutRef.current = null;
      }
    };
  }, [fullPhoneForApi, isOnline]);

  const phoneInlineError = getPhoneInlineError(phone);

  const goToPage = (index: number) => {
    setStep(index);
    // scrollTo removed — only one step renders at a time so there is nothing to scroll.
  };

  const validatePhoneStep = async () => {
    if (!phone.trim()) {
      showAppAlert('Required', 'Enter your 10-digit mobile number.');
      return;
    }
    const err = getPhoneInlineError(phone);
    if (err) {
      showAppAlert('Invalid', err);
      return;
    }
    if (!isOnline) {
      showAppAlert('No internet', 'Connect to the internet to continue.');
      return;
    }
    setLoading(true);
    const existing = await checkExistingUserByPhone(fullPhoneForApi);
    setLoading(false);
    if (existing.error) {
      showAppAlert('Check failed', existing.error.message);
      return;
    }
    if (existing.exists && existing.email) {
      const dupBody = existing.masked_email
        ? `Sign in with ${existing.masked_email}. We've filled your email—enter your password.`
        : "An account with this phone already exists. Sign in below—we've filled your email.";
      const signInPath = `/sign-in?email=${encodeURIComponent(existing.email!)}`;
      if (Platform.OS === 'web') {
        window.alert(`Account already exists\n\n${dupBody}`);
        router.replace(signInPath as Href);
      } else {
        Alert.alert('Account already exists', dupBody, [
          { text: 'OK', onPress: () => router.replace(signInPath as Href) },
        ]);
      }
      return;
    }
    goToPage(1);
  };

  const handleGoogleDriverSignIn = async () => {
    if (!isOnline) {
      showAppAlert('No internet', 'Connect to the internet to continue.');
      return;
    }
    setLoading(true);
    try {
      const pending = await setPendingOAuthMetadata({
        role: "driver",
        operatingModel: "ASSET_BASED",
      });
      if (pending.error) throw pending.error;
      const { error } = await signInWithGoogle(true);
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign in failed";
      showAppAlert(
        'Error',
        msg.includes('Cannot reach server')
          ? 'Cannot reach server. Check your connection.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpStep = () => {
    if (otpValue.length !== OTP_LENGTH) return;
    goToPage(2);
  };

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpValue(digits);
  };

  const handleOtpKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && otpValue.length > 0) {
      setOtpValue((prev) => prev.slice(0, -1));
    }
  };

  const confirmRegistry = () => {
    const name = callsign.trim();
    if (name.length === 0) {
      showAppAlert('Required', 'Enter your full name.');
      return;
    }
    if (name.length < NAME_MIN_LENGTH) {
      showAppAlert('Invalid', `Full name must be at least ${NAME_MIN_LENGTH} characters.`);
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      showAppAlert('Invalid', `Full name must be at most ${NAME_MAX_LENGTH} characters.`);
      return;
    }
    if (email.trim()) {
      const emailErr = validateEmail(email);
      if (emailErr) {
        showAppAlert('Invalid', emailErr);
        return;
      }
    }
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      showAppAlert('Invalid', pwdErr);
      return;
    }
    if (password !== confirmPassword) {
      showAppAlert('Invalid', 'Passwords do not match.');
      return;
    }
    goToPage(3);
  };

  const establishLink = async () => {
    if (!isOnline) {
      showAppAlert('No internet', 'Connect to the internet to complete sign up.');
      return;
    }
    if (!fullPhoneForApi) {
      showAppAlert('Invalid', 'Enter a valid phone number to continue.');
      return;
    }
    setLoading(true);
    setDriverSignupSuccessActive(true);
    try {
      await AsyncStorage.setItem(DRIVER_AVATAR_STORAGE_KEY, avatarSeed);
      const providedEmail = email.trim();
      const authEmail =
        providedEmail || driverSignupAuthEmailFromPhone(fullPhoneForApi);
      const { error } = await signUp({
        email: authEmail,
        password,
        fullName: callsign.trim(),
        role: 'driver',
        operatingModel: 'ASSET_BASED',
        phone: fullPhoneForApi || undefined,
      });
      if (error && !error.message.toLowerCase().includes('already registered')) {
        throw error;
      }
      const signInResult = await signIn(authEmail, password, true);
      if (signInResult.error) {
        throw signInResult.error;
      }

      const {
        data: { user: signedInUser },
      } = await supabase().auth.getUser();
      if (signedInUser?.id) {
        // Auth email was phone-derived — don’t surface it as the contact email.
        if (!providedEmail) {
          const { error: clearEmailErr } = await supabase()
            .from('profiles')
            .update({ email: null })
            .eq('id', signedInUser.id);
          if (clearEmailErr) {
            console.warn(
              '[driver-signup] Failed to clear synthetic profile email:',
              clearEmailErr.message,
            );
          }
        }
        if (profilePreviewUri) {
          const uploaded = await uploadAvatarFromLocal(
            signedInUser.id,
            profilePreviewUri,
            profileLocalBase64,
          );
          if (uploaded.error) {
            showAppAlert('Photo upload failed', uploaded.error.message);
          } else if (uploaded.path) {
            await updateProfile({
              avatar_url: uploaded.path,
              avatar_seed: null,
            });
          }
        } else {
          await updateProfile({
            avatar_url: null,
            avatar_seed: avatarSeed,
          });
        }
        const uploadResult = await uploadDriverDocuments(signedInUser.id);
        if (uploadResult.error) {
          showAppAlert(
            'Documents saved partially',
            uploadResult.error.message ||
              'Your account is created, but one or more documents could not be uploaded. You can re-upload them from profile documents.',
          );
        }
      }

      // Show success only once the profile photo/documents are actually
      // persisted — otherwise a fast "Go to app" tap can navigate away while
      // the upload is still in flight and silently lose the write.
      goToPage(7);
    } catch (e) {
      clearDriverSignupSuccess();
      const msg = e instanceof Error ? e.message : 'Sign up failed';
      showAppAlert(
        'Error',
        msg.includes('Cannot reach server') ? 'Cannot reach server. Check your connection.' : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  const uploadDriverProfilePhoto = async () => {
    setProfileUploading(true);
    try {
      const result = await pickLocalAvatar();
      if (result.error) {
        showAppAlert('Upload failed', result.error.message);
        return;
      }
      if (!result.previewUri) return;
      setProfilePreviewUri(result.previewUri);
      setProfileLocalBase64(result.base64);
    } finally {
      setProfileUploading(false);
    }
  };

  const selectDriverAvatarSeed = (seed: string) => {
    setAvatarSeed(seed);
    setProfilePreviewUri(null);
    setProfileLocalBase64(null);
  };

  const initializeHub = () => {
    clearDriverSignupSuccess();
    router.replace('/');
  };

  const markDocumentUploaded = (doc: 'license' | 'aadhaar' | 'pan', method: 'gallery' | 'camera') => {
    if (doc === 'license') {
      setLicenseUploaded(true);
      setLicenseUploadMethod(method);
      return;
    }
    if (doc === 'aadhaar') {
      setAadhaarUploaded(true);
      setAadhaarUploadMethod(method);
      return;
    }
    setPanUploaded(true);
    setPanUploadMethod(method);
  };

  const markDocumentSkipped = (doc: DriverSignupDocKey) => {
    if (doc === 'license') {
      setLicenseSkipped(true);
      return;
    }
    if (doc === 'aadhaar') {
      setAadhaarSkipped(true);
      return;
    }
    setPanSkipped(true);
  };

  /** One-shot: skip this doc and every later doc that isn’t uploaded, then open photo step. */
  const skipRemainingDocsAndContinue = (from: DriverSignupDocKey) => {
    const order: DriverSignupDocKey[] = ['license', 'aadhaar', 'pan'];
    const uploadedByKey: Record<DriverSignupDocKey, boolean> = {
      license: licenseUploaded,
      aadhaar: aadhaarUploaded,
      pan: panUploaded,
    };
    const start = order.indexOf(from);
    for (let i = Math.max(0, start); i < order.length; i += 1) {
      const key = order[i]!;
      if (!uploadedByKey[key]) markDocumentSkipped(key);
    }
    goToPage(6);
  };

  const pickDocument = async (doc: DriverSignupDocKey, method: 'gallery' | 'camera') => {
    try {
      // Web has no media-library permission model — the browser file dialog is
      // the consent step. Requesting permission first can resolve un-granted
      // and also drops the user-gesture, so the picker never opens.
      if (Platform.OS !== 'web') {
        if (method === 'gallery') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            showAppAlert('Permission required', 'Photo library access is needed to upload this document.');
            return;
          }
        } else {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            showAppAlert('Permission required', 'Camera access is needed to capture this document.');
            return;
          }
        }
      }

      // On web, both buttons open the file picker. getUserMedia camera capture
      // is unreliable in browsers; mobile OS pickers already include camera.
      const useLibrary = method === 'gallery' || Platform.OS === 'web';
      const result = useLibrary
        ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.9,
              base64: true,
            })
          : await ImagePicker.launchCameraAsync({
              allowsEditing: false,
              quality: 0.9,
              base64: true,
            });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const mimeType = normalizeDocMimeType(asset.mimeType);
      const fallbackName = `${doc}-${Date.now()}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
      setPendingDocs((prev) => ({
        ...prev,
        [doc]: {
          uri: asset.uri,
          fileName: asset.fileName ?? fallbackName,
          mimeType,
          base64: typeof asset.base64 === 'string' ? asset.base64.trim() : undefined,
          fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
        },
      }));
      markDocumentUploaded(doc, method);
      if (doc === 'license') setLicenseSkipped(false);
      if (doc === 'aadhaar') setAadhaarSkipped(false);
      if (doc === 'pan') setPanSkipped(false);

      const {
        data: { user: currentUser },
      } = await supabase().auth.getUser();

      if (!currentUser?.id) {
        showAppAlert('Selected', `${doc.toUpperCase()} selected. It will upload when you tap Create account.`);
        return;
      }

      const immediateDoc: DriverSignupDocAsset = {
        uri: asset.uri,
        fileName: asset.fileName ?? fallbackName,
        mimeType,
        base64: typeof asset.base64 === 'string' ? asset.base64.trim() : undefined,
        fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
      };
      const immediateUpload = await uploadSingleDriverDocument(currentUser.id, doc, immediateDoc);
      if (immediateUpload.error || !immediateUpload.path) {
        showAppAlert('Selected', `${doc.toUpperCase()} selected. Upload will retry on Create account.`);
        return;
      }

      const nextUploaded = { ...uploadedDocPaths, [doc]: immediateUpload.path };
      setUploadedDocPaths(nextUploaded);
      const syncResult = await syncDriverDocumentMetadata(currentUser.id, { [doc]: immediateUpload.path });
      if (syncResult.error) {
        showAppAlert('Uploaded with warning', `${doc.toUpperCase()} uploaded, but metadata sync failed.`);
        return;
      }
      showAppAlert('Uploaded', `${doc.toUpperCase()} uploaded successfully.`);
    } catch (e) {
      showAppAlert('Upload failed', e instanceof Error ? e.message : 'Unable to pick document');
    }
  };

  const openDocumentPreview = async (uri: string | null) => {
    if (!uri) return;
    setPreviewDocUri(uri);
  };

  const uploadSingleDriverDocument = async (
    uid: string,
    docType: DriverSignupDocKey,
    doc: DriverSignupDocAsset,
  ): Promise<{ path: string | null; error: Error | null }> => {
    const ext = doc.fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${uid}/${docType}-${Date.now()}.${ext}`;
    const uploadBytes = await readDocumentBytes(doc);
    const { error } = await supabase()
      .storage
      .from('driver-documents')
      .upload(path, uploadBytes, {
        contentType: doc.mimeType || 'image/jpeg',
        upsert: true,
      });
    if (error) return { path: null, error: new Error(error.message || `Failed to upload ${docType}`) };

    const kycResult = await submitDriverKycDocument({
      doc_type: docType,
      storage_path: path,
      file_name: doc.fileName,
      mime_type: doc.mimeType || 'image/jpeg',
      file_size_bytes: doc.fileSize,
    });
    if (kycResult.error) {
      return {
        path,
        error: new Error(kycResult.error.message || `Failed to save ${docType} for review`),
      };
    }

    return { path, error: null };
  };

  const syncDriverDocumentMetadata = async (
    uid: string,
    uploaded: Partial<Record<DriverSignupDocKey, string>>,
  ): Promise<{ error: Error | null }> => {
    if (!uploaded.license && !uploaded.aadhaar && !uploaded.pan) return { error: null };

    if (uploaded.license) {
      const { error: profileError } = await supabase()
        .from('driver_profiles')
        .upsert(
          { user_id: uid, license_photo_url: uploaded.license },
          { onConflict: 'user_id' },
        );
      if (profileError) {
        return {
          error: new Error(
            profileError.message || 'Failed to save license on driver profile',
          ),
        };
      }
    }

    const {
      data: { user: currentUser },
    } = await supabase().auth.getUser();
    const existingDocs =
      currentUser?.user_metadata &&
      typeof currentUser.user_metadata === 'object' &&
      currentUser.user_metadata.driver_documents &&
      typeof currentUser.user_metadata.driver_documents === 'object'
        ? (currentUser.user_metadata.driver_documents as Record<string, unknown>)
        : {};
    const nextDocs = {
      ...existingDocs,
      ...(uploaded.license ? { license: uploaded.license } : {}),
      ...(uploaded.aadhaar ? { aadhaar: uploaded.aadhaar } : {}),
      ...(uploaded.pan ? { pan: uploaded.pan } : {}),
    };
    const { error: metadataError } = await supabase().auth.updateUser({
      data: { driver_documents: nextDocs },
    });
    if (metadataError) {
      return { error: new Error(metadataError.message || 'Failed to save document metadata') };
    }
    return { error: null };
  };

  const uploadDriverDocuments = async (uid: string): Promise<{ error: Error | null }> => {
    const hasAnyPending =
      pendingDocs.license != null || pendingDocs.aadhaar != null || pendingDocs.pan != null;
    const hasAnyUploaded =
      Boolean(uploadedDocPaths.license) || Boolean(uploadedDocPaths.aadhaar) || Boolean(uploadedDocPaths.pan);
    if (!hasAnyPending && !hasAnyUploaded) return { error: null };

    const uploaded: Partial<Record<DriverSignupDocKey, string>> = { ...uploadedDocPaths };
    for (const docType of ['license', 'aadhaar', 'pan'] as const) {
      if (uploaded[docType]) continue;
      const doc = pendingDocs[docType];
      if (!doc) continue;
      const singleUpload = await uploadSingleDriverDocument(uid, docType, doc);
      if (singleUpload.error || !singleUpload.path) {
        return { error: singleUpload.error ?? new Error(`Failed to upload ${docType}`) };
      }
      uploaded[docType] = singleUpload.path;
    }

    const metadataResult = await syncDriverDocumentMetadata(uid, uploaded);
    if (metadataResult.error) return { error: metadataResult.error };
    setUploadedDocPaths(uploaded);
    return { error: null };
  };

  const handleBack = () => {
    if (step > 0) {
      goToPage(step - 1);
    } else {
      safeBack();
    }
  };

  const stepPages = (
    <>
        {/* Step 1: Welcome – India phone only */}
        {pageBody(0, useMobileLayout ? (
          <SignUpPulseKeypadStep
            theme={DRIVER_SIGNUP}
            heroMascotId={DRIVER_SIGNUP_HERO_MASCOT.phone}
            title={STEP_CONTENT[0].title}
            subtitle={STEP_CONTENT[0].subtitle}
            value={phone}
            onChange={(d) => setPhone(formatMobileNumber(d))}
            maxDigits={10}
            formatDisplay={formatSignupPhoneDisplay}
            displayFlag="🇮🇳"
            displayPrefix="+91"
            emptyPlaceholder="000 000 0000"
            onPrimary={validatePhoneStep}
            primaryDisabled={
              !isPhoneStepValid(phone) ||
              !!(phoneExistsCheck?.exists && phoneExistsCheck.email)
            }
            primaryLoading={loading}
            primaryLabel="Send OTP"
            errorMessage={phoneInlineError}
            hintMessage={
              phoneExistsCheck?.loading
                ? 'Checking number…'
                : phoneExistsCheck?.exists && phoneExistsCheck.email
                  ? 'This number is already registered.'
                  : null
            }
            showGoogle
            onGoogle={handleGoogleDriverSignIn}
            googleDisabled={loading}
            googleLoading={loading}
            footerAccessory={
              <Pressable
                onPress={() =>
                  phoneExistsCheck?.exists && phoneExistsCheck.email
                    ? router.replace(
                        `/sign-in?email=${encodeURIComponent(phoneExistsCheck.email)}`,
                      )
                    : router.replace(ROUTES.DRIVER_SIGN_IN)
                }
                style={keypadFooterStyles.signIn}
              >
                <Text style={keypadFooterStyles.signInText}>
                  {phoneExistsCheck?.exists && phoneExistsCheck.email ? (
                    <>
                      Already registered?{' '}
                      <Text style={keypadFooterStyles.signInLink}>Sign in instead</Text>
                    </>
                  ) : (
                    <>
                      Already activated?{' '}
                      <Text style={keypadFooterStyles.signInLink}>Sign in</Text>
                    </>
                  )}
                </Text>
              </Pressable>
            }
          />
        ) : (
          <>
            <Text style={[styles.mainTitle, styles.mainTitleWelcome]}>
              {STEP_CONTENT[0].title}
            </Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[0].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={[styles.inputRow, phoneInlineError && styles.inputRowError]}>
                <Text style={styles.flagIcon}>🇮🇳</Text>
                <Text style={styles.dialCode}>+91</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="000 000 0000"
                  placeholderTextColor={LIGHT.placeholder}
                  value={phone}
                  onChangeText={(text) => setPhone(formatMobileNumber(text))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />
              </View>
              {phoneInlineError ? (
                <Text style={styles.fieldError}>{phoneInlineError}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!isPhoneStepValid(phone) || loading) && styles.primaryBtnDisabled]}
              onPress={validatePhoneStep}
              disabled={!isPhoneStepValid(phone) || loading}
            >
              <Text style={styles.primaryBtnText}>Continue with phone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.googleBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleGoogleDriverSignIn}
              disabled={loading}
            >
              <FontAwesome name="google" size={18} color={LIGHT.text} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          </>
        ))}

        {/* Step 2: OTP entry */}
        {pageBody(1, useMobileLayout ? (
          <SignUpPulseKeypadStep
            theme={DRIVER_SIGNUP}
            heroMascotId={DRIVER_SIGNUP_HERO_MASCOT.verify}
            centeredLayout
            title={STEP_CONTENT[1].title}
            subtitle={
              phone.trim().length === 10
                ? `Enter the 4-digit code we sent to +91 ${formatSignupPhoneDisplay(phone)}`
                : STEP_CONTENT[1].subtitle
            }
            value={otpValue}
            onChange={(d) => setOtpValue(d.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            maxDigits={OTP_LENGTH}
            formatDisplay={(d) => d}
            fieldLabel="Verification Code"
            emptyPlaceholder=""
            customDisplay={<SignUpOtpBoxes digits={otpValue} length={OTP_LENGTH} centered />}
            onPrimary={verifyOtpStep}
            primaryDisabled={otpValue.length < OTP_LENGTH}
            primaryLoading={loading}
            primaryLabel="Verify OTP"
            footerAccessory={
              <Pressable onPress={() => setOtpValue('')} style={keypadFooterStyles.signIn}>
                <Text style={keypadFooterStyles.signInText}>
                  <Text style={keypadFooterStyles.signInLink}>Clear and re-enter</Text>
                </Text>
              </Pressable>
            }
          />
        ) : (
          <>
            <Text style={styles.mainTitle}>{STEP_CONTENT[1].title}</Text>
            <Text style={styles.subTitle}>
              We sent a code to {phone.trim().length === 10 ? `+91 ${phone.replace(/(\d{5})(\d{5})/, '$1 $2')}` : 'your number'}. Enter the code in that message.
            </Text>
            <TouchableOpacity
              style={styles.otpBoxRow}
              onPress={() => otpInputRef.current?.focus()}
              activeOpacity={1}
            >
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    otpValue.length === i && styles.otpBoxFocused,
                  ]}
                >
                  <Text style={styles.otpBoxDigit}>{otpValue[i] ?? ''}</Text>
                </View>
              ))}
            </TouchableOpacity>
            <TextInput
              ref={otpInputRef}
              value={otpValue}
              onChangeText={handleOtpChange}
              onKeyPress={handleOtpKeyPress}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              style={styles.otpHiddenInput}
              caretHidden
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (otpValue.length !== OTP_LENGTH || loading) && styles.primaryBtnDisabled]}
              onPress={verifyOtpStep}
              disabled={otpValue.length !== OTP_LENGTH || loading}
            >
              <Text style={styles.primaryBtnText}>Verify OTP</Text>
            </TouchableOpacity>
          </>
        ))}

        {/* Step 3: Your details */}
        {pageBody(2, useMobileLayout ? (
          <>
            <SignUpPulseTitle
              title={STEP_CONTENT[2].title}
              subtitle={STEP_CONTENT[2].subtitle}
              compact
            />
            <SignUpPulseField
              theme={DRIVER_SIGNUP}
              label="Full name"
              required
              value={callsign}
              onChangeText={setCallsign}
              placeholder="Your name"
              maxLength={NAME_MAX_LENGTH}
              autoCapitalize="words"
              editable={!loading}
              onFocus={() => scrollToField('callsign')}
            />
            <SignUpPulseField
              theme={DRIVER_SIGNUP}
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              maxLength={EMAIL_MAX_LENGTH}
              autoCapitalize="none"
              editable={!loading}
              onFocus={() => scrollToField('email')}
            />
            <SignUpPulseField
              theme={DRIVER_SIGNUP}
              label="Password"
              required
              dense
              passwordField="new"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
              secureTextEntry={!showPassword}
              editable={!loading}
              onFocus={() => scrollToField('password')}
              trailing={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                  {showPassword ? (
                    <EyeOff size={18} color={DRIVER_SIGNUP.muted} />
                  ) : (
                    <Eye size={18} color={DRIVER_SIGNUP.muted} />
                  )}
                </Pressable>
              }
            />
            <SignUpPulseField
              theme={DRIVER_SIGNUP}
              label="Confirm password"
              required
              dense
              passwordField="confirm"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your password"
              maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
              secureTextEntry={!showConfirmPassword}
              editable={!loading}
              onFocus={() => scrollToField('confirmPassword')}
              trailing={
                <Pressable onPress={() => setShowConfirmPassword((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                  {showConfirmPassword ? (
                    <EyeOff size={18} color={DRIVER_SIGNUP.muted} />
                  ) : (
                    <Eye size={18} color={DRIVER_SIGNUP.muted} />
                  )}
                </Pressable>
              }
            />
            <SignUpPulsePrimaryButton
              theme={DRIVER_SIGNUP}
              label="Next"
              onPress={confirmRegistry}
              disabled={!isStep2Valid(callsign, email, password, confirmPassword) || loading}
              loading={loading}
              style={styles.mobilePrimaryBtn}
            />
          </>
        ) : (
          <>
            <Text style={styles.mainTitle}>{STEP_CONTENT[2].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[2].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={LIGHT.placeholder}
                  value={callsign}
                  onChangeText={setCallsign}
                  onFocus={() => scrollToField('callsign')}
                  maxLength={NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Email (optional)</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={LIGHT.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => scrollToField('email')}
                  keyboardType="email-address"
                  maxLength={EMAIL_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={[styles.inputWrap, styles.passwordRow]}>
                <TextInput
                  {...signUpPasswordInputProps('new')}
                  style={styles.inputPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={LIGHT.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => scrollToField('password')}
                  maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={12}
                  accessible
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <FontAwesome
                    name={showPassword ? 'eye-slash' : 'eye'}
                    size={22}
                    color={LIGHT.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View style={[styles.inputWrap, styles.passwordRow]}>
                <TextInput
                  {...signUpPasswordInputProps('confirm')}
                  style={styles.inputPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={LIGHT.placeholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => scrollToField('confirmPassword')}
                  maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                  secureTextEntry={!showConfirmPassword}
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={12}
                  accessible
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <FontAwesome
                    name={showConfirmPassword ? 'eye-slash' : 'eye'}
                    size={22}
                    color={LIGHT.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!isStep2Valid(callsign, email, password, confirmPassword) || loading) && styles.primaryBtnDisabled]}
              onPress={confirmRegistry}
              disabled={!isStep2Valid(callsign, email, password, confirmPassword) || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          </>
        ))}

        {/* Step 4: Driving license */}
        {pageBody(3, (
          <>
            {useMobileLayout ? (
              <SignUpPulseTitle
                title={STEP_CONTENT[3].title}
                subtitle={STEP_CONTENT[3].subtitle}
                compact
              />
            ) : (
              <>
                <Text style={styles.mainTitle}>{STEP_CONTENT[3].title}</Text>
                <Text style={styles.subTitle}>{STEP_CONTENT[3].subtitle}</Text>
              </>
            )}
            <View style={useMobileLayout ? mobileSignup.docActionsRow : styles.docActionsWrap}>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('license', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Upload from gallery
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('license', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Open camera
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                useMobileLayout ? mobileSignup.docStatus : styles.docStatus,
                licenseUploaded ? (useMobileLayout ? mobileSignup.docStatusDone : styles.docStatusDone) : (useMobileLayout ? mobileSignup.docStatusPending : styles.docStatusPending),
              ]}
            >
              {licenseUploaded
                ? `Uploaded${licenseUploadMethod ? ` via ${licenseUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : licenseSkipped
                  ? 'Skipped for now'
                : 'Not uploaded'}
            </Text>
            {useMobileLayout ? (
              <SignUpPulsePrimaryButton
                theme={DRIVER_SIGNUP}
                label={licenseUploaded ? 'Continue' : 'Skip & upload later'}
                onPress={() => {
                  if (licenseUploaded) goToPage(4);
                  else skipRemainingDocsAndContinue('license');
                }}
                disabled={loading}
                style={styles.mobilePrimaryBtn}
              />
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={() => {
                  if (licenseUploaded) goToPage(4);
                  else skipRemainingDocsAndContinue('license');
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>
                  {licenseUploaded ? 'Continue' : 'Skip & upload later'}
                </Text>
              </TouchableOpacity>
            )}
            {pendingDocs.license?.uri ? (
              <TouchableOpacity
                style={styles.tryAgainLink}
                onPress={() => void openDocumentPreview(pendingDocs.license?.uri ?? null)}
                hitSlop={12}
              >
                <Text style={styles.tryAgainText}>View uploaded document</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ))}

        {/* Step 5: Aadhaar */}
        {pageBody(4, (
          <>
            {useMobileLayout ? (
              <SignUpPulseTitle title={STEP_CONTENT[4].title} subtitle={STEP_CONTENT[4].subtitle} compact />
            ) : (
              <>
                <Text style={styles.mainTitle}>{STEP_CONTENT[4].title}</Text>
                <Text style={styles.subTitle}>{STEP_CONTENT[4].subtitle}</Text>
              </>
            )}
            <View style={useMobileLayout ? mobileSignup.docActionsRow : styles.docActionsWrap}>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('aadhaar', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Upload from gallery
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('aadhaar', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Open camera
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                useMobileLayout ? mobileSignup.docStatus : styles.docStatus,
                aadhaarUploaded ? (useMobileLayout ? mobileSignup.docStatusDone : styles.docStatusDone) : (useMobileLayout ? mobileSignup.docStatusPending : styles.docStatusPending),
              ]}
            >
              {aadhaarUploaded
                ? `Uploaded${aadhaarUploadMethod ? ` via ${aadhaarUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : aadhaarSkipped
                  ? 'Skipped for now'
                : 'Not uploaded'}
            </Text>
            {useMobileLayout ? (
              <SignUpPulsePrimaryButton
                theme={DRIVER_SIGNUP}
                label={aadhaarUploaded ? 'Continue' : 'Skip & upload later'}
                onPress={() => {
                  if (aadhaarUploaded) goToPage(5);
                  else skipRemainingDocsAndContinue('aadhaar');
                }}
                disabled={loading}
                style={styles.mobilePrimaryBtn}
              />
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={() => {
                  if (aadhaarUploaded) goToPage(5);
                  else skipRemainingDocsAndContinue('aadhaar');
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>
                  {aadhaarUploaded ? 'Continue' : 'Skip & upload later'}
                </Text>
              </TouchableOpacity>
            )}
            {pendingDocs.aadhaar?.uri ? (
              <TouchableOpacity
                style={styles.tryAgainLink}
                onPress={() => void openDocumentPreview(pendingDocs.aadhaar?.uri ?? null)}
                hitSlop={12}
              >
                <Text style={styles.tryAgainText}>View uploaded document</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ))}

        {/* Step 6: PAN */}
        {pageBody(5, (
          <>
            {useMobileLayout ? (
              <SignUpPulseTitle title={STEP_CONTENT[5].title} subtitle={STEP_CONTENT[5].subtitle} compact />
            ) : (
              <>
                <Text style={styles.mainTitle}>{STEP_CONTENT[5].title}</Text>
                <Text style={styles.subTitle}>{STEP_CONTENT[5].subtitle}</Text>
              </>
            )}
            <View style={useMobileLayout ? mobileSignup.docActionsRow : styles.docActionsWrap}>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('pan', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Upload from gallery
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={useMobileLayout ? mobileSignup.docActionBtn : styles.docActionBtn}
                onPress={() => void pickDocument('pan', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={16} color={LIGHT.text} />
                <Text style={useMobileLayout ? mobileSignup.docActionText : styles.docActionText}>
                  Open camera
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                useMobileLayout ? mobileSignup.docStatus : styles.docStatus,
                panUploaded ? (useMobileLayout ? mobileSignup.docStatusDone : styles.docStatusDone) : (useMobileLayout ? mobileSignup.docStatusPending : styles.docStatusPending),
              ]}
            >
              {panUploaded
                ? `Uploaded${panUploadMethod ? ` via ${panUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : panSkipped
                  ? 'Skipped for now'
                : 'Not uploaded'}
            </Text>
            {useMobileLayout ? (
              <SignUpPulsePrimaryButton
                theme={DRIVER_SIGNUP}
                label={panUploaded ? 'Continue' : 'Skip & upload later'}
                onPress={() => {
                  if (panUploaded) goToPage(6);
                  else skipRemainingDocsAndContinue('pan');
                }}
                disabled={loading}
                style={styles.mobilePrimaryBtn}
              />
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={() => {
                  if (panUploaded) goToPage(6);
                  else skipRemainingDocsAndContinue('pan');
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>
                  {panUploaded ? 'Continue' : 'Skip & upload later'}
                </Text>
              </TouchableOpacity>
            )}
            {pendingDocs.pan?.uri ? (
              <TouchableOpacity
                style={styles.tryAgainLink}
                onPress={() => void openDocumentPreview(pendingDocs.pan?.uri ?? null)}
                hitSlop={12}
              >
                <Text style={styles.tryAgainText}>View uploaded document</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ))}

        {/* Step 7: Avatar */}
        {pageBody(6, (
          <>
            <SignUpPhotoPickerBody
              title={STEP_CONTENT[6].title}
              subtitle={STEP_CONTENT[6].subtitle}
              previewUri={profilePreviewUri}
              previewImage={
                profilePreviewUri
                  ? undefined
                  : signupAvatars.find((av) => av.seed === avatarSeed)?.image
              }
              presetAvatars={signupAvatars}
              selectedPresetSeed={profilePreviewUri ? null : avatarSeed}
              onPresetSelect={selectDriverAvatarSeed}
              onUpload={() => void uploadDriverProfilePhoto()}
              uploading={profileUploading}
              uploadLabel="Upload profile photo"
              theme={DRIVER_SIGNUP}
            />
            {useMobileLayout ? (
              <SignUpPulsePrimaryButton
                theme={DRIVER_SIGNUP}
                label="Create account"
                onPress={establishLink}
                disabled={loading}
                loading={loading}
                style={styles.mobilePrimaryBtn}
              />
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={establishLink}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <LoadingIndicator color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Create account</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ))}

        {/* Step 8: Success */}
        {pageBody(7, (
          <DriverSignupSuccessStep
            displayName={callsign}
            onEnterApp={initializeHub}
            profilePreviewUri={profilePreviewUri}
            profileImage={
              profilePreviewUri
                ? undefined
                : signupAvatars.find((av) => av.seed === avatarSeed)?.image
            }
            licenseUploaded={licenseUploaded}
            aadhaarUploaded={aadhaarUploaded}
            panUploaded={panUploaded}
            licenseSkipped={licenseSkipped}
            aadhaarSkipped={aadhaarSkipped}
            panSkipped={panSkipped}
          />
        ))}
    </>
  );

  const usesKeypadBody = step === 0 || step === 1;
  return (
      <>
        <SignUpMobileShell
          backLabel={step === 0 ? 'Back' : 'Previous'}
          onBack={handleBack}
          stepLabels={DRIVER_STEP_LABELS.slice(0, 7)}
          currentStepIndex={Math.min(step, 6)}
          hideProgress={step >= 7 || step <= 1}
          bodyMode={usesKeypadBody ? 'keypad' : 'scroll'}
          scrollBottomPad={insets.bottom + 24}
          scrollRef={mobileScrollRef}
          trustMode="driver"
          isDesktop={isDesktop}
          brandWord={PULSE_PILOT_BRAND_WORD}
          marketingTag={driverSignUpCopy.marketingTag}
          marketingTitle={driverSignUpCopy.marketingTitle}
          marketingOutcomeLines={driverSignUpCopy.principles}
        >
          {stepPages}
        </SignUpMobileShell>
        <Modal
          visible={previewDocUri != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewDocUri(null)}
        >
          <View style={styles.previewBackdrop}>
            <View style={styles.previewCard}>
              {previewDocUri ? (
                <Image
                  source={{ uri: previewDocUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              ) : null}
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setPreviewDocUri(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.previewCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    );
}

const styles = StyleSheet.create({
  mobilePrimaryBtn: {
    marginTop: 8,
    marginBottom: 4,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileStepFlex: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    flex: 1,
    backgroundColor: LIGHT.background,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backLinkDesktop: {
    paddingHorizontal: 0,
    alignSelf: 'center',
    width: 560,
  },
  backLinkText: {
    fontSize: 14,
    color: LIGHT.textMuted,
    fontWeight: '600',
  },
  brandRow: {
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  brandRowDesktop: {
    paddingHorizontal: 0,
    alignSelf: 'center',
    width: 560,
  },
  brandRowInner: {
    alignSelf: 'flex-start',
  },
  pagesWrap: {
    flexGrow: 1,
  },
  pagesScroller: {
    flex: 1,
  },
  pagesScrollerDesktop: {
    width: 560,
    alignSelf: 'center',
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: 'flex-start',
  },
  pageInnerScroll: {
    flex: 1,
  },
  pageInnerScrollContent: {
    flexGrow: 1,
  },
  pageContent: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  pageContentKeypad: {
    flex: 1,
    maxWidth: '100%',
    paddingHorizontal: 0,
  },
  pageContentSuccess: {
    flex: 1,
    maxWidth: '100%',
    paddingHorizontal: 0,
    minHeight: 0,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: LIGHT.surface,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: LIGHT.text,
    marginBottom: 10,
    letterSpacing: -0.5,
    textAlign: 'center',
    width: '100%',
  },
  /** Smaller than `mainTitle` so the welcome line fits without auto-shrink. */
  mainTitleWelcome: {
    fontSize: 22,
    letterSpacing: -0.4,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: LIGHT.text,
    opacity: 0.85,
    marginBottom: 24,
    lineHeight: 22,
    textAlign: 'center',
    width: '100%',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: LIGHT.textMuted,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  inputWrap: {
    marginBottom: 20,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRowError: {
    borderColor: Theme.destructive,
  },
  flagIcon: {
    fontSize: 26,
    marginLeft: 14,
    marginRight: 6,
  },
  dialCode: {
    fontSize: 16,
    fontWeight: '600',
    color: LIGHT.text,
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: LIGHT.text,
  },
  fieldError: {
    fontSize: 12,
    color: Theme.destructive,
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsHint: {
    fontSize: 12,
    color: LIGHT.textMuted,
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsText: {
    fontSize: 12,
    color: LIGHT.accent,
  },
  phoneExistsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: LIGHT.accent,
    textDecorationLine: 'underline',
  },
  inputIcon: {
    marginLeft: 14,
    marginRight: 8,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    paddingRight: 16,
    color: LIGHT.text,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  inputPassword: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingRight: 50,
    fontSize: 16,
    color: LIGHT.text,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  primaryBtn: {
    backgroundColor: LIGHT.buttonPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
  },
  googleBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: LIGHT.text,
    letterSpacing: 0.2,
  },
  otpBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
  },
  otpBox: {
    width: 52,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: LIGHT.accent,
  },
  otpBoxDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: LIGHT.text,
  },
  otpHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  tryAgainLink: {
    marginTop: 16,
    alignSelf: 'center',
  },
  tryAgainText: {
    fontSize: 14,
    color: LIGHT.textMuted,
    fontWeight: '500',
  },
  docActionsWrap: {
    gap: 12,
    marginBottom: 16,
  },
  docActionBtn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: LIGHT.text,
  },
  docStatus: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  docStatusPending: {
    color: LIGHT.textMuted,
  },
  docStatusDone: {
    color: LIGHT.accent,
  },
  avatarPreviewWrap: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: LIGHT.surface,
    borderWidth: 3,
    borderColor: LIGHT.accent,
    overflow: 'hidden',
    marginBottom: 24,
  },
  avatarPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarGridItem: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
  },
  avatarGridItemActive: {
    borderColor: LIGHT.accent,
  },
  avatarGridImg: {
    width: '100%',
    height: '100%',
  },
  crownWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: LIGHT.surface,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: LIGHT.text,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  successMessage: {
    fontSize: 16,
    fontWeight: '400',
    color: LIGHT.text,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  successHighlight: {
    color: LIGHT.accent,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  previewCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 420,
    backgroundColor: '#f8fafc',
  },
  previewCloseBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: LIGHT.border,
  },
  previewCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: LIGHT.text,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIGHT.border,
  },
  stepDotActive: {
    backgroundColor: LIGHT.accent,
    width: 24,
  },
  stepDotDone: {
    backgroundColor: LIGHT.accent,
    opacity: 0.6,
  },
});
