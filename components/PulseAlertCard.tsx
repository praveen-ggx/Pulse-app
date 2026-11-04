import Theme from "@/constants/Theme";
import { platformShadow } from "@/lib/platformShadow";
import { AlertTriangle, Check, Info } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type PulseAlertFact = { label: string; value: string };

export type PulseAlertTone = "neutral" | "success" | "warning" | "destructive";

type Props = {
  title: string;
  message?: string;
  tone?: PulseAlertTone;
  facts?: PulseAlertFact[];
  notes?: string[];
  fileNames?: string[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  alternateLabel?: string;
  onAlternate?: () => void;
};

export function PulseAlertCard({
  title,
  message,
  tone = "neutral",
  facts = [],
  notes = [],
  fileNames = [],
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  alternateLabel,
  onAlternate,
}: Props) {
  const Icon = tone === "success" ? Check : tone === "neutral" ? Info : AlertTriangle;
  const iconColor =
    tone === "success"
      ? Theme.success
      : tone === "destructive"
        ? Theme.destructive
        : tone === "warning"
          ? Theme.warning
          : Theme.textPrimaryDark;
  const iconWash =
    tone === "success"
      ? Theme.positiveMuted
      : tone === "warning"
        ? Theme.warningMuted
        : Theme.modalNeutralIconWash;
  const primaryFill = tone === "destructive" ? Theme.destructive : Theme.buttonDark;

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: iconWash }]}>
          <Icon size={18} color={iconColor} strokeWidth={2.4} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>

      {facts.length > 0 ? (
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact.label} style={styles.fact}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {fileNames.length > 0 ? (
        <View style={styles.facts}>
          {fileNames.map((name, index) => (
            <View key={`${name}-${index}`} style={styles.fact}>
              <Text style={styles.factLabel}>File</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {notes.map((line) => (
        <Text key={line} style={styles.note}>
          {line}
        </Text>
      ))}

      {primaryLabel ? (
        <Pressable
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: primaryFill },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>{primaryLabel}</Text>
        </Pressable>
      ) : null}

      {alternateLabel && onAlternate ? (
        <Pressable
          onPress={onAlternate}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryLabel}>{alternateLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    zIndex: 1,
    ...platformShadow("0 18px 40px rgba(15, 23, 42, 0.16)", {
      color: Theme.shadow,
      opacity: 0.16,
      radius: 24,
      offsetY: 12,
      elevation: 8,
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  facts: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.networkCardBorder,
    marginBottom: 4,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 40,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
  },
  factLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  factValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "right",
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  primary: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.88,
  },
  primaryLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
