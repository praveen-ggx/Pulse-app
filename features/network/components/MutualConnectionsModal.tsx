/**
 * Lists organizations mutually connected to the viewer and a target org.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { platformShadow } from "@/lib/platformShadow";
import { useMutualConnectionsQuery } from "@/lib/queries/useMutualConnectionsQuery";
import { X } from "lucide-react-native";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MutualConnectionsModalProps = {
  visible: boolean;
  viewerOrgId: string | null;
  targetOrgId: string | null;
  targetOrgName?: string;
  onClose: () => void;
  onOpenProfile: (org: MutualConnectionRow) => void;
};

export function MutualConnectionsModal({
  visible,
  viewerOrgId,
  targetOrgId,
  targetOrgName,
  onClose,
  onOpenProfile,
}: MutualConnectionsModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const query = useMutualConnectionsQuery(
    viewerOrgId,
    targetOrgId,
    visible,
  );
  const mutuals = query.data ?? [];
  const loading = query.isPending && mutuals.length === 0;
  const error = query.error instanceof Error ? query.error.message : null;

  const title = targetOrgName?.trim()
    ? `Mutuals with ${targetOrgName.trim()}`
    : t("networkMutualConnectionsTitleGeneric");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.kicker}>{t("networkDiscoverMutualsSection")}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.72 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={15} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <LoadingIndicator color={Theme.primary} />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>
              Could not load mutual connections. Try again.
            </Text>
          ) : mutuals.length === 0 ? (
            <Text style={styles.emptyText}>{t("networkMutualConnectionsEmpty")}</Text>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {mutuals.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    onOpenProfile(row);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
                  accessibilityRole="button"
                  accessibilityLabel={row.name}
                >
                  <PartyAvatar
                    name={row.name}
                    initialsColorSeed={row.id}
                    organizationImageUrl={row.avatar_url}
                    avatarUrl={row.avatar_url}
                    avatarSeed={row.avatar_seed ?? row.id}
                    entityType="client"
                    isIntegrated
                    size={36}
                    borderStyle={styles.avatarBorder}
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.rowHint}>
                      {t("networkMutualConnectionsViewProfile")}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "72%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    ...platformShadow("0 16px 48px rgba(24, 28, 50, 0.12)", {
      color: "#0F172A",
      opacity: 0.12,
      radius: 28,
      offsetY: 12,
      elevation: 10,
    }),
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textSection,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  loading: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 13,
    color: Theme.teslaRed,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 13,
    color: Theme.textSecondary,
    paddingVertical: 12,
  },
  list: {
    flexGrow: 0,
    maxHeight: 360,
  },
  listContent: {
    gap: 6,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  avatarBorder: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  rowHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.primary,
  },
});
