import { PartyAvatar, type PartyEntityType } from "@/components/PartyAvatar";
import { partyDirectoryStyles as styles } from "@/features/party/components/partyDirectory.styles";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { METRONIC } from "@/components/profile/workspaceHubMenu.styles";

export type PartyDirectoryCardVariant = "grid" | "list";

type Props = {
  entityLabel: string;
  name: string;
  meta: string;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  onPress: () => void;
  /** Mobile: horizontal avatar row. Desktop/tablet: Metronic tile. */
  variant?: PartyDirectoryCardVariant;
  /** Soft divider under list rows (except last). */
  showDivider?: boolean;
};

/** Metronic Teams tile (desktop) or smart avatar list row (mobile). */
export const PartyDirectoryPartyCard = memo(function PartyDirectoryPartyCard({
  entityLabel,
  name,
  meta,
  entityType,
  avatarUrl,
  avatarSeed,
  onPress,
  variant = "grid",
  showDivider = false,
}: Props) {
  if (variant === "list") {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.listRow,
          pressed && styles.listRowPressed,
          Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${entityLabel}`}
      >
        <View style={styles.listAvatarWell}>
          <PartyAvatar
            name={name}
            avatarUrl={avatarUrl ?? null}
            avatarSeed={avatarSeed ?? null}
            entityType={entityType}
            size={40}
            shape="circle"
          />
        </View>
        <View style={styles.listCopy}>
          <View style={styles.listTitleRow}>
            <Text style={styles.listName} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.listBadge}>
              <Text style={styles.listBadgeText}>{entityLabel}</Text>
            </View>
          </View>
          <Text style={styles.listMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.listChevron}>
          <ChevronRight size={14} color={METRONIC.muted} strokeWidth={2.2} />
        </View>
        {showDivider ? <View style={styles.listDivider} pointerEvents="none" /> : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.partyCard,
        pressed && styles.partyCardPressed,
        Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${entityLabel}`}
    >
      <View style={styles.partyEntityBadge}>
        <Text style={styles.partyEntityBadgeText}>{entityLabel}</Text>
      </View>

      <View style={styles.partyAvatarHalo}>
        <PartyAvatar
          name={name}
          avatarUrl={avatarUrl ?? null}
          avatarSeed={avatarSeed ?? null}
          entityType={entityType}
          size={44}
          shape="circle"
        />
      </View>

      <Text style={styles.partyName} numberOfLines={2}>
        {name}
      </Text>

      <View style={styles.partySectionsWrap}>
        <View style={[styles.partyMetaRow, styles.partyMetaRowLast]}>
          <Text style={styles.partyMetaLabel}>Contact</Text>
          <Text style={styles.partyMetaValue} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>

      <View style={styles.partyViewBtn}>
        <Text style={styles.partyViewBtnText}>View profile</Text>
      </View>
    </Pressable>
  );
});
