import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { platformShadow } from "@/lib/platformShadow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useRef } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import LottieView, { type AnimationObject } from "lottie-react-native";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

export type ThemedAlertModalVariant = "neutral" | "warning";

export interface ThemedAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  okText?: string;
  onOk: () => void;
  onRequestClose?: () => void;
  variant?: ThemedAlertModalVariant;
  okVariant?: "primary" | "secondary";
  /** Optional secondary action under the primary button. */
  secondaryText?: string;
  onSecondary?: () => void;
  /** Prefer asset Lottie over the default glyph icon. */
  lottieSource?: AnimationObject;
  lottieLoop?: boolean;
  lottieSize?: number;
}

export function ThemedAlertModal({
  visible,
  title,
  message,
  okText = "OK",
  onOk,
  onRequestClose,
  variant = "neutral",
  okVariant = "secondary",
  secondaryText,
  onSecondary,
  lottieSource,
  lottieLoop = true,
  lottieSize = 108,
}: ThemedAlertModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const stackActions = Boolean(secondaryText && onSecondary) && windowWidth < 420;
  const backdrop = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      cardScale.setValue(0.92);
      cardOpacity.setValue(0);
      return;
    }

    backdrop.setValue(0);
    cardScale.setValue(0.92);
    cardOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      lottieRef.current?.reset?.();
      lottieRef.current?.play?.();
    });
  }, [visible, backdrop, cardOpacity, cardScale]);

  const variantConfig = React.useMemo(() => {
    type IconName = React.ComponentProps<typeof FontAwesome>["name"];
    if (variant === "warning") {
      return {
        accentColor: Theme.negative,
        iconName: "exclamation-circle" as IconName,
        iconColor: Theme.negative,
        iconBg: Theme.negativeMuted,
      };
    }
    return {
      accentColor: Theme.modalNeutralAccent,
      iconName: "check-circle" as IconName,
      iconColor: Theme.modalNeutralAccent,
      iconBg: Theme.modalNeutralIconWash,
    };
  }, [variant]);

  const okButtonStyle =
    okVariant === "primary" ? styles.okButtonPrimary : styles.okButtonSecondary;
  const okTextStyle =
    okVariant === "primary" ? styles.okTextPrimary : styles.okTextSecondary;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onRequestClose ?? onOk}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.backdropFill, { opacity: backdrop }]}
        />
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <View
            style={[styles.accentBar, { backgroundColor: variantConfig.accentColor }]}
          />

          {lottieSource ? (
            <View
              style={[
                styles.lottieWrap,
                { width: lottieSize, height: lottieSize },
              ]}
            >
              <LottieView
                ref={lottieRef}
                source={lottieSource}
                autoPlay
                loop={lottieLoop}
                resizeMode="contain"
                style={styles.lottie}
              />
            </View>
          ) : (
            <View
              style={[styles.iconCircle, { backgroundColor: variantConfig.iconBg }]}
            >
              <FontAwesome
                name={variantConfig.iconName}
                size={22}
                color={variantConfig.iconColor}
              />
            </View>
          )}

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View
            style={[
              styles.actions,
              stackActions ? styles.actionsStack : styles.actionsRow,
            ]}
          >
            {secondaryText && onSecondary ? (
              <TouchableOpacity
                onPress={onSecondary}
                style={[
                  styles.okButtonBase,
                  styles.secondaryButton,
                  stackActions ? styles.actionGrow : styles.actionFlex,
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={secondaryText}
              >
                <Text style={styles.secondaryText}>{secondaryText}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onOk}
              style={[
                styles.okButtonBase,
                okButtonStyle,
                secondaryText && onSecondary
                  ? stackActions
                    ? styles.actionGrow
                    : styles.actionFlex
                  : styles.okButtonStretch,
              ]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={okText}
            >
              <Text style={[styles.okTextBase, okTextStyle]}>{okText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    ...platformShadow("0 16px 28px rgba(15, 23, 42, 0.14)", {
      color: Theme.shadow,
      opacity: 0.14,
      radius: 24,
      offsetY: 14,
      elevation: 14,
    }),
  },
  accentBar: {
    width: "100%",
    height: 4,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginBottom: 8,
    opacity: 0.85,
  },
  lottieWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  lottie: {
    width: "100%",
    height: "100%",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.25,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 16,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  okButtonBase: {
    borderRadius: 999,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  actions: {
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  actionsStack: {
    flexDirection: "column",
  },
  actionFlex: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 132,
    minWidth: 132,
  },
  actionGrow: {
    alignSelf: "stretch",
    width: "100%",
  },
  okButtonStretch: {
    alignSelf: "stretch",
    width: "100%",
  },
  okButtonPrimary: {
    backgroundColor: Theme.textPrimaryDark,
  },
  okButtonSecondary: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  okTextBase: {
    fontSize: 15,
    fontWeight: "700",
  },
  okTextPrimary: {
    color: Theme.textOnPrimary,
  },
  okTextSecondary: {
    color: Theme.textPrimaryDark,
  },
  secondaryButton: {
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});
