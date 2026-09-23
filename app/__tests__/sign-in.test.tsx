import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignIn from '../sign-in';
import { useAuth } from '@/contexts/AuthContext';
import { useSuiteAuthContext } from '@/features/auth/hooks/useSuiteAuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.Alert.alert = jest.fn();
  return rn;
});
import { suiteSignInCopy } from '@/lib/suite/suiteAuthContent';
import { buildSuiteSignUpHref, navigateAfterSuiteAuth } from '@/lib/suite/suiteAuth';
import { getKeepSignedIn } from '@/lib/keepSignedInPreference';
import { useIsDesktopWebInput } from '@/lib/useIsDesktopWebInput';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/NetworkContext', () => ({
  useIsOnline: jest.fn(),
}));

jest.mock('@/features/auth/hooks/useSuiteAuthContext', () => ({
  useSuiteAuthContext: jest.fn(),
}));

jest.mock('@/lib/suite/suiteAuthContent', () => ({
  suiteSignInCopy: jest.fn(),
}));

jest.mock('@/lib/suite/suiteAuth', () => ({
  buildSuiteSignUpHref: jest.fn(() => '/sign-up?product=test-product'),
  navigateAfterSuiteAuth: jest.fn(),
}));

jest.mock('@/lib/keepSignedInPreference', () => ({
  getKeepSignedIn: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@/lib/useIsDesktopWebInput', () => ({
  useIsDesktopWebInput: jest.fn(() => false),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

// Mock icons
jest.mock('lucide-react-native', () => ({
  Eye: 'Eye',
  EyeOff: 'EyeOff',
}));
jest.mock('@expo/vector-icons/FontAwesome', () => 'FontAwesome');
jest.mock('@/features/auth/components/GoogleBrandIcon', () => ({
  GoogleBrandIcon: 'GoogleBrandIcon',
}));
jest.mock('@/features/auth/components/SignInBrandPanel', () => ({
  SignInBrandPanel: 'SignInBrandPanel',
}));

describe('SignIn Component', () => {
  const mockSignIn = jest.fn();
  const mockSignInWithGoogle = jest.fn();
  const mockClearRestoreError = jest.fn();
  const mockRouterPush = jest.fn();
  const mockRouterReplace = jest.fn();

  /** Renders and flushes the async getKeepSignedIn() effect so no act() warning fires. */
  const renderSignIn = async () => {
    const utils = render(<SignIn />);
    await act(async () => {
      await Promise.resolve();
    });
    return utils;
  };

  /** A promise plus its resolver, for holding a sign-in call in flight. */
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  /**
   * The password eye toggle is a bare Pressable with no accessibilityRole, so it is
   * not reachable via getAllByRole('button'). It is the only Pressable in the tree
   * rendered with hitSlop={8}, which is what identifies it here.
   */
  const isPressable = (node: { type: unknown; props: Record<string, unknown> }) =>
    typeof node.type === 'function' &&
    (node.type as { name?: string }).name === 'Pressable' &&
    typeof node.props.onPress === 'function';

  const findEyeToggle = (root: ReturnType<typeof render>) =>
    root.root.findAll((node) => isPressable(node) && node.props.hitSlop === 8)[0];

  beforeEach(() => {
    jest.clearAllMocks();

    (useRouter as jest.Mock).mockReturnValue({
      push: mockRouterPush,
      replace: mockRouterReplace,
    });

    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      restoreError: null,
      clearRestoreError: mockClearRestoreError,
    });

    (useSuiteAuthContext as jest.Mock).mockReturnValue({
      productId: 'test-product',
      product: { activationPath: '/activate' },
      returnTo: undefined,
    });

    (suiteSignInCopy as jest.Mock).mockReturnValue({
      formTitle: 'Sign In',
      formSubtitle: 'Welcome back',
      forgotPassword: 'Forgot password?',
      primaryCta: 'Sign In CTA',
      googleCta: 'Sign in with Google',
      footerPrompt: 'No account?',
      footerLink: 'Sign Up',
    });

    (useIsOnline as jest.Mock).mockReturnValue(true);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (getKeepSignedIn as jest.Mock).mockResolvedValue(true);
    (useIsDesktopWebInput as jest.Mock).mockReturnValue(false);
    (buildSuiteSignUpHref as jest.Mock).mockReturnValue('/sign-up?product=test-product');
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  it('renders correctly', async () => {
    const { getByText, getByPlaceholderText } = await renderSignIn();
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByText('Welcome back')).toBeTruthy();
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Your password')).toBeTruthy();
    expect(getByText('Sign In CTA')).toBeTruthy();
    expect(getByText('Sign in with Google')).toBeTruthy();
  });

  it('renders the desktop brand panel when on desktop web', async () => {
    (useIsDesktopWebInput as jest.Mock).mockReturnValue(true);
    const { UNSAFE_getAllByType, getByText } = await renderSignIn();

    expect(UNSAFE_getAllByType('SignInBrandPanel' as never).length).toBe(1);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('does not render the brand panel on mobile', async () => {
    const { UNSAFE_queryAllByType } = await renderSignIn();
    expect(UNSAFE_queryAllByType('SignInBrandPanel' as never).length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Offline
  // ---------------------------------------------------------------------------

  it('shows offline banner and disables inputs when offline', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    const { getByText, getByPlaceholderText, getByTestId } = await renderSignIn();

    expect(getByText('No internet connection.')).toBeTruthy();

    const emailInput = getByPlaceholderText('you@example.com');
    const passwordInput = getByPlaceholderText('Your password');
    const submitBtn = getByTestId('signin-submit-btn');

    // Props like editable=false translate in testing-library
    expect(emailInput.props.editable).toBe(false);
    expect(passwordInput.props.editable).toBe(false);

    fireEvent.press(submitBtn);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('marks the submit button disabled while offline', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    const { getByTestId } = await renderSignIn();

    const submitBtn = getByTestId('signin-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('does not call google sign in while offline', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Sign in with Google'));
    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Email validation
  // ---------------------------------------------------------------------------

  it('validates empty email', async () => {
    const { getByTestId, getByText } = await renderSignIn();
    const submitBtn = getByTestId('signin-submit-btn');

    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(getByText('Enter your email address.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('validates whitespace-only email as empty', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), '   ');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Enter your email address.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it.each([
    ['no at sign', 'notanemail'],
    ['no domain dot', 'user@example'],
    ['no local part', '@example.com'],
    ['contains a space', 'user name@example.com'],
  ])('rejects a malformed email (%s)', async (_label, badEmail) => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), badEmail);
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Enter a valid email address (e.g. name@example.com).')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('rejects an email longer than 255 characters', async () => {
    const longEmail = `${'a'.repeat(250)}@example.com`;
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), longEmail);
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Email must be at most 255 characters.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace off the email before submitting', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  test@example.com  ');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123', true);
    });
  });

  it('validates invalid characters (null bytes)', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();
    const emailInput = getByPlaceholderText('you@example.com');
    const passwordInput = getByPlaceholderText('Your password');
    const submitBtn = getByTestId('signin-submit-btn');

    fireEvent.changeText(emailInput, 'test\0@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(getByText('Input contains invalid characters.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('rejects a null byte in the password', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'pass\0word');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Input contains invalid characters.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Password validation
  // ---------------------------------------------------------------------------

  it('validates empty password', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Enter your password.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('validates whitespace-only password', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), '    ');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Enter your password.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('rejects a password longer than 128 characters', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'a'.repeat(129));
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Password must be at most 128 characters.')).toBeTruthy();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('keeps inner spaces in the password (does not trim the secret)', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), ' pass word ');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', ' pass word ', true);
    });
  });

  it('caps the password field at 128 characters via maxLength', async () => {
    const { getByPlaceholderText } = await renderSignIn();
    expect(getByPlaceholderText('Your password').props.maxLength).toBe(128);
  });

  it('caps the email field at 255 characters via maxLength', async () => {
    const { getByPlaceholderText } = await renderSignIn();
    expect(getByPlaceholderText('you@example.com').props.maxLength).toBe(255);
  });

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  it('submits form correctly when valid', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    const emailInput = getByPlaceholderText('you@example.com');
    const passwordInput = getByPlaceholderText('Your password');
    const submitBtn = getByTestId('signin-submit-btn');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123', true);
    });
  });

  it('passes keepSignedIn=false through when the stored preference is false', async () => {
    (getKeepSignedIn as jest.Mock).mockResolvedValue(false);
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123', false);
    });
  });

  it('clears any restore error when a sign in attempt starts', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(mockClearRestoreError).toHaveBeenCalled();
    });
  });

  it('displays API error on failed sign in', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    const emailInput = getByPlaceholderText('you@example.com');
    const passwordInput = getByPlaceholderText('Your password');
    const submitBtn = getByTestId('signin-submit-btn');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(getByText('Invalid credentials')).toBeTruthy();
    });
  });

  it('shows a fallback message and an alert when sign in throws', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('network exploded'));
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Sign in failed. Please try again.')).toBeTruthy();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Sign in failed',
      'Sign in failed. Please try again.',
    );
  });

  it('clears a previous error when the user edits the email', async () => {
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = await renderSignIn();

    fireEvent.press(getByTestId('signin-submit-btn'));
    await waitFor(() => {
      expect(getByText('Enter your email address.')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 't');
    expect(queryByText('Enter your email address.')).toBeNull();
  });

  it('clears a previous error when the user edits the password', async () => {
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = await renderSignIn();

    fireEvent.press(getByTestId('signin-submit-btn'));
    await waitFor(() => {
      expect(getByText('Enter your email address.')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('Your password'), 'x');
    expect(queryByText('Enter your email address.')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Loading / in-flight state
  // ---------------------------------------------------------------------------

  it('disables the form and hides the CTA label while sign in is in flight', async () => {
    const gate = deferred<{ error: null }>();
    mockSignIn.mockReturnValueOnce(gate.promise);

    const { getByPlaceholderText, getByTestId, queryByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByTestId('signin-submit-btn').props.accessibilityState?.busy).toBe(true);
    });

    // Spinner replaces the label, inputs lock, button reports disabled.
    expect(queryByText('Sign In CTA')).toBeNull();
    expect(getByPlaceholderText('you@example.com').props.editable).toBe(false);
    expect(getByPlaceholderText('Your password').props.editable).toBe(false);
    expect(getByTestId('signin-submit-btn').props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      gate.resolve({ error: null });
      await gate.promise;
    });
  });

  it('ignores repeat presses while a sign in is already in flight', async () => {
    const gate = deferred<{ error: null }>();
    mockSignIn.mockReturnValueOnce(gate.promise);

    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');

    const submitBtn = getByTestId('signin-submit-btn');
    fireEvent.press(submitBtn);
    fireEvent.press(submitBtn);
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      gate.resolve({ error: null });
      await gate.promise;
    });
  });

  it('stays busy after a successful sign in while waiting for auth state', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { getByPlaceholderText, getByTestId } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled();
    });
    // waitingForAuthState keeps the button busy until the session actually lands.
    await waitFor(() => {
      expect(getByTestId('signin-submit-btn').props.accessibilityState?.busy).toBe(true);
    });
  });

  it('re-enables the CTA after a failed sign in', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
    const { getByPlaceholderText, getByTestId, getByText } = await renderSignIn();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Invalid credentials')).toBeTruthy();
    });
    expect(getByTestId('signin-submit-btn').props.accessibilityState?.disabled).toBe(false);
    expect(getByText('Sign In CTA')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Google sign in
  // ---------------------------------------------------------------------------

  it('calls signInWithGoogle when Google button is pressed', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({ error: null });
    const { getByText } = await renderSignIn();

    const googleBtn = getByText('Sign in with Google');
    fireEvent.press(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledWith(true);
    });
  });

  it('displays the API error when google sign in fails', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({ error: { message: 'Google popup blocked' } });
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(getByText('Google popup blocked')).toBeTruthy();
    });
  });

  it('shows the thrown message and an alert when google sign in throws', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('Google is down'));
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(getByText('Google is down')).toBeTruthy();
    });
    expect(Alert.alert).toHaveBeenCalledWith('Sign in failed', 'Google is down');
  });

  it('shows a generic message when google sign in rejects with a non-error', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce('boom');
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(getByText('Google sign in failed.')).toBeTruthy();
    });
  });

  it('swaps the google label for a signing-in state while in flight', async () => {
    const gate = deferred<{ error: null }>();
    mockSignInWithGoogle.mockReturnValueOnce(gate.promise);

    const { getByText, queryByText } = await renderSignIn();
    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(getByText('Signing in…')).toBeTruthy();
    });
    expect(queryByText('Sign in with Google')).toBeNull();

    await act(async () => {
      gate.resolve({ error: null });
      await gate.promise;
    });
  });

  it('ignores repeat google presses while one is already in flight', async () => {
    const gate = deferred<{ error: null }>();
    mockSignInWithGoogle.mockReturnValueOnce(gate.promise);

    const root = await renderSignIn();

    // Press the Pressable itself, not the label: the label unmounts once the
    // button swaps to its "Signing in…" state.
    const googleBtn = root.root.findAll(
      (node) =>
        isPressable(node) && node.findAllByType('GoogleBrandIcon' as never).length > 0,
    )[0];
    expect(googleBtn).toBeTruthy();

    fireEvent.press(googleBtn!);
    fireEvent.press(googleBtn!);

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      gate.resolve({ error: null });
      await gate.promise;
    });
  });

  // ---------------------------------------------------------------------------
  // Restore error from auth context
  // ---------------------------------------------------------------------------

  it('displays a restore error coming from the auth context', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      restoreError: { message: 'Session expired. Sign in again.' },
      clearRestoreError: mockClearRestoreError,
    });

    const { getByText } = await renderSignIn();
    expect(getByText('Session expired. Sign in again.')).toBeTruthy();
  });

  it('falls back to a default message when the restore error has no message', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      restoreError: {},
      clearRestoreError: mockClearRestoreError,
    });

    const { getByText } = await renderSignIn();
    expect(getByText('Could not restore your session. Sign in again.')).toBeTruthy();
  });

  it('prefers the local sign in error over the restore error', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      restoreError: { message: 'Session expired. Sign in again.' },
      clearRestoreError: mockClearRestoreError,
    });

    const { getByTestId, getByText, queryByText } = await renderSignIn();
    fireEvent.press(getByTestId('signin-submit-btn'));

    await waitFor(() => {
      expect(getByText('Enter your email address.')).toBeTruthy();
    });
    expect(queryByText('Session expired. Sign in again.')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // URL params
  // ---------------------------------------------------------------------------

  it('pre-fills email and displays oauth error from url params', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      email: 'prefill@example.com',
      oauth_error: 'Test OAuth Error',
    });

    const { getByPlaceholderText, getByText } = await renderSignIn();
    const emailInput = getByPlaceholderText('you@example.com');

    expect(emailInput.props.value).toBe('prefill@example.com');
    expect(getByText('Test OAuth Error')).toBeTruthy();
  });

  it('reads the first entry when url params arrive as arrays', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      email: ['first@example.com', 'second@example.com'],
      oauth_error: ['First error', 'Second error'],
    });

    const { getByPlaceholderText, getByText } = await renderSignIn();
    expect(getByPlaceholderText('you@example.com').props.value).toBe('first@example.com');
    expect(getByText('First error')).toBeTruthy();
  });

  it('strips null bytes and trims the oauth error before showing it', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      oauth_error: '  Bad\0 token  ',
    });

    const { getByText } = await renderSignIn();
    expect(getByText('Bad token')).toBeTruthy();
  });

  it('truncates a very long oauth error to 400 characters', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      oauth_error: 'x'.repeat(500),
    });

    const { getByText } = await renderSignIn();
    expect(getByText('x'.repeat(400))).toBeTruthy();
  });

  it('displays password reset success banner from url params', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      password_reset: '1',
    });

    const { getByText } = await renderSignIn();
    expect(getByText('Password updated. Sign in with your new password.')).toBeTruthy();
  });

  it('does not show the reset banner for a non-1 password_reset value', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      password_reset: '0',
    });

    const { queryByText } = await renderSignIn();
    expect(queryByText('Password updated. Sign in with your new password.')).toBeNull();
  });

  it('hides the reset banner once the user starts typing an email', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ password_reset: '1' });

    const { getByPlaceholderText, queryByText, getByText } = await renderSignIn();
    expect(getByText('Password updated. Sign in with your new password.')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a');
    expect(queryByText('Password updated. Sign in with your new password.')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  it('navigates to forgot password with prefilled email', async () => {
    const { getByText, getByPlaceholderText } = await renderSignIn();

    const emailInput = getByPlaceholderText('you@example.com');
    fireEvent.changeText(emailInput, 'user@example.com');

    const forgotBtn = getByText('Forgot password?');
    fireEvent.press(forgotBtn);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/forgot-password?email=user%40example.com');
    });
  });

  it('navigates to forgot password with an empty email when nothing is typed', async () => {
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Forgot password?'));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/forgot-password?email=');
    });
  });

  it('navigates to driver sign in when driver link is pressed', async () => {
    const { getByText } = await renderSignIn();

    const driverLink = getByText('Sign in as a driver');
    fireEvent.press(driverLink);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/driver-sign-in');
    });
  });

  it('navigates to the onboarding hub when the footer sign-up link is pressed', async () => {
    // The footer link no longer routes through buildSuiteSignUpHref — sign-up
    // now starts at the onboarding hub, which branches to business / driver /
    // join-team. The label here comes from the mocked suiteSignInCopy above.
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Sign Up'));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('navigates back to the onboarding hub when Back is pressed', async () => {
    const { getByText } = await renderSignIn();

    fireEvent.press(getByText('Back'));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Post-auth redirect
  // ---------------------------------------------------------------------------

  it('redirects through navigateAfterSuiteAuth once a user is present', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user-1' },
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      restoreError: null,
      clearRestoreError: mockClearRestoreError,
    });
    (useSuiteAuthContext as jest.Mock).mockReturnValue({
      productId: 'test-product',
      product: { activationPath: '/activate' },
      returnTo: '/dashboard',
    });

    await renderSignIn();

    await waitFor(() => {
      expect(navigateAfterSuiteAuth).toHaveBeenCalledWith('/dashboard', expect.any(Function));
    });
  });

  it('does not redirect while there is no user', async () => {
    await renderSignIn();
    expect(navigateAfterSuiteAuth).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Password visibility
  // ---------------------------------------------------------------------------

  it('toggles password visibility when eye icon is pressed', async () => {
    const root = await renderSignIn();
    const { getByPlaceholderText } = root;

    expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(true);

    const passwordEyeToggle = findEyeToggle(root);
    expect(passwordEyeToggle).toBeTruthy();

    fireEvent.press(passwordEyeToggle!);
    await waitFor(() => {
      expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(false);
    });

    fireEvent.press(passwordEyeToggle!);
    await waitFor(() => {
      expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(true);
    });
  });

  it('keeps the typed password intact across a visibility toggle', async () => {
    const root = await renderSignIn();
    const { getByPlaceholderText } = root;

    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');

    const passwordEyeToggle = findEyeToggle(root);
    expect(passwordEyeToggle).toBeTruthy();
    fireEvent.press(passwordEyeToggle!);

    await waitFor(() => {
      expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(false);
    });
    expect(getByPlaceholderText('Your password').props.value).toBe('secret123');
  });
});
