/**
 * Shared Operations strip — first-image layout for hub + party directory.
 * Tiny secondary type carries directory content (counts + short captions).
 */
import {
  HUB_MENU_ICON,
  HUB_MENU_ICON_STROKE,
  hubStyles,
  METRONIC,
} from "@/components/profile/workspaceHubMenu.styles";
import Theme from "@/constants/Theme";
import {
  PARTY_KIND_META,
  PARTY_TAB_LABELS,
  type PartyKind,
} from "@/features/party/types/partyDirectory.types";
import {
  Building2,
  Car,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const TAB_ICONS: Record<PartyKind, LucideIcon> = {
  customers: Building2,
  suppliers: Truck,
  drivers: User,
  vehicles: Car,
};

const ICON_WELL: Record<PartyKind, object> = {
  customers: hubStyles.partyRowIconSlotCustomers,
  suppliers: hubStyles.partyRowIconSlotSuppliers,
  drivers: hubStyles.partyRowIconSlotDrivers,
  vehicles: hubStyles.partyRowIconSlotVehicles,
};

/** One-line tiny captions (directory second-image content, compressed). */
const TINY_CAPTION: Record<PartyKind, string> = {
  customers: "Shippers · billing",
  suppliers: "Carriers · partners",
  drivers: "Fleet roster",
  vehicles: "Fleet assets",
};

export type PartyOperationsKindStripProps = {
  kinds: PartyKind[];
  counts?: Partial<Record<PartyKind, number>>;
  /** When set, strip acts as tabs (directory). Hub omits this. */
  activeKind?: PartyKind | null;
  onSelect: (kind: PartyKind) => void;
  /** Section eyebrow — defaults to OPERATIONS. */
  title?: string;
  accentColor?: string;
};

export const PartyOperationsKindStrip = memo(function PartyOperationsKindStrip({
  kinds,
  counts,
  activeKind = null,
  onSelect,
  title = "Operations",
  accentColor = Theme.driverEmerald,
}: PartyOperationsKindStripProps) {
  if (kinds.length === 0) return null;

  return (
    <View style={hubStyles.sectionCard}>
      <View style={hubStyles.sectionHeader}>
        <View style={[hubStyles.sectionAccent, { backgroundColor: accentColor }]} />
        <Text style={hubStyles.sectionTitle}>{title}</Text>
      </View>
      <View style={local.row}>
        {kinds.map((kind) => {
          const Icon = TAB_ICONS[kind];
          const active = activeKind === kind;
          const count = counts?.[kind];
          const hasCount = typeof count === "number";
          return (
            <Pressable
              key={kind}
              onPress={() => onSelect(kind)}
              style={({ pressed }) => [
                local.cell,
                active && local.cellActive,
                pressed && local.cellPressed,
              ]}
              accessibilityRole={activeKind != null ? "tab" : "button"}
              accessibilityState={activeKind != null ? { selected: active } : undefined}
              accessibilityLabel={`${PARTY_TAB_LABELS[kind]}${
                hasCount ? `, ${count} listed` : ""
              }`}
            >
              <View style={[hubStyles.partyRowIconSlot, ICON_WELL[kind], active && local.iconActive]}>
                <Icon
                  size={18}
                  color={active ? Theme.primary : HUB_MENU_ICON}
                  strokeWidth={HUB_MENU_ICON_STROKE}
                />
              </View>
              <Text
                style={[local.label, active && local.labelActive]}
                numberOfLines={1}
              >
                {PARTY_KIND_META[kind].title}
              </Text>
              {hasCount ? (
                <Text style={[local.tiny, active && local.tinyActive]} numberOfLines={1}>
                  {count} listed
                </Text>
              ) : null}
              <Text style={local.micro} numberOfLines={1}>
                {TINY_CAPTION[kind]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const local = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 2,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  cellActive: {
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  cellPressed: {
    opacity: 0.88,
  },
  iconActive: {
    borderColor: Theme.brandBlueInk,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.text,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  labelActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  tiny: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  tinyActive: {
    color: Theme.primary,
  },
  micro: {
    fontSize: 8,
    fontWeight: "500",
    color: METRONIC.muted,
    textAlign: "center",
    opacity: 0.85,
    letterSpacing: 0.1,
    lineHeight: 10,
    paddingHorizontal: 2,
  },
});
