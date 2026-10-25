import { View, Text, StyleSheet } from "react-native";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";

export interface NumericEntryPartyPreview {
  name: string;
  subtitle?: string;
  /**
   * Optional route / corridor line (e.g. "Delhi → Hyderabad").
   * When set, rendered as a compact hero under the name.
   * If omitted but `subtitle` contains "→", the first ·-segment is treated as hero.
   */
  heroLine?: string;
  /** Specs under the hero (vehicle, counter, target) — quieter than heroLine. */
  detailLine?: string;
  entityType?: "client" | "supplier" | "driver";
  /** Network pool indent — stacked-lane mark instead of initials. */
  mark?: "pool";
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
}

export function NumericEntryPartyBanner({
  party,
}: {
  party: NumericEntryPartyPreview;
}) {
  return (
    <View style={styles.banner}>
      <PartyAvatar
        name={party.name}
        avatarUrl={party.avatarUrl ?? null}
        avatarSeed={party.avatarSeed ?? null}
        organizationImageUrl={party.organizationImageUrl ?? null}
        organizationAvatarSeed={party.organizationAvatarSeed ?? null}
        entityType={party.entityType ?? "client"}
        size={40}
      />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {party.name}
        </Text>
        {party.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {party.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});
