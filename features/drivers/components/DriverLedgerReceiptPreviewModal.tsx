/**
 * Driver ledger receipt as a centered popup (same overlay as business Finance).
 * Keeps the transaction list intact — do not expand rows inline.
 */
import {
  LedgerEntryReceiptCard,
  type LedgerEntryReceiptCardProps,
} from "@/components/ledger/LedgerEntryReceiptCard";
import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

export type DriverLedgerReceiptPreview = Omit<
  LedgerEntryReceiptCardProps,
  | "style"
  | "desktop"
  | "heroAnimation"
  | "primaryAction"
  | "secondaryAction"
  | "dismissAction"
> & {
  secondaryAction?: LedgerEntryReceiptCardProps["secondaryAction"];
  primaryAction?: LedgerEntryReceiptCardProps["primaryAction"];
};

export function DriverLedgerReceiptPreviewModal({
  visible,
  receipt,
  onClose,
}: {
  visible: boolean;
  receipt: DriverLedgerReceiptPreview | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  if (!visible || !receipt) return null;

  const primaryAction = receipt.primaryAction ?? { label: "Done", onPress: onClose };
  const secondaryAction = receipt.secondaryAction;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.cardShell} onStartShouldSetResponder={() => true}>
          <LedgerEntryReceiptCard
            desktop={isDesktop}
            statusLabel={receipt.statusLabel}
            title={receipt.title}
            amount={receipt.amount}
            isIn={receipt.isIn}
            partyAvatar={receipt.partyAvatar}
            details={receipt.details}
            compactActions
            dismissAction={{ label: "Close", onPress: onClose }}
            tripAction={receipt.tripAction}
            secondaryAction={secondaryAction}
            primaryAction={primaryAction}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: LEDGER_RECEIPT.overlay,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  cardShell: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
  },
});
