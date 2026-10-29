/**
 * Full-screen document viewer — same overlay as the vault category sheet.
 */
import Theme from "@/constants/Theme";
import {
  DocumentUploadAttributionRow,
  documentUploadAttributionHasContent,
  type DocumentUploadAttribution,
} from "@/features/trips/components/trip-detail/DocumentUploadAttributionRow";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import Feather from "@expo/vector-icons/Feather";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export function VaultFullDocumentModal({
  visible,
  uri,
  isPdf,
  title,
  documentKey,
  documentVersion,
  navLabel,
  headerFacts,
  uploadAttribution = null,
  canNavigate = false,
  onPrev,
  onNext,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  isPdf: boolean;
  title: string;
  documentKey?: string | null;
  documentVersion?: string | null;
  navLabel?: string | null;
  /** LR / invoice / Valid till — same facts as the document card. */
  headerFacts?: string | null;
  /** Uploader avatar + name + timestamp under the document title. */
  uploadAttribution?: DocumentUploadAttribution | null;
  canNavigate?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const showNav = Boolean(canNavigate && onPrev && onNext);
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      {...(Platform.OS === "web" ? { style: { zIndex: 30000 } } : {})}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.header}>
          {showNav ? (
            <Pressable
              onPress={onPrev}
              style={styles.nav}
              accessibilityRole="button"
              accessibilityLabel="Previous document"
            >
              <Feather name="chevron-left" size={18} color={Theme.actionBtnInk} />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {headerFacts ? (
              <Text style={styles.meta} numberOfLines={1}>
                {headerFacts}
              </Text>
            ) : null}
            {documentUploadAttributionHasContent(uploadAttribution) ? (
              <DocumentUploadAttributionRow {...uploadAttribution!} size={26} light />
            ) : null}
            {navLabel ? (
              <Text style={styles.meta} numberOfLines={1}>
                {navLabel}
              </Text>
            ) : null}
          </View>
          {showNav ? (
            <Pressable
              onPress={onNext}
              style={styles.nav}
              accessibilityRole="button"
              accessibilityLabel="Next document"
            >
              <Feather name="chevron-right" size={18} color={Theme.actionBtnInk} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close full document"
          >
            <Feather name="x" size={16} color={Theme.actionBtnInk} />
          </Pressable>
        </View>
        {uri ? (
          <TripVaultFilePreview
            uri={uri}
            isPdf={isPdf}
            style={styles.body}
            accessibilityLabel={title || "Document"}
            showToolbar
            sizing="fit"
            interactive
            scrollbar
            previewTier="full"
            documentKey={documentKey}
            documentVersion={documentVersion}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Loading document…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    minHeight: 44,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.cardWhite,
    ...WEB_COPY,
  },
  meta: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.cardWhite,
    opacity: 0.8,
    ...WEB_COPY,
  },
  nav: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  body: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  empty: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
});
