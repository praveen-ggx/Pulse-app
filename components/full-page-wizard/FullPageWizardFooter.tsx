import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { alertRegistryActionStyles } from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type FullPageWizardFooterActionVariant = "wizard" | "registry";

export interface FullPageWizardFooterProps {
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
  tertiaryDisabled?: boolean;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  /** Remove the primary button entirely (e.g. blocking input error on screen). */
  hidePrimary?: boolean;
  loading?: boolean;
  summary?: string;
  hint?: string | null;
  /** Registry = notification / chat alert CTA chrome (Decline + Pay now). */
  actionVariant?: FullPageWizardFooterActionVariant;
  /** Dark ink CTA — matches Create Trip desktop footer. */
  primaryTone?: "brand" | "ink";
}

export function FullPageWizardFooter({
  secondaryLabel = "Back",
  onSecondaryPress,
  tertiaryLabel,
  onTertiaryPress,
  tertiaryDisabled = false,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  hidePrimary = false,
  loading = false,
  summary,
  hint,
  actionVariant = "wizard",
  primaryTone = "brand",
}: FullPageWizardFooterProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < Layout.wizardDesktopGridMinWidth;
  const disabled = primaryDisabled || loading;
  const isRegistry = actionVariant === "registry";
  const isInk = !isRegistry && primaryTone === "ink";
  const actionStyles = alertRegistryActionStyles;
  const showHint = Boolean(hint && disabled && !loading);
  const useMobileWizardBar = isMobile && !isRegistry && !summary;

  const footerBarStyle = isRegistry
    ? actionStyles.footerBar
    : summary
      ? styles.footerBarWithSummary
      : useMobileWizardBar
        ? styles.footerBarMobile
        : styles.footerBar;

  const primaryBtn = hidePrimary ? null : (
    <Pressable
      style={[
        isRegistry
          ? actionStyles.footerPrimaryBtn
          : isInk
            ? styles.submitBtnInk
            : styles.submitBtn,
        useMobileWizardBar && styles.submitBtnMobileGrow,
        summary && !isRegistry && styles.submitBtnWithSummary,
        disabled &&
          (isRegistry
            ? actionStyles.btnDisabled
            : isInk
              ? styles.submitBtnInkDisabled
              : styles.submitBtnDisabled),
      ]}
      onPress={onPrimaryPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={primaryLabel}
    >
      {loading ? (
        <ActivityIndicator
          color={
            isRegistry
              ? "#fff"
              : isInk
                ? disabled
                  ? Theme.textMuted
                  : Theme.textOnPrimary
                : Theme.buttonPrimaryText
          }
          size="small"
        />
      ) : (
        <>
          <Text
            style={
              isRegistry
                ? actionStyles.footerPrimaryBtnText
                : isInk
                  ? [
                      styles.submitBtnInkText,
                      disabled && styles.submitBtnInkTextDisabled,
                    ]
                  : [
                      styles.submitBtnText,
                      disabled && styles.submitBtnTextDisabled,
                    ]
            }
            numberOfLines={1}
          >
            {primaryLabel}
          </Text>
          {!isRegistry ? (
            <ChevronRight
              size={18}
              color={
                disabled
                  ? Theme.textMuted
                  : isInk
                    ? Theme.textOnPrimary
                    : Theme.buttonPrimaryText
              }
              strokeWidth={2.5}
            />
          ) : null}
        </>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.footerRoot, useMobileWizardBar && styles.footerRootMobile]}>
      {showHint && !isRegistry ? (
        <Text
          style={[
            styles.footerHintAbove,
            useMobileWizardBar && styles.footerHintAboveMobile,
          ]}
          numberOfLines={2}
        >
          {hint}
        </Text>
      ) : null}
      <View style={footerBarStyle}>
        {summary ? (
          <Text
            style={
              isRegistry ? actionStyles.footerSummary : styles.footerSummaryInline
            }
            numberOfLines={2}
          >
            {summary}
          </Text>
        ) : null}

        {useMobileWizardBar ? (
          <>
            {onSecondaryPress ? (
              <Pressable
                style={styles.cancelBtnMobile}
                onPress={onSecondaryPress}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
                hitSlop={8}
              >
                <ChevronLeft size={18} color={Theme.textRouteCard} strokeWidth={2.5} />
                <Text style={styles.cancelBtnTextMobile}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
            {primaryBtn}
          </>
        ) : (
          <>
            {onSecondaryPress && !isRegistry ? (
              <Pressable
                style={styles.cancelBtn}
                onPress={onSecondaryPress}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
                hitSlop={8}
              >
                <ChevronLeft size={18} color={Theme.textRouteCard} strokeWidth={2.5} />
                <Text style={styles.cancelBtnText}>{secondaryLabel}</Text>
              </Pressable>
            ) : onSecondaryPress && isRegistry ? (
              <Pressable style={actionStyles.footerGhostBtn} onPress={onSecondaryPress}>
                <Text style={actionStyles.footerGhostBtnText}>{secondaryLabel}</Text>
              </Pressable>
            ) : !isRegistry && !summary ? (
              <View style={styles.footerBackSpacer} />
            ) : null}

            <View style={styles.footerActions}>
              {tertiaryLabel && onTertiaryPress ? (
                <Pressable
                  style={[
                    isRegistry ? actionStyles.footerTertiaryBtn : styles.tertiaryBtn,
                    !isRegistry && tertiaryDisabled && styles.tertiaryBtnDisabled,
                    isRegistry && tertiaryDisabled && actionStyles.btnDisabled,
                  ]}
                  onPress={onTertiaryPress}
                  disabled={tertiaryDisabled}
                  accessibilityRole="button"
                >
                  <Text
                    style={
                      isRegistry
                        ? actionStyles.footerTertiaryBtnText
                        : styles.tertiaryBtnText
                    }
                  >
                    {tertiaryLabel}
                  </Text>
                </Pressable>
              ) : null}
              {primaryBtn}
            </View>
          </>
        )}
      </View>
      {hint && !showHint ? (
        <Text style={isRegistry ? actionStyles.footerHint : styles.footerHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
