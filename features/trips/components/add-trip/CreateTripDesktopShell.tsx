import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react-native";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";

import Theme from "@/constants/Theme";
import { useViewportHeight, viewportCapStyle } from "@/lib/hooks/useViewportHeight";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

const SHELL_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export type CreateTripDesktopShellProps = {
  title?: string;
  subtitle?: string;
  stepIndex?: number;
  stepTotal?: number;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  progress?: ReactNode;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  hidePrimary?: boolean;
  primaryLoading?: boolean;
  hint?: string | null;
  fillBody?: boolean;
  /** Supplier/client amount keypad — fill the card instead of scrolling a form. */
  dockKeypad?: boolean;
};

export function CreateTripDesktopShell({
  title = "Create Trip",
  subtitle,
  stepIndex,
  stepTotal,
  onClose,
  onBack,
  children,
  progress,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  hidePrimary = false,
  primaryLoading = false,
  hint = null,
  fillBody = false,
  dockKeypad = false,
}: CreateTripDesktopShellProps) {
  const insets = useSafeAreaInsets();
  const viewportHeight = useViewportHeight();
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;
  const isFinalStep = stepIndex != null && stepTotal != null && stepIndex >= stepTotal;
  const showHint = Boolean(hint && primaryDisabled && !primaryLoading);
  const headerBack = Boolean(onBack);

  const stepChrome = (
    <View style={s.stepSurfaceHeader}>
      {progress}
      {subtitle ? <Text style={s.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  const bodyInner = (
    <>
      {stepChrome}
      <View style={s.stepSurfaceDivider} />
      {fillBody ? (
        dockKeypad ? (
          <View style={[s.stepSurfaceBody, s.stepSurfaceBodyFill, s.stepSurfaceBodyKeypad]}>
            {children}
          </View>
        ) : (
          <ScrollView
            style={s.stepSurfaceBodyScroll}
            contentContainerStyle={s.stepSurfaceBodyScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            {children}
          </ScrollView>
        )
      ) : (
        <View style={s.stepSurfaceBody}>{children}</View>
      )}
    </>
  );

  const stepContent = (
    <MotiView
      from={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "timing", duration: 280, easing: SHELL_EASE }}
      style={[s.stepSurface, fillBody && s.stepSurfaceFill, s.stepSurfaceAnimated]}
    >
      {bodyInner}
    </MotiView>
  );

  return (
    <View
      style={[
        s.root,
        /** Header + body + footer stay inside the visible viewport, so the
         *  Continue dock is reachable on iPad landscape / short windows. */
        viewportCapStyle(viewportHeight),
        { paddingTop: insets.top },
      ]}
    >
      <View style={s.header}>
        <View style={[s.rail, s.headerInner]}>
          <View style={s.headerLeft}>
            <Pressable
              onPress={headerBack ? onBack : onClose}
              style={s.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={headerBack ? "Back to previous step" : "Close"}
            >
              <ArrowLeft size={16} color={Theme.textRouteCard} strokeWidth={2.5} />
              <Text style={s.closeBtnText}>{headerBack ? "Back" : "Close"}</Text>
            </Pressable>
          </View>
          <View style={s.headerCenter} pointerEvents="none">
            <Text style={s.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={s.headerRight}>
            {stepLabel ? <Text style={s.headerStepBadge}>{stepLabel}</Text> : null}
          </View>
        </View>
      </View>

      {fillBody ? (
        <View style={[s.content, { flex: 1, minHeight: 0 }]}>
          <View style={[s.contentInner, { flex: 1, minHeight: 0 }]}>
            {stepContent}
          </View>
        </View>
      ) : (
        <ScrollView
          style={s.content}
          contentContainerStyle={[
            s.contentInner,
            { paddingBottom: 12 + (Platform.OS === "web" ? 0 : insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {stepContent}
        </ScrollView>
      )}

      <View
        style={[
          s.footer,
          {
            paddingBottom:
              Platform.OS === "web"
                ? 0
                : Math.max(insets.bottom, 0),
          },
        ]}
      >
        <View style={[s.rail, s.footerInner]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={s.footerBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to previous step"
            >
              <ChevronLeft size={16} color={Theme.textRouteCard} strokeWidth={2.5} />
              <Text style={s.footerBackBtnText}>Back</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.footerBackBtn, s.footerBackBtnHidden]} disabled>
              <ChevronLeft size={16} color={Theme.textRouteCard} strokeWidth={2.5} />
              <Text style={s.footerBackBtnText}>Back</Text>
            </Pressable>
          )}
          <View style={s.footerActions}>
            {showHint ? (
              <Text style={s.footerInlineHint} numberOfLines={2}>
                {hint}
              </Text>
            ) : null}
            {hidePrimary ? null : (
            <View style={s.footerPrimaryWrap}>
              <Pressable
                onPress={onPrimaryPress}
                disabled={primaryDisabled || primaryLoading}
                style={[
                  s.footerPrimaryBtn,
                  (primaryDisabled || primaryLoading) && s.footerPrimaryBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: primaryDisabled || primaryLoading }}
              >
                {primaryLoading ? (
                  <ActivityIndicator
                    color={
                      primaryDisabled ? Theme.textMuted : Theme.textOnPrimary
                    }
                    size="small"
                  />
                ) : (
                  <>
                    <Text
                      style={[
                        s.footerPrimaryBtnText,
                        (primaryDisabled || primaryLoading) &&
                          s.footerPrimaryBtnTextDisabled,
                      ]}
                    >
                      {primaryLabel}
                    </Text>
                    {isFinalStep ? (
                      <CheckCircle2
                        size={16}
                        color={
                          primaryDisabled ? Theme.textMuted : Theme.textOnPrimary
                        }
                        strokeWidth={2.5}
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        color={
                          primaryDisabled ? Theme.textMuted : Theme.textOnPrimary
                        }
                        strokeWidth={2.5}
                      />
                    )}
                  </>
                )}
              </Pressable>
            </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
