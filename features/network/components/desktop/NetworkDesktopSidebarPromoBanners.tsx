/**
 * Network sidebar promo banners — Pulse Boost, Give loads, Get loads.
 * Compact cards matching the Sales Grow suggestion widget chrome.
 */
import Theme from "@/constants/Theme";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useVerifiedActionGuard } from "@/features/network/utils/verifiedActionGuard";
import { ROUTES } from "@/lib/routes";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ArrowUpRight,
  Package,
  Rocket,
  Truck,
} from "lucide-react-native";
import {
  Platform,
  Pressable,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type PromoKind = "reach" | "give" | "get";

type PromoDef = {
  id: PromoKind;
  chip: string;
  title: string;
  sub: string;
  accent: string;
  wash: string;
  Icon: typeof Rocket;
};

const PROMOS: PromoDef[] = [
  {
    id: "reach",
    chip: "Growth",
    title: "Pulse Boost",
    sub: "Boost loads, earn credits, win more bids",
    accent: Theme.accentBrown,
    wash: "rgba(107, 79, 58, 0.08)",
    Icon: Rocket,
  },
  {
    id: "give",
    chip: "Supply",
    title: "Give loads",
    sub: "Post open freight to your network",
    accent: Theme.brandBlueInk,
    wash: "rgba(205, 233, 247, 0.55)",
    Icon: Package,
  },
  {
    id: "get",
    chip: "Demand",
    title: "Get loads",
    sub: "Bid on freight from verified partners",
    accent: "#059669",
    wash: "rgba(16, 185, 129, 0.1)",
    Icon: Truck,
  },
];

export type NetworkDesktopSidebarPromoBannersProps = {
  /** Hide individual promo tiles. */
  hide?: Partial<Record<PromoKind, boolean>>;
};

export function NetworkDesktopSidebarPromoBanners({
  hide,
}: NetworkDesktopSidebarPromoBannersProps) {
  const router = useRouter();
  const guardVerified = useVerifiedActionGuard();

  const openPromo = (kind: PromoKind) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (kind === "reach") {
      router.push(ROUTES.REACH.HOME as never);
      return;
    }
    guardVerified(() => {
      router.push(ROUTES.PULSE_LOADS as never);
    });
  };

  const visible = PROMOS.filter((p) => !hide?.[p.id]);
  if (visible.length === 0) return null;

  return (
    <View style={local.stack}>
      {visible.map((promo) => {
        const Icon = promo.Icon;
        return (
          <Pressable
            key={promo.id}
            onPress={() => openPromo(promo.id)}
            style={({ pressed }) => [
              hubStyles.salesCard,
              local.card,
              { backgroundColor: promo.wash },
              pressed && local.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${promo.title} — ${promo.sub}`}
          >
            <View style={local.row}>
              <View
                style={[
                  local.iconOrb,
                  {
                    backgroundColor: `${promo.accent}18`,
                    borderColor: `${promo.accent}33`,
                  },
                ]}
              >
                <Icon size={14} color={promo.accent} strokeWidth={2.2} />
              </View>
              <View style={local.textCol}>
                <Text style={[local.chip, { color: promo.accent }]}>
                  {promo.chip}
                </Text>
                <Text style={local.title} numberOfLines={1}>
                  {promo.title}
                </Text>
                <Text style={local.sub} numberOfLines={2}>
                  {promo.sub}
                </Text>
              </View>
              <View
                style={[local.arrowOrb, { borderColor: `${promo.accent}28` }]}
              >
                <ArrowUpRight
                  size={13}
                  color={promo.accent}
                  strokeWidth={2.3}
                />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const local = {
  stack: {
    gap: 8,
    width: "100%",
  } satisfies ViewStyle,
  card: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    overflow: "hidden",
  } satisfies ViewStyle,
  pressed: {
    opacity: 0.92,
  } satisfies ViewStyle,
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  } satisfies ViewStyle,
  iconOrb: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  } satisfies ViewStyle,
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  } satisfies ViewStyle,
  chip: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  } satisfies TextStyle,
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  sub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 14,
  } satisfies TextStyle,
  arrowOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    flexShrink: 0,
  } satisfies ViewStyle,
};
