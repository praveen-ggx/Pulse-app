import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { getDriverThemeColors } from "@/contexts/DriverThemeContext";
import { useKeyboardVisible } from "@/lib/hooks/useKeyboardVisible";

import { ExpenseBillScanBanner } from "./ExpenseBillScanBanner";
import { ExpenseReceiptViewfinder } from "./ExpenseReceiptViewfinder";
import type { BillScanState } from "./expenseBillScan.types";

const FOOTER_HEIGHT = 68;
const CANVAS = "#F5F7FA";
const ACCENT = Theme.driverEmeraldDark;

type ScrollAssistContextValue = {
  scrollToInput: (event: NativeSyntheticEvent<TextInputFocusEventData>) => void;
};

const ScrollAssistContext = createContext<ScrollAssistContextValue | null>(null);

export type DriverExpenseCategory = "fuel" | "toll" | "other";

type AttachmentProps = {
  uri: string | null;
  busy?: boolean;
  onAttach: () => void;
  /** Photo taken from the live viewfinder. */
  onCaptured?: (uri: string) => void;
  /** Pick an existing photo. Uses the same reading path as Click Photo. */
  onPick?: () => void;
  onRemove?: () => void;
  label?: string;
};

type Props = {
  category: DriverExpenseCategory;
  title: string;
  subtitle: string;
  isEditing: boolean;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  skipLabel?: string;
  hint?: string | null;
  syncHint?: string | null;
  billScan?: BillScanState | null;
  onApplyBillScan?: () => void;
  onDismissBillScan?: () => void;
  onReviewBillScan?: () => void;
  attachment?: AttachmentProps;
  /** Column heading above the amount control. Defaults to "Amount". */
  amountLabel?: string;
  amountSlot?: ReactNode;
  children: ReactNode;
};

export function DriverExpenseEntryLayout({
  title,
  subtitle,
  isEditing,
  saving,
  onBack,
  onSave,
  saveDisabled = false,
  skipLabel = "Cancel",
  hint,
  syncHint,
  billScan,
  onApplyBillScan,
  onDismissBillScan,
  onReviewBillScan,
  attachment,
  amountLabel = "Amount",
  amountSlot,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = getDriverThemeColors("light");
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasAttachment = !!attachment?.uri?.trim();
  const scanActive = billScan?.phase === "preparing" || billScan?.phase === "analyzing";
  const scrollRef = useRef<ScrollView>(null);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();

  const scrollToInput = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    const target = event.nativeEvent.target;
    if (target == null) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
        target,
        FOOTER_HEIGHT + 20,
        true,
      );
    });
  }, []);

  const scrollPaddingBottom =
    FOOTER_HEIGHT +
    18 +
    (keyboardVisible
      ? Platform.OS === "ios"
        ? 10
        : Math.max(keyboardHeight, 220) + 10
      : insets.bottom);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: Theme.driverEmeraldWash }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={Platform.OS !== "web"}
    >
      <View style={styles.body} accessibilityLabel={title}>
        <View style={[styles.backBar, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={10} accessibilityRole="button">
            <Feather name="arrow-left" size={18} color={Theme.textPrimary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <Modal
          visible={previewOpen && hasAttachment}
          animationType="fade"
          transparent
          onRequestClose={() => setPreviewOpen(false)}
        >
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)}>
            {attachment?.uri ? (
              <Pressable onPress={() => setPreviewOpen(false)} style={styles.previewImageWrap}>
                <Image
                  source={{ uri: attachment.uri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </Pressable>
            ) : null}
          </Pressable>
        </Modal>

        <View style={styles.sheet}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: scrollPaddingBottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={false}
          >
            <ScrollAssistContext.Provider value={{ scrollToInput }}>
              {attachment ? (
                <ExpenseReceiptViewfinder
                  uri={attachment.uri ?? null}
                  busy={attachment.busy || saving}
                  scanning={!!scanActive}
                  statusText={
                    billScan?.phase === "confirm"
                      ? "Review detected fields below"
                      : billScan?.message
                  }
                  onAttach={attachment.onAttach}
                  onCaptured={attachment.onCaptured}
                  onPick={attachment.onPick}
                  onRemove={attachment.onRemove}
                  onPress={hasAttachment ? () => setPreviewOpen(true) : undefined}
                />
              ) : null}
              {subtitle.trim() ? (
                <View style={styles.routeDock}>
                  <View style={styles.routeCard}>
                    <Feather name="navigation" size={14} color={Theme.driverEmerald} />
                    <Text style={styles.routeText} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  </View>
                </View>
              ) : null}
              {amountSlot ? (
                <View style={styles.topCard}>
                  {amountSlot ? (
                    <View style={styles.amountCol}>
                      <View style={styles.colLabelRow}>
                        <Feather name="credit-card" size={10} color={Theme.textMuted} />
                        <Text style={styles.colLabel}>{amountLabel}</Text>
                      </View>
                      <View style={styles.amountBody}>{amountSlot}</View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {billScan && billScan.phase !== "idle" ? (
                <ExpenseBillScanBanner
                  scan={billScan}
                  onApplyPending={onApplyBillScan}
                  onDismissPending={onDismissBillScan}
                  onReviewOcr={onReviewBillScan}
                />
              ) : null}
              {children}
            </ScrollAssistContext.Provider>

            {hint ? (
              <View style={[styles.notice, { backgroundColor: colors.emeraldMuted }]}>
                <Feather name="info" size={12} color={ACCENT} />
                <Text style={[styles.noticeText, { color: ACCENT }]}>{hint}</Text>
              </View>
            ) : null}
            {syncHint ? <Text style={styles.syncHint}>{syncHint}</Text> : null}
          </ScrollView>

          <View
            style={[
              styles.footerBar,
              {
                paddingBottom: keyboardVisible ? 10 : insets.bottom + 12,
              },
            ]}
          >
            <Pressable style={styles.skipBtn} onPress={onBack} disabled={saving}>
              <Text style={styles.skipText}>{skipLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, (saving || saveDisabled) && { opacity: 0.45 }]}
              onPress={onSave}
              disabled={saving || saveDisabled}
              accessibilityState={{ disabled: saving || saveDisabled }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>
                  {isEditing ? "Update expense" : "Save expense"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function DriverExpenseSection({
  title,
  children,
  fill,
}: {
  title?: string;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <View style={[styles.sectionCard, fill && styles.sectionFill]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={[styles.sectionBody, fill && styles.sectionBodyFill]}>{children}</View>
    </View>
  );
}

export function DriverExpenseFieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function DriverExpenseFieldDivider() {
  return <View style={styles.fieldDivider} />;
}

export function DriverExpenseTextInput(
  props: React.ComponentProps<typeof TextInput> & { multiline?: boolean },
) {
  const colors = getDriverThemeColors("light");
  const scrollAssist = useContext(ScrollAssistContext);
  const { onFocus, ...rest } = props;

  return (
    <TextInput
      {...rest}
      placeholderTextColor={colors.placeholder}
      onFocus={(event) => {
        scrollAssist?.scrollToInput(
          event as unknown as NativeSyntheticEvent<TextInputFocusEventData>,
        );
        onFocus?.(event);
      }}
      style={[
        styles.input,
        props.multiline && styles.inputMultiline,
        {
          color: colors.text,
          backgroundColor: CANVAS,
          borderColor: Theme.driverEmeraldBorderSoft,
        },
        props.style,
      ]}
    />
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, minHeight: 0 },
  backBar: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    minHeight: 36,
  },
  backText: {
    color: Theme.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  routeDock: {
    zIndex: 3,
  },
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  routeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "visible",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingRight: 4,
  },
  heroIconSlot: {
    flexShrink: 0,
    width: 44,
    height: 44,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  heroIconFloat: {
    position: "absolute",
    width: 64,
    height: 64,
    top: -10,
    right: -4,
    backgroundColor: "transparent",
  },
  heroKicker: {
    ...Typography.headerTitle,
    fontSize: 9,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.68)",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.4,
  },
  routeChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  routeChipText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
  },
  heroHint: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    color: "rgba(255,255,255,0.68)",
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
    backgroundColor: Theme.driverEmeraldWash,
  },
  sheetContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 0,
    gap: 10,
  },
  scroll: { flex: 1, minHeight: 0 },
  topCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    ...cardShadow,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  receiptCol: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    minWidth: 0,
    gap: 6,
  },
  amountCol: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    minWidth: 0,
    gap: 6,
    marginTop: 4,
  },
  amountBody: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  vDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.driverEmeraldBorderSoft,
    marginHorizontal: 10,
  },
  colLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 12,
  },
  colLabel: {
    ...Typography.headerTitle,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.7,
    fontWeight: "700",
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 10,
    ...cardShadow,
  },
  sectionTitle: {
    ...Typography.headerTitle,
    fontSize: 10,
    letterSpacing: 0.7,
    fontWeight: "700",
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sectionBody: {
    gap: 12,
  },
  sectionFill: { flex: 1, minHeight: 0 },
  sectionBodyFill: { flex: 1, justifyContent: "center" },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.driverEmeraldBorderSoft,
  },
  fieldLabel: {
    ...Typography.headerTitle,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "500",
    minHeight: 42,
    lineHeight: 18,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 10,
    borderRadius: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  syncHint: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    color: Theme.textMuted,
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.driverEmeraldBorderSoft,
  },
  skipBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: CANVAS,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  saveBtn: {
    flex: 1.6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  saveText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  previewImageWrap: {
    width: "100%",
    height: "80%",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
});
