/**
 * Route: /finance-entry/[id]
 *
 * Full-page detail for a single ledger entry. Data is passed in via the `payload`
 * param as a JSON string of the already-computed `FinancialRowData` from the
 * Finance tab. This avoids re-fetching the ledger row + trip + siblings when the
 * caller already has them in memory (tap source is the Cash / Kanban tab).
 *
 * If the payload is missing or invalid, we fall back to a minimal error and back-nav.
 */
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { FinanceEntryDetailScreen } from "@/features/finance/components/FinanceEntryDetailScreen";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";

/** Ledger entry detail belongs to Finance → Cash. */
export default function FinanceEntryDetailRoute() {
  return (
    <SurfaceAccessGate surface="finance.subtab.cash">
      <FinanceEntryDetail />
    </SurfaceAccessGate>
  );
}

function FinanceEntryDetail() {
  const params = useLocalSearchParams<{ id: string; payload?: string }>();
  const safeBack = useSafeBack();
  const insets = useSafeAreaInsets();

  const data = useMemo<FinancialRowData | null>(() => {
    const raw = typeof params.payload === "string" ? params.payload : null;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as FinancialRowData;
      if (!parsed || typeof parsed !== "object" || !parsed.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [params.payload]);

  if (!data) {
    return (
      <View
        style={[
          styles.errorRoot,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.errorTitle}>Entry not available</Text>
        <Text style={styles.errorBody}>
          This cash entry could not be loaded. Go back and open it again from the
          list.
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={safeBack}
          activeOpacity={0.85}
        >
          <Text style={styles.backBtnText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <FinanceEntryDetailScreen data={data} onBack={safeBack} />;
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: Theme.screenBackground,
    gap: 10,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  errorBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  backBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  backBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 1.2,
  },
});
