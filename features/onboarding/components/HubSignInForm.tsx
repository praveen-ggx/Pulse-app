import { useRootNavigationState, useRouter, type Href } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { GoogleBrandIcon } from '@/features/auth/components/GoogleBrandIcon';
import { SignUpPulseField } from '@/features/auth/signup/SignUpPulseField';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import { createPulseSignUpTextStyles, PULSE_SIGNUP_TYPO } from '@/features/auth/signup/signUpTypography';
import { SIGN_IN_BRAND, SIGN_IN_COPY } from '@/lib/auth/signInContent';
import { validateEmailRequired } from '@/lib/emailValidation';
import { markFreshSignInLanding } from '@/lib/indexBootRedirect.util';
import { ROUTES } from '@/lib/routes';
import { navigateAfterSuiteAuth } from '@/lib/suite/suiteAuth';
import { containsNullByte, validatePasswordForSignIn } from '@/lib/validation';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';

const pulseText = createPulseSignUpTextStyles(PULSE_SIGNUP);

export function HubSignInForm() {
  const router = useRouter();
  const rootNavReady = Boolean(useRootNavigationState()?.key);
  const isOnline = useIsOnline();
  const { user, signIn, signInWithGoogle, restoreError, clearRestoreError } = useAuth();

  useEffect(() => {
    if (!user || !rootNavReady) return;
    markFreshSignInLanding();
    navigateAfterSuiteAuth('/', (href) => {
      try {
        router.replace(href as Href);
      } catch {
        /* slot not mounted yet */
      }
    });
  }, [user, router, rootNavReady]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [waitingForAuthState, setWaitingForAuthState] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const formDisabled = loading || waitingForAuthState || !isOnline;

  const handleSignIn = async () => {
    if (loading) return;
    setSignInError(null);
    clearRestoreError();
    setWaitingForAuthState(false);
    if (!isOnline) {
      setSignInError('Connect to the internet to sign in.');
      return;
    }
    const emailErr = validateEmailRequired(email);
    if (emailErr) {
      setSignInError(emailErr);
      return;
    }
    const trimmedEmail = email.trim();
    if (containsNullByte(trimmedEmail) || containsNullByte(password)) {
      setSignInError('Input contains invalid characters.');
      return;
    }
    const pwdErr = validatePasswordForSignIn(password);
    if (pwdErr) {
      setSignInError(pwdErr);
      return;
    }

    try {
      setLoading(true);
      const { error } = await signIn(trimmedEmail, password, true);
      if (error) {
        setSignInError(error.message);
        return;
      }
      setWaitingForAuthState(true);
    } catch {
      const msg = 'Sign in failed. Please try again.';
      setSignInError(msg);
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setSignInError(null);
    clearRestoreError();
    setWaitingForAuthState(false);
    if (!isOnline) {
      setSignInError('Connect to the internet to sign in.');
      return;
    }
    try {
      setGoogleLoading(true);
      const { error } = await signInWithGoogle(true);
      if (error) {
        setSignInError(error.message);
        return;
      }
      setWaitingForAuthState(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign in failed.';
      setSignInError(msg);
      Alert.alert('Sign in failed', msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{SIGN_IN_COPY.formTitle}</Text>
        <Text style={styles.subtitle}>{SIGN_IN_COPY.formSubtitle}</Text>
      </View>

      <SignUpPulseField
        label="Email"
        theme={PULSE_SIGNUP}
        comfortable
        value={email}
        onChangeText={(t) => {
          setSignInError(null);
          setEmail(t);
        }}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        maxLength={255}
        editable={!formDisabled}
      />

      <SignUpPulseField
        label="Password"
        theme={PULSE_SIGNUP}
        comfortable
        value={password}
        onChangeText={(t) => {
          setSignInError(null);
          setPassword(t);
        }}
        placeholder="Your password"
        secureTextEntry={!showPass}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        autoComplete="password"
        maxLength={128}
        editable={!formDisabled}
        trailing={
          <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={8}>
            {showPass ? (
              <EyeOff size={18} color={PULSE_SIGNUP.muted} />
            ) : (
              <Eye size={18} color={PULSE_SIGNUP.muted} />
            )}
          </Pressable>
        }
      />

      <Pressable
        onPress={() =>
          router.push(
            `${ROUTES.FORGOT_PASSWORD}?email=${encodeURIComponent(email.trim())}` as Href,
          )
        }
        hitSlop={8}
        style={styles.forgotRow}
      >
        <Text style={styles.forgotText}>{SIGN_IN_COPY.forgotPassword}</Text>
      </Pressable>

      {signInError || restoreError ? (
        <Text style={styles.errorText}>
          {signInError ?? restoreError?.message ?? 'Could not restore your session. Sign in again.'}
        </Text>
      ) : null}

      <Pressable
        testID="signin-submit-btn"
        onPress={handleSignIn}
        disabled={formDisabled}
        style={({ pressed }) => [
          styles.signInBtn,
          formDisabled && styles.signInBtnDisabled,
          pressed && !formDisabled && styles.signInBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={SIGN_IN_COPY.primaryCta}
      >
        {loading || waitingForAuthState ? (
          <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
        ) : (
          <Text style={styles.signInBtnText}>{SIGN_IN_COPY.primaryCta}</Text>
        )}
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>

      <Pressable
        onPress={handleGoogleSignIn}
        disabled={googleLoading || formDisabled}
        style={({ pressed }) => [
          styles.googleBtn,
          (googleLoading || formDisabled) && styles.signInBtnDisabled,
          pressed && !googleLoading && !formDisabled && styles.signInBtnPressed,
        ]}
      >
        {googleLoading ? (
          <Text style={styles.googleBtnText}>Signing in…</Text>
        ) : (
          <>
            <GoogleBrandIcon size={16} />
            <Text style={styles.googleBtnText}>{SIGN_IN_COPY.googleCta}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 10,
  },
  header: {
    marginBottom: 6,
    gap: 4,
  },
  title: {
    ...PULSE_SIGNUP_TYPO.titleDesktop,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: SIGN_IN_BRAND.ink,
    fontWeight: '600',
  },
  subtitle: {
    ...PULSE_SIGNUP_TYPO.subtitle,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textMuted,
  },
  forgotRow: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    ...pulseText.captionMedium,
    color: ONBOARDING_BRAND.ink,
  },
  errorText: {
    ...pulseText.error,
  },
  signInBtn: {
    marginTop: 6,
    minHeight: 46,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    backgroundColor: Theme.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnPressed: {
    backgroundColor: Theme.buttonPrimaryPressed,
  },
  signInBtnDisabled: {
    opacity: 0.55,
  },
  signInBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(77, 54, 54, 0.14)',
  },
  orText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  googleBtn: {
    minHeight: 46,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  googleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: ONBOARDING_BRAND.ink,
  },
});
