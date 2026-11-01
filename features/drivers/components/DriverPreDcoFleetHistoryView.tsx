/**
 * Full-page pre-DCO fleet earnings (same TO COLLECT + employer cards as
 * non-DCO wallet Fleet), for converted DCOs reviewing former employer dues.
 */
import { DriverCapturePaymentButton } from "@/features/drivers/components/DriverCapturePaymentButton";
import {
  driverBodySecondary,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { resolveDriverOrgAvatarUri } from "@/features/drivers/utils/resolveDriverOrgAvatar.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import { History, Sparkles, Wallet, X } from "lucide-react-native";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type PreDcoFleetCard = {
  orgId: string;
  orgName: string;
  driverId: string;
  earned: number;
  pending: number;
  received: number;
  tripsCompleted: number;
  joinedAt: string;
  leftAt: string | null;
  isCurrent?: boolean;
};

export type PreDcoFleetTripLine = {
  tripId: string;
  displayId: string;
  orgName: string;
  route: string;
  earned: number;
  received: number;
  pending: number;
  dateLabel: string;
};

type OrgAvatar = {
  logoUrl?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
};

type Colors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  emerald: string;
};

type Props = {
  colors: Colors;
  isDark: boolean;
  fleets: PreDcoFleetCard[];
  trips: PreDcoFleetTripLine[];
  orgAvatarById: Record<string, OrgAvatar | undefined>;
  onClose: () => void;
  onOpenPassbook: (orgId: string, orgName: string) => void;
  onOpenTrip: (tripId: string) => void;
};

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatPeriod(from: string, to?: string | null): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return `${fmt(new Date(from))} – ${to ? fmt(new Date(to)) : "Present"}`;
}

export function DriverPreDcoFleetHistoryView({
  colors,
  isDark,
  fleets,
  trips,
  orgAvatarById,
  onClose,
  onOpenPassbook,
  onOpenTrip,
}: Props) {
  const insets = useSafeAreaInsets();
  const toCollect = fleets.reduce((sum, f) => sum + Math.max(0, f.pending), 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={onClose}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Close history"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={18} color={colors.text} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.textMuted }]}>Before DCO</Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            Fleet earnings
          </Text>
        </View>
        <History size={18} color={colors.emerald} strokeWidth={2.2} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: Layout.screenPaddingHorizontal,
          paddingTop: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heroTitle, { color: colors.emerald }]}>SALARY.</Text>
        <Text style={[styles.heroSub, { color: Theme.textSecondary }]}>
          Financial audit & settlements · former employer
        </Text>

        <TouchableOpacity activeOpacity={1} style={styles.walletCardWrap}>
          <LinearGradient
            colors={
              isDark
                ? ["#022c22", Theme.driverEmeraldDark]
                : [Theme.driverEmeraldDark, Theme.driverEmerald]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.walletCard}
          >
            <View style={styles.walletWatermark} pointerEvents="none">
              <Wallet size={92} color="#059669" strokeWidth={1.4} />
            </View>
            <View style={styles.walletCardContent}>
              <View style={styles.walletLabelRow}>
                <Sparkles size={15} color="rgba(236,253,245,0.95)" strokeWidth={2.5} />
                <Text style={styles.walletLabel}>TO COLLECT</Text>
              </View>
              <View style={styles.walletBalanceRow}>
                <Text style={styles.walletRupee}>₹</Text>
                <Text
                  style={[
                    styles.walletBalance,
                    Platform.OS === "android" && styles.walletBalanceAndroid,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {Math.round(toCollect).toLocaleString("en-IN")}
                </Text>
              </View>
              <Text style={styles.walletSub}>pending from fleet before conversion</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Former employer</Text>
        {fleets.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.9)",
              },
            ]}
          >
            <FontAwesome name="building" size={22} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No fleet employment on file from before DCO conversion.
            </Text>
          </View>
        ) : (
          fleets.map((fleet) => {
            const uri = resolveDriverOrgAvatarUri({
              orgId: fleet.orgId,
              orgName: fleet.orgName,
              branding: orgAvatarById[fleet.orgId],
            });
            return (
              <View
                key={`${fleet.orgId}-${fleet.driverId}`}
                style={[
                  styles.fleetCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.9)",
                  },
                ]}
              >
                <View style={styles.fleetTop}>
                  <View style={styles.fleetTopLeft}>
                    <View
                      style={[
                        styles.logo,
                        {
                          backgroundColor: isDark ? colors.surfaceElevated : "rgba(248,250,252,0.92)",
                          borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.9)",
                        },
                      ]}
                    >
                      <Image source={{ uri }} style={styles.logoImage} resizeMode="cover" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.fleetName, { color: colors.text }]} numberOfLines={1}>
                        {fleet.orgName}
                      </Text>
                      <Text style={[styles.fleetMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatPeriod(fleet.joinedAt, fleet.leftAt)}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.12)",
                        borderColor: isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.22)",
                      },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: colors.textMuted }]}>
                      {fleet.isCurrent ? "Linked" : "Past"}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View
                    style={[
                      styles.statBox,
                      {
                        backgroundColor: isDark ? colors.surfaceElevated : "rgba(248,250,252,0.85)",
                        borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.8)",
                      },
                    ]}
                  >
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>Lifetime earned</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{inr(fleet.earned)}</Text>
                    {fleet.tripsCompleted > 0 ? (
                      <Text style={[styles.statHint, { color: colors.emerald }]}>
                        {fleet.tripsCompleted} trip{fleet.tripsCompleted !== 1 ? "s" : ""}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statBox,
                      {
                        backgroundColor: isDark ? colors.surfaceElevated : "rgba(248,250,252,0.85)",
                        borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.8)",
                        borderLeftWidth: 2,
                        borderLeftColor:
                          fleet.pending > 0
                            ? isDark
                              ? "rgba(251,191,36,0.55)"
                              : Theme.warning
                            : isDark
                              ? colors.borderSubtle
                              : "rgba(226,232,240,0.8)",
                      },
                    ]}
                  >
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pending</Text>
                    <Text
                      style={[
                        styles.statValue,
                        {
                          color: fleet.pending > 0 ? (isDark ? "#fbbf24" : Theme.warning) : colors.textMuted,
                        },
                      ]}
                    >
                      {inr(fleet.pending)}
                    </Text>
                    <Text style={[styles.statHint, { color: colors.textMuted }]}>
                      received {inr(fleet.received)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.inspectBtn}
                  activeOpacity={0.85}
                  onPress={() => onOpenPassbook(fleet.orgId, fleet.orgName)}
                  accessibilityRole="button"
                  accessibilityLabel={`Inspect ${fleet.orgName}`}
                >
                  <Text style={styles.inspectText}>Inspect fleet center</Text>
                  <FontAwesome name="chevron-right" size={11} color={Theme.textOnPrimary} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 18 }]}>
          Transactions
        </Text>
        {trips.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No fleet trips recorded before conversion.
          </Text>
        ) : (
          trips.map((line, idx) => (
            <TouchableOpacity
              key={line.tripId}
              style={[
                styles.tripRow,
                idx < trips.length - 1 && styles.tripRowBorder,
                { borderBottomColor: isDark ? colors.borderSubtle : Theme.borderLight },
              ]}
              activeOpacity={0.82}
              onPress={() => onOpenTrip(line.tripId)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tripId, { color: colors.text }]} numberOfLines={1}>
                  {line.displayId}
                </Text>
                <Text style={[styles.tripMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {line.orgName}
                  {line.route ? ` · ${line.route}` : ""}
                  {line.dateLabel ? ` · ${line.dateLabel}` : ""}
                </Text>
              </View>
              <View style={styles.tripAmts}>
                <Text style={[styles.tripEarned, { color: colors.text }]}>{inr(line.earned)}</Text>
                <Text
                  style={[
                    styles.tripDue,
                    { color: line.pending > 0 ? Theme.warning : colors.textMuted },
                  ]}
                >
                  {line.pending > 0 ? `${inr(line.pending)} due` : "Settled"}
                </Text>
              </View>
              {line.pending > 0 ? (
                <DriverCapturePaymentButton
                  tripId={line.tripId}
                  due={line.pending}
                  lane="fleet"
                  partyName={line.orgName}
                  compact
                />
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: {
    ...driverUISemiBold,
    fontSize: 16,
    marginTop: 1,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.6,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  heroSub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 12,
  },
  walletCardWrap: { marginBottom: 16 },
  walletCard: {
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 20,
    overflow: "hidden",
    minHeight: 132,
  },
  walletWatermark: {
    position: "absolute",
    top: 6,
    right: -4,
  },
  walletCardContent: { alignItems: "center" },
  walletLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  walletLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "rgba(167,243,208,0.88)",
  },
  walletBalanceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  walletRupee: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  walletBalance: {
    fontSize: 34,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -1,
  },
  walletBalanceAndroid: { includeFontPadding: false },
  walletSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(167,243,208,0.7)",
  },
  sectionTitle: {
    ...driverUISemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    ...driverBodySecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  fleetCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  fleetTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fleetTopLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoImage: { width: "100%", height: "100%" },
  fleetName: {
    ...driverUISemiBold,
    fontSize: 13,
  },
  fleetMeta: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 2,
  },
  statusPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  statValue: {
    ...driverUISemiBold,
    fontSize: 15,
    marginTop: 2,
  },
  statHint: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 2,
  },
  inspectBtn: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inspectText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    minHeight: 52,
  },
  tripRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tripId: {
    ...driverUISemiBold,
    fontSize: 12,
  },
  tripMeta: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 2,
  },
  tripAmts: { alignItems: "flex-end", minWidth: 64 },
  tripEarned: {
    ...driverUISemiBold,
    fontSize: 12,
  },
  tripDue: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 2,
  },
});
