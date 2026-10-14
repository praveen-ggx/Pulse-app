import Theme from "@/constants/Theme";
import { PodInwardForm } from "@/features/debit-control/components/PodInwardForm";
import type { PodInwardDraft, PodInwardTripOption } from "@/features/debit-control/utils/podInwardForm.util";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function PodInwardFormModal({
  visible,
  tripCount,
  tripOptions,
  initialSelectedIds,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** Trips already chosen by the caller. Ignored when `tripOptions` is given. */
  tripCount?: number;
  /** When set, the form shows a checklist and submits the ticked trip IDs. */
  tripOptions?: PodInwardTripOption[];
  initialSelectedIds?: string[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: PodInwardDraft, tripIds: string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <ScrollView style={styles.card} contentContainerStyle={styles.cardContent} keyboardShouldPersistTaps="handled">
          <PodInwardForm
            resetKey={visible ? "open" : "closed"}
            tripCount={tripCount}
            tripOptions={tripOptions}
            initialSelectedIds={initialSelectedIds}
            submitting={submitting}
            error={error}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    flexGrow: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  cardContent: { padding: 16 },
});
