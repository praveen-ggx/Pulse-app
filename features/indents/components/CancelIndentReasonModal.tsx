import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  INDENT_CANCEL_REASONS,
  type IndentCancelReasonId,
} from "@/features/indents/utils/indentCancelReason.util";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSelect: (reason: IndentCancelReasonId) => void;
};

export function CancelIndentReasonModal({
  visible,
  submitting,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={submitting ? undefined : onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={submitting ? undefined : onClose}
        accessibilityLabel="Close cancel indent"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <Text style={styles.title}>Cancel indent</Text>
          <Text style={styles.subtitle}>Choose a reason. Suppliers will no longer see this load.</Text>
          {INDENT_CANCEL_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.id}
              style={styles.reasonBtn}
              onPress={() => onSelect(reason.id)}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={reason.label}
              hitSlop={Layout.touchTargetHitSlop}
            >
              <Text style={styles.reasonText}>{reason.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.keepBtn}
            onPress={onClose}
            disabled={submitting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Keep indent"
            hitSlop={Layout.touchTargetHitSlop}
          >
            <Text style={styles.keepText}>{submitting ? "Cancelling…" : "Keep indent"}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 18,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    marginBottom: 6,
  },
  reasonBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  reasonText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  keepBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  keepText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
