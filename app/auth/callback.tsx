import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import * as authService from "@/features/auth/services/auth.service";
import { supabase } from "@/lib/supabase";
import { isPostAuthShellLanding, markFreshSignInLanding } from "@/lib/indexBootRedirect.util";
import { ROUTES } from "@/lib/routes";
import {
  buildSuiteSignInHrefWithOAuthError,
  finalizeSuiteNavigationIntent,
  isSuiteExternalAppPath,
  navigateAfterSuiteAuth,
  normalizeSuiteReturnTo,
  peekSuiteNavigationIntent,
  peekSuiteNavigationIntentSync,
} from '@/lib/suite/suiteAuth';
import {
  Redirect,
  type Href,
  useLocalSearchParams,
  useRootNavigationState,
} from "expo-router";
import { useEffect, useState } from "react";

/** When OAuth opened in a popup (sandboxed iframe fallback), finish in the opener tab. */
function tryCompleteOAuthPopup(redirectPath: string): boolean {
  if (typeof window === "undefined") return false;
  const opener = window.opener;
  if (!opener || opener.closed) return false;
  try {
    opener.location.replace(`${window.location.origin}${redirectPath}`);
    opener.focus();
    window.close();
    return true;
  } catch {
    return false;
  }
}

export default function AuthCallback() {
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState("Signing you in…");
  const [redirectTo, setRedirectTo] = useState<Href | null>(null);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    let mounted = true;

    const pickFirst = (v: string | string[] | undefined): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      return undefined;
    };

    const pickFromHash = (key: string, hash: string): string | undefined => {
      if (!hash) return undefined;
      const p = new URLSearchParams(hash);
      const v = p.get(key);
      return v ?? undefined;
    };

    // Read implicit-flow tokens from URL hash synchronously, then strip hash immediately
    // so sensitive tokens are not retained in browser history if an error occurs below.
    const rawHash =
      typeof window !== "undefined"
        ? (window.location.hash?.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash) ?? ""
        : "";
    const hashAccessToken = pickFromHash("access_token", rawHash);
    const hashRefreshToken = pickFromHash("refresh_token", rawHash);
    if ((hashAccessToken || hashRefreshToken) && typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    (async () => {
      try {
        const err =
          pickFirst(params.error_description) ?? pickFirst(params.error) ?? undefined;
        if (err) throw new Error(err);

        setMessage("Finishing sign in…");
        const code = pickFirst(params.code);
        if (code) {
          const { error } = await supabase().auth.exchangeCodeForSession(code);
          if (error) throw new Error(error.message || "Google sign in failed");
        } else {
          // Some providers/configs return implicit tokens in URL hash instead of auth code.
          // Hash was already stripped above to prevent exposure in browser history.
          if (!hashAccessToken || !hashRefreshToken) {
            throw new Error("Missing auth code/token from Google");
          }
          const { error } = await supabase().auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });
          if (error) throw new Error(error.message || "Google sign in failed");
        }

        // Ensure any pending metadata (role/operatingModel) is applied. Authentication has
        // already succeeded above — this only reports whether business details also saved.
        const metadataResult = await authService.applyPendingOAuthMetadata();

        // Strip code/error query params from URL after successful code-exchange callback.
        if (typeof window !== "undefined" && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Redirect to the product that initiated sign-in (Commerce, Core, etc.).
        if (mounted) {
          setMessage(
            metadataResult.status === 'identity_mismatch'
              ? authService.oauthIdentityMismatchMessage(
                  metadataResult.formName,
                  metadataResult.accountEmail,
                )
              : metadataResult.status === 'partial_failure'
                ? authService.OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE
                : "Sign in successful. Redirecting to workspace…",
          );
          const pending =
            peekSuiteNavigationIntentSync() ?? (await peekSuiteNavigationIntent());
          if (pending?.returnTo) {
            const target = normalizeSuiteReturnTo(pending.returnTo);
            if (isPostAuthShellLanding(target)) {
              markFreshSignInLanding();
              if (!tryCompleteOAuthPopup(ROUTES.INDEX)) {
                setRedirectTo(ROUTES.INDEX as Href);
              }
            } else if (!tryCompleteOAuthPopup(target)) {
              if (isSuiteExternalAppPath(target)) {
                navigateAfterSuiteAuth(target);
              } else {
                setRedirectTo(target as Href);
              }
            }
            await finalizeSuiteNavigationIntent();
            return;
          }
          markFreshSignInLanding();
          if (!tryCompleteOAuthPopup(ROUTES.INDEX)) {
            setRedirectTo(ROUTES.INDEX as Href);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Google sign in failed";
        if (mounted) {
          setMessage("Google sign in failed. Redirecting to sign in…");
          const pending = await peekSuiteNavigationIntent();
          const signInPath = buildSuiteSignInHrefWithOAuthError(msg, {
            productId: pending?.productId,
            returnTo: pending?.returnTo,
          });
          if (!tryCompleteOAuthPopup(signInPath)) {
            setRedirectTo(signInPath as Href);
          }
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.code, params.error, params.error_description, rootNavigationState?.key]);

  if (rootNavigationState?.key && redirectTo) {
    return <Redirect href={redirectTo} />;
  }

  return <CenteredLoadingView message={message} color={Theme.primary} />;
}

