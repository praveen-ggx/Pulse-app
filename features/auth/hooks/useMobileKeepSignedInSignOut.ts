/**
 * Mobile-only: sign out when app goes to background and "keep me signed in" is off.
 * Debounces the AsyncStorage read to avoid churn on rapid background transitions.
 */
import { getKeepSignedIn } from "@/lib/keepSignedInPreference";
import { logAuth } from "@/lib/authEngine";
import * as authService from "@/features/auth/services/auth.service";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

const DEBOUNCE_MS = 200;

export function useMobileKeepSignedInSignOut(
  clearAuthState: (expired: boolean) => void,
  signOutRequestedRef: React.MutableRefObject<boolean>,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background") return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        getKeepSignedIn().then((keep) => {
          if (keep) return;
          signOutRequestedRef.current = true;
          authService.signOut({ scope: "local" }).finally(() => {
            clearAuthState(false);
            logAuth("mobile_background_sign_out");
          });
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clearAuthState, signOutRequestedRef]);
}
