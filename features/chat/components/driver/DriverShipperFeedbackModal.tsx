import { TripFeedbackModal } from "@/components/TripFeedbackModal";
import { ChatFeedbackCard } from "@/features/chat/components/ChatFeedbackCard";
import type { TripMessageRow } from "@/features/chat/types/chat.types";
import Theme from "@/constants/Theme";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function DriverShipperFeedbackModal({
  visible,
  onClose,
  tripId,
  message = null,
  targetName,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  message?: TripMessageRow | null;
  targetName: string;
  onSubmitted?: () => void;
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmitted = useCallback(() => {
    onSubmitted?.();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 1100);
  }, [onClose, onSubmitted]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <TripFeedbackModal visible={visible} onRequestClose={onClose}>
      <View style={styles.inner}>
        <View style={styles.topBar}>
          <Text style={styles.topBarLabel}>Trip feedback</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close rating"
          >
            <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
        {visible && tripId ? (
          <ChatFeedbackCard
            key={`${tripId}:${message?.id ?? "none"}`}
            message={message}
            tripId={tripId}
            audience="driver"
            targetNameOverride={targetName}
            presentation="modal"
            onSubmitted={handleSubmitted}
          />
        ) : null}
      </View>
    </TripFeedbackModal>
  );
}

const styles = StyleSheet.create({
  inner: {
    width: "100%",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    minHeight: 48,
  },
  topBarLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.whiteMuted,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
});
