import {
  Banknote,
  Building2,
  Clock,
  CreditCard,
  FileText,
  Smartphone,
  Ticket,
  type LucideIcon,
} from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";
import { PaymentTypeLogo, PaymentTypeStripGlyph } from "@/components/ledger/paymentTypeLogos";
import { ledgerPaymentTypeVisual } from "@/components/ledger/paymentTypeVisuals.util";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";

export function isLedgerCashPaymentMode(id: string | null | undefined): boolean {
  return (id ?? "").trim().toUpperCase() === "CASH";
}

export type PaymentModeVisual = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  tint: string;
  gradient: readonly [string, string, ...string[]];
  Icon: LucideIcon;
};

export const LEDGER_PAYMENT_MODES: PaymentModeVisual[] = [
  {
    id: "CASH",
    label: "Cash",
    shortLabel: "Cash",
    color: "#16a34a",
    tint: "#dcfce7",
    gradient: ["#4ade80", "#16a34a", "#14532d"],
    Icon: Banknote,
  },
  {
    id: "UPI",
    label: "UPI",
    shortLabel: "UPI",
    color: "#7c3aed",
    tint: "#ede9fe",
    gradient: ["#f97316", "#7c3aed", "#059669"],
    Icon: Smartphone,
  },
  {
    id: "BANK",
    label: "Bank Transfer",
    shortLabel: "Bank",
    color: "#2563eb",
    tint: "#dbeafe",
    gradient: ["#60a5fa", "#2563eb", "#1e3a8a"],
    Icon: Building2,
  },
  {
    id: "CHEQUE",
    label: "Cheque",
    shortLabel: "Cheque",
    color: "#db2777",
    tint: "#fce7f3",
    gradient: ["#f9a8d4", "#db2777", "#9d174d"],
    Icon: FileText,
  },
  {
    id: "FUEL_CARD",
    label: "Fuel Card",
    shortLabel: "Fuel card",
    color: "#ea580c",
    tint: "#ffedd5",
    gradient: ["#fdba74", "#ea580c", "#9a3412"],
    Icon: CreditCard,
  },
  {
    id: "FASTAG",
    label: "FASTag",
    shortLabel: "FASTag",
    color: "#4D3636",
    tint: "#e0e7ff",
    gradient: ["#a5b4fc", "#4D3636", "#312e81"],
    Icon: Ticket,
  },
  {
    id: "CREDIT",
    label: "Credit",
    shortLabel: "Credit",
    color: "#64748b",
    tint: "#f1f5f9",
    gradient: ["#cbd5e1", "#64748b", "#334155"],
    Icon: Clock,
  },
];

export function ledgerPaymentModeVisual(modeId: string): PaymentModeVisual {
  return LEDGER_PAYMENT_MODES.find((m) => m.id === modeId) ?? LEDGER_PAYMENT_MODES[0]!;
}

/** Core Collect Payment strip — always one equal row. */
export const LEDGER_CORE_PAYMENT_MODE_IDS = ["CASH", "UPI", "BANK", "CHEQUE"] as const;

/** Logos that already paint the mode name (hide under-label). Line icons never do. */
export function paymentModeHasWordmark(_modeId: string): boolean {
  return false;
}

export function splitLedgerPaymentModes(modes: PaymentModeVisual[] = LEDGER_PAYMENT_MODES): {
  core: PaymentModeVisual[];
  extra: PaymentModeVisual[];
} {
  const coreSet = new Set<string>(LEDGER_CORE_PAYMENT_MODE_IDS);
  const core = LEDGER_CORE_PAYMENT_MODE_IDS.map(
    (id) => modes.find((m) => m.id === id) ?? ledgerPaymentModeVisual(id),
  );
  const extra = modes.filter((m) => !coreSet.has(m.id));
  return { core, extra };
}

export const LedgerPaymentModeTile = memo(function LedgerPaymentModeTile({
  modeId,
  selected,
  size = "md",
}: {
  modeId: string;
  selected?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? 44 : 52;

  return (
    <View style={[styles.tileOuter, selected && styles.tileOuterSelected]}>
      <View style={[styles.tileIconWrap, { width: box, height: box }]}>
        <PaymentModeLogo modeId={modeId} size={Math.round(box * 0.92)} />
      </View>
    </View>
  );
});

export const LedgerPaymentTypeIcon = memo(function LedgerPaymentTypeIcon({
  kind,
  size = 32,
}: {
  kind: string;
  size?: number;
}) {
  if (size > 26) {
    return <PaymentTypeLogo kind={kind} size={size} />;
  }
  return (
    <View style={[stripStyles.iconSlot, { width: size, height: size }]}>
      <PaymentTypeStripGlyph kind={kind} size={size} />
    </View>
  );
});

export function ledgerPaymentModeLabel(modeId: string): string {
  return ledgerPaymentModeVisual(modeId).label;
}

export type LedgerProtocolStripVariant = "desktop" | "compact";

export const LEDGER_PROTOCOL_STRIP = {
  iconSlot: 28,
  logo: { desktop: 20, compact: 18 },
  tileHeight: { desktop: 54, compact: 48 },
} as const;

type LedgerProtocolStripTileBaseProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  width?: number;
  variant?: LedgerProtocolStripVariant;
};

function stripTileSize(variant: LedgerProtocolStripVariant) {
  return {
    iconSlot: LEDGER_PROTOCOL_STRIP.iconSlot,
    logo: LEDGER_PROTOCOL_STRIP.logo[variant],
    minHeight: LEDGER_PROTOCOL_STRIP.tileHeight[variant],
  };
}

/** SYNC MODE chip — brand logo + mode-tinted selection. */
export const LedgerProtocolStripModeTile = memo(function LedgerProtocolStripModeTile({
  modeId,
  label,
  selected,
  onPress,
  width,
  variant = "desktop",
}: LedgerProtocolStripTileBaseProps & { modeId: string }) {
  const mode = ledgerPaymentModeVisual(modeId);
  const dims = stripTileSize(variant);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        stripStyles.tile,
        { minHeight: dims.minHeight },
        width != null && { width },
        variant === "compact" && stripStyles.tileCompact,
        selected && { borderColor: mode.color, backgroundColor: mode.tint },
        pressed && stripStyles.tilePressed,
      ]}
    >
      <View style={[stripStyles.iconSlot, { width: dims.iconSlot, height: dims.iconSlot }]}>
        <PaymentModeLogo modeId={modeId} size={dims.logo} />
      </View>
      <Text
        style={[
          stripStyles.label,
          variant === "compact" && stripStyles.labelCompact,
          selected && { color: mode.color, fontWeight: "800" },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
});

/** PAYMENT TYPE chip — semantic icon + per-type tint (matches SYNC MODE layout). */
export const LedgerProtocolStripTypeTile = memo(function LedgerProtocolStripTypeTile({
  kind,
  label,
  selected,
  onPress,
  width,
  variant = "desktop",
}: LedgerProtocolStripTileBaseProps & { kind: string }) {
  const visual = ledgerPaymentTypeVisual(kind);
  const dims = stripTileSize(variant);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        stripStyles.tile,
        { minHeight: dims.minHeight },
        width != null && { width },
        variant === "compact" && stripStyles.tileCompact,
        selected && { borderColor: visual.color, backgroundColor: visual.tint },
        pressed && stripStyles.tilePressed,
      ]}
    >
      <View style={[stripStyles.iconSlot, { width: dims.iconSlot, height: dims.iconSlot }]}>
        <PaymentTypeStripGlyph kind={kind} size={dims.iconSlot} />
      </View>
      <Text
        style={[
          stripStyles.label,
          variant === "compact" && stripStyles.labelCompact,
          selected && { color: visual.color, fontWeight: "800" },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const stripStyles = StyleSheet.create({
  tile: {
    flexShrink: 0,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: 3,
  },
  tileCompact: {
    borderRadius: 10,
    gap: 4,
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 2,
  },
  tilePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: "700",
    textAlign: "center",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    paddingHorizontal: 1,
  },
  labelCompact: {
    fontSize: 7,
    lineHeight: 8,
    letterSpacing: 0.15,
  },
});

const styles = StyleSheet.create({
  tileOuter: {
    borderRadius: 12,
  },
  tileOuterSelected: {
    transform: [{ scale: 1.04 }],
  },
  tileIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
