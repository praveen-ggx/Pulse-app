import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

const SOURCE = require("@/assets/illustrations/compliance-advance-payment.png");

/** Advance panel filler: the payment art moves on the pane color, with no picture frame. */
export function ComplianceAdvancePaymentArt() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [6, -8],
  });
  const scale = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.03],
  });

  return (
    <Animated.Image
      source={SOURCE}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityLabel="Advance payment"
      style={[styles.image, { transform: [{ translateY }, { scale }] }]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: 196,
    aspectRatio: 1024 / 779,
    backgroundColor: "transparent",
  },
});
