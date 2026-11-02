import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { findOrgDuplicateLrNumberForTrip } from "@/features/trips/services/orgLrDuplicate.service";
import { ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PodReconciliationTripView } from "../services/podReconciliationService";

/** react-native-web adds `hovered` to Pressable state; native never sets it. */
type PressableHoverState = PressableStateCallbackType & { hovered?: boolean };

function lrEditorDraft(numbers: string[] | undefined): string {
  return (numbers ?? []).filter(Boolean).join(", ");
}

function lrCellLabel(numbers: string[] | undefined): string {
  const list = numbers ?? [];
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list[0]} +${list.length - 1}`;
}

export function PodLrNumberCell({
  trip,
  onPress,
}: {
  trip: PodReconciliationTripView;
  onPress: () => void;
}) {
  const label = lrCellLabel(trip.lr_numbers);
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `Edit LR ${label}` : "Add LR number"}
        hitSlop={6}
        onPress={(event) => {
          event.stopPropagation?.();
          onPress();
        }}
        style={({ hovered, pressed }: PressableHoverState) => [
          styles.trigger,
          hovered ? styles.triggerHover : null,
          pressed ? styles.triggerPressed : null,
        ]}
      >
        {label ? (
          <>
            <Text numberOfLines={1} style={styles.valueText}>
              {label}
            </Text>
            <FontAwesome name="pencil" size={10} color={METRONIC.muted} />
          </>
        ) : (
          <>
            <FontAwesome name="plus" size={10} color={Theme.primary} />
            <Text style={styles.addText}>Add LR</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function PodLrNumberEditorModal({
  trip,
  uploadedBy,
  orgId,
  onClose,
}: {
  trip: PodReconciliationTripView | null;
  uploadedBy: string | null | undefined;
  orgId: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  useEffect(() => {
    if (!trip) {
      setDraft("");
      setError(null);
      setIsDuplicate(false);
      setSaving(false);
      return;
    }
    setDraft(lrEditorDraft(trip.lr_numbers));
    setError(null);
    setIsDuplicate(false);
    setSaving(false);
  }, [trip]);

  const visible = trip != null;

  useEffect(() => {
    if (!trip) {
      setIsDuplicate(false);
      return;
    }
    const numbers = draft
      .split(/[,;]/)
      .map((value) => value.trim())
      .filter(
        (value) =>
          value.length > 0 && !/^[A-Za-z]*\d+[–-][A-Za-z]*\d+$/.test(value),
      );
    if (numbers.length === 0) {
      setIsDuplicate(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void Promise.all(
        numbers.map((lrNumber) =>
          findOrgDuplicateLrNumberForTrip({
            tripId: trip.internal_id,
            lrNumber,
          }),
        ),
      ).then((results) => {
        if (cancelled) return;
        const found = results.some(Boolean);
        setIsDuplicate(found);
        if (found) setError(ORG_LR_DUPLICATE_MESSAGE);
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trip, draft]);

  const save = async () => {
    if (!trip) return;
    if (!uploadedBy) {
      setError("Sign in to save an LR number.");
      return;
    }
    if (isDuplicate) {
      setError(ORG_LR_DUPLICATE_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await tripDocumentsService.upsertTripLrNumbers({
      tripId: trip.internal_id,
      uploadedBy,
      lrInput: draft,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      setIsDuplicate(saveError.message === ORG_LR_DUPLICATE_MESSAGE);
      return;
    }
    if (orgId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
    }
    await queryClient.invalidateQueries({
      queryKey: queryKeys.trips.detail(trip.internal_id),
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { marginBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text style={styles.kicker}>Lorry receipt</Text>
          <Text style={styles.title}>
            {trip?.lr_numbers?.length ? "Update LR number" : "Add LR number"}
          </Text>
          {trip?.id ? (
            <Text style={styles.caption} numberOfLines={1}>
              Trip {trip.id}
            </Text>
          ) : null}
          <TextInput
            autoFocus
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setIsDuplicate(false);
              setError(null);
            }}
            placeholder="e.g. AI3583 or AI101–AI104"
            placeholderTextColor={METRONIC.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (isDuplicate) return;
              void save();
            }}
            style={[styles.input, isDuplicate ? styles.inputError : null]}
          />
          <Text style={styles.hint}>
            One or more numbers. Separate with commas, or use a range such as
            101–104.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              disabled={saving}
              style={({ hovered, pressed }: PressableHoverState) => [
                styles.ghostBtn,
                hovered ? styles.ghostBtnHover : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (isDuplicate) return;
                void save();
              }}
              disabled={saving}
              style={({ hovered, pressed }: PressableHoverState) => [
                styles.saveBtn,
                hovered ? styles.saveBtnHover : null,
                pressed ? styles.btnPressed : null,
                saving ? styles.saveBtnDisabled : null,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: 118,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 0,
    justifyContent: "center",
    minHeight: 60,
  },
  trigger: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    backgroundColor: "transparent",
    alignSelf: "flex-start",
  },
  triggerHover: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.brandBlueRing,
  },
  triggerPressed: {
    opacity: 0.86,
  },
  valueText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Menlo",
    color: Theme.textPrimaryDark,
  },
  addText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.1,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: Theme.overlayBackdrop,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
    shadowColor: Theme.brandBlueShadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: METRONIC.subtle,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.3,
  },
  caption: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  input: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  inputError: {
    borderColor: Theme.negative,
    backgroundColor: Theme.negativeMuted,
    color: Theme.negative,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  error: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
  },
  actions: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  ghostBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnHover: {
    backgroundColor: Theme.surface,
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.subtle,
  },
  saveBtn: {
    minHeight: 44,
    minWidth: 92,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnHover: {
    opacity: 0.92,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.cardWhite,
  },
  btnPressed: {
    opacity: 0.82,
  },
});
