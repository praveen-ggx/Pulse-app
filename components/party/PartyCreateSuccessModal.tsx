import LottieView from "lottie-react-native";
import { memo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";

export type PartyCreateSuccessKind = "client" | "supplier" | "driver" | "vehicle";

const PARTY_CREATED_ANIMATION = require("@/assets/Animated folder/note-saved.json");
const PARTY_INVITED_ANIMATION = require("@/assets/Animated folder/conversation-verified.json");
const DRIVER_CREATED_ANIMATION = require("@/assets/Animated folder/add-user.json");
const VEHICLE_CREATED_ANIMATION = require("@/assets/Animated folder/truck-loading.json");

function successCopy(
  kind: PartyCreateSuccessKind,
  invited: boolean,
): { title: string; message: string } {
  if (invited) {
    if (kind === "driver") {
      return {
        title: "Driver invitation sent",
        message: "They can accept and join your fleet from the Pulse app.",
      };
    }
    if (kind === "supplier") {
      return {
        title: "Supplier invitation sent",
        message: "Your network partner can accept and connect with your organization.",
      };
    }
    return {
      title: "Customer invitation sent",
      message: "The organization can accept and connect with your network.",
    };
  }

  switch (kind) {
    case "supplier":
      return {
        title: "Supplier added successfully",
        message: "Saved to your organization. Finance and trips can use this supplier now.",
      };
    case "driver":
      return {
        title: "Driver added successfully",
        message: "Saved to your fleet. Assign trips and track activity from here.",
      };
    case "vehicle":
      return {
        title: "Vehicle added successfully",
        message: "Saved to your garage. Deploy it on trips and indents right away.",
      };
    case "client":
    default:
      return {
        title: "Customer added successfully",
        message: "Saved to your organization. Finance, trips, and assignments will pick it up automatically.",
      };
  }
}

function animationFor(kind: PartyCreateSuccessKind, invited: boolean) {
  if (invited) return PARTY_INVITED_ANIMATION;
  if (kind === "driver") return DRIVER_CREATED_ANIMATION;
  if (kind === "vehicle") return VEHICLE_CREATED_ANIMATION;
  return PARTY_CREATED_ANIMATION;
}

export interface PartyCreateSuccessModalProps {
  visible: boolean;
  kind: PartyCreateSuccessKind;
  invited?: boolean;
  title?: string;
  message?: string;
  onOk: () => void;
}

export const PartyCreateSuccessModal = memo(function PartyCreateSuccessModal({
  visible,
  kind,
  invited = false,
  title: titleOverride,
  message: messageOverride,
  onOk,
}: PartyCreateSuccessModalProps) {
  const insets = useSafeAreaInsets();
  const copy = successCopy(kind, invited);
  const title = titleOverride ?? copy.title;
  const message = messageOverride ?? copy.message;
  const source = animationFor(kind, invited);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onOk}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.animationWrap}>
            <LottieView
              source={source}
              autoPlay
              loop={false}
              resizeMode="contain"
              style={styles.animation}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Pressable
            style={styles.okBtn}
            onPress={onOk}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text style={styles.okBtnText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  animationWrap: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 12,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  okBtn: {
    marginTop: 6,
    minWidth: 120,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 11,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  okBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.4,
  },
});
