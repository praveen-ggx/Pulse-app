/**
 * Campaign story popup — preview plus impressions, views, and bids.
 */
import Theme from "@/constants/Theme";
import { ReachCampaignDetailPanel } from "@/features/reach/components/ReachCampaignDetailPanel";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { Radio, X } from "lucide-react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ReachCampaignStoryPopupProps = {
  visible: boolean;
  campaign: ReachCampaignRow | null;
  plan?: ReachPlanRow;
  orgName: string;
  tripCampaignIds?: string[];
  onClose: () => void;
  onViewStory?: () => void;
};

export function ReachCampaignStoryPopup({
  visible,
  campaign,
  plan,
  orgName,
  tripCampaignIds,
  onClose,
  onViewStory,
}: ReachCampaignStoryPopupProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 960;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: height - insets.top - insets.bottom - 32,
              width: desktop ? Math.min(720, width - 48) : width - 24,
              marginTop: insets.top + 8,
              marginBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={styles.head}>
            <View style={styles.headLead}>
              <Radio size={15} color={Theme.primary} />
              <Text style={styles.title} numberOfLines={1}>
                Campaign story
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={Theme.textPrimaryDark} />
            </Pressable>
          </View>
          <View style={styles.body}>
            <ReachCampaignDetailPanel
              campaign={campaign}
              plan={plan}
              orgName={orgName}
              tripCampaignIds={tripCampaignIds}
              onViewStory={onViewStory}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sheet: {
    maxWidth: 720,
    minHeight: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headLead: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.actionBtnInk,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minHeight: 360 },
});
