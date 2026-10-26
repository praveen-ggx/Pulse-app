/**
 * Detail-pane shell shared by every workspace panel.
 *
 * Layout mirrors the reference: white chrome header, soft canvas body, and
 * an optional sticky white footer for Cancel / Save Changes actions.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { WorkspacePanelChrome } from "@/features/organization/components/workspace/WorkspacePanelChrome";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DETAIL_CANVAS = "#f5f7fb";
const CONTENT_MAX_WIDTH = 720;

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  /** Sticky footer slot (e.g. Cancel + Save Changes). */
  footerSlot?: React.ReactNode;
  children: React.ReactNode;
  /** When true, children fill remaining height (e.g. embedded lists). */
  fillBody?: boolean;
  /** Drop fill-body padding so an inner screen can bleed to the chrome edges. */
  flushBody?: boolean;
  scrollProps?: Pick<ScrollViewProps, "keyboardShouldPersistTaps">;
  /** Override centred column width (e.g. product catalogue grid). */
  contentMaxWidth?: number;
};

export function WorkspaceDetailLayout({
  title,
  subtitle,
  onBack,
  rightSlot,
  footerSlot,
  children,
  fillBody = false,
  flushBody = false,
  scrollProps,
  contentMaxWidth = CONTENT_MAX_WIDTH,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < Layout.workspaceSplitMinWidth;
  const hasFooter = !!footerSlot;
  const pageScroll = isMobile && !fillBody;

  const body = fillBody ? (
    <View
      style={[
        styles.fillBody,
        flushBody && styles.fillBodyFlush,
        { paddingBottom: hasFooter || flushBody ? 0 : insets.bottom },
      ]}
    >
      {children}
    </View>
  ) : (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: hasFooter
            ? 24
            : insets.bottom + Layout.sectionSpacing + 8,
        },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? "handled"}
    >
      <View style={[styles.contentColumn, { maxWidth: contentMaxWidth }]}>
        {children}
      </View>
    </ScrollView>
  );

  const footer = hasFooter ? (
    <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
      <View style={[styles.footerInner, { maxWidth: contentMaxWidth }]}>
        {footerSlot}
      </View>
    </View>
  ) : null;

  if (pageScroll) {
    return (
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: hasFooter
              ? 24
              : insets.bottom + Layout.sectionSpacing + 8,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? "handled"}
        >
          <WorkspacePanelChrome
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            rightSlot={rightSlot}
          />
          <View
            style={[
              styles.scrollContent,
              styles.pageScrollBody,
              flushBody && styles.pageScrollFlush,
            ]}
          >
            <View style={[styles.contentColumn, { maxWidth: contentMaxWidth }]}>
              {children}
            </View>
          </View>
        </ScrollView>
        {footer}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WorkspacePanelChrome
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        rightSlot={rightSlot}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    backgroundColor: DETAIL_CANVAS,
  },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    alignItems: "stretch",
  },
  pageScrollBody: {
    paddingTop: 12,
  },
  pageScrollFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  contentColumn: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    gap: 12,
    alignSelf: "center",
  },
  fillBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  fillBodyFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  footer: {
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 4,
  },
  footerInner: {
    width: "100%",
    alignSelf: "center",
  },
});

export const workspaceDetailLayoutStyles = styles;
