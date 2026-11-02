/**
 * Shared Pulse product chrome for Expo-hosted products (Invoice, POD, Finance Pro).
 * Top bar matches Core desktop: PULSE. · product switcher · chat / bell / avatar.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FinanceProSubTabs } from "@/features/finance-pro/components/FinanceProSubTabs";
import { FinanceProAlign } from "@/features/finance-pro/components/FinanceProAlign";
import {
  parseSafeReturnTo,
  returnToLabel,
} from "@/features/finance-pro/components/financeProReturnTo";
import type { ExpoProductShellId } from "@/lib/suite/suiteProducts";
import {
  expoProductShellIdFromRouteNames,
  flattenNavigationRouteNames,
} from "@/lib/suite/suiteProducts";
import { PulseProductChromeHeader } from "./PulseProductChromeHeader";
import { useNavigationState } from "@react-navigation/native";
import { useGlobalSearchParams, useRouter } from "expo-router";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const PulseProductShellContext = createContext<ExpoProductShellId | null>(
  null,
);

export function usePulseProductShell(): ExpoProductShellId | null {
  return useContext(PulseProductShellContext);
}

function expoProductShellIdFromParam(
  raw: string | string[] | undefined,
): ExpoProductShellId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "finance-pro" || value === "invoice" || value === "pod") {
    return value;
  }
  return null;
}

/** Product shell we are in, including when Workspace is stacked on top of it. */
export function useActiveExpoProductShell(): ExpoProductShellId | null {
  const ctx = usePulseProductShell();
  const search = useGlobalSearchParams<{ fromProduct?: string | string[] }>();
  const fromParam = expoProductShellIdFromParam(search.fromProduct);
  const fromNav = useNavigationState((state) =>
    expoProductShellIdFromRouteNames(flattenNavigationRouteNames(state)),
  );
  return ctx ?? fromParam ?? fromNav;
}

export function PulseProductShell({
  productId,
  children,
}: {
  productId: ExpoProductShellId;
  children: ReactNode;
}) {
  const router = useRouter();
  const search = useGlobalSearchParams();
  const returnTo =
    productId === "finance-pro" ? null : parseSafeReturnTo(search.returnTo);

  return (
    <PulseProductShellContext.Provider value={productId}>
      <View style={styles.root}>
        {productId === "invoice" ? null : (
          <PulseProductChromeHeader productId={productId} />
        )}

        {productId === "finance-pro" ? <FinanceProSubTabs /> : null}
        {returnTo ? (
          <View style={styles.returnBar}>
            <FinanceProAlign>
              <Pressable
                onPress={() => router.replace(returnTo as never)}
                style={styles.returnBtn}
                accessibilityRole="button"
                accessibilityLabel={returnToLabel(returnTo)}
              >
                <Text style={styles.returnText}>← {returnToLabel(returnTo)}</Text>
              </Pressable>
            </FinanceProAlign>
          </View>
        ) : null}

        <View style={styles.body}>{children}</View>
      </View>
    </PulseProductShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  body: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  returnBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.screenBackground,
  },
  returnBtn: {
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  returnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
  },
});
