/**
 * Earn Credits — dedicated route. Same billing body as Pulse Boost → Billing.
 */
import { hubMobileChromeStyles } from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachBillingPanel } from "@/features/reach/components/ReachBillingPanel";
import { useReachOrgSummaryQuery } from "@/lib/queries/useReachCampaignsQuery";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReachEarnCreditsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization: organization } = useOrganization();
  const summaryQ = useReachOrgSummaryQuery(organization?.id ?? null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[hubMobileChromeStyles.shell, styles.hubHeader]}>
        <View style={hubMobileChromeStyles.screenHeaderRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={Theme.textPrimaryDark} />
          </Pressable>
          <Text style={hubMobileChromeStyles.screenTitle} numberOfLines={1}>
            Billing
          </Text>
          <View style={styles.titleSpacer} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + insets.bottom },
        ]}
      >
        <ReachBillingPanel walletBalance={summaryQ.data?.walletBalance ?? 0} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  hubHeader: {
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleSpacer: { width: 36, flexShrink: 0 },
  content: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    gap: 10,
  },
});
