import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

const SOURCE = require("@/assets/illustrations/compliance-checklist-gap.png");

/** Checklist column filler: the review illustration, gently floating so the gap isn't a static graphic. */
export function ComplianceChecklistGapArt() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2400,
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
    outputRange: [2, -2],
  });

  return (
    <Animated.Image
      source={SOURCE}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={[styles.image, { transform: [{ translateY }] }]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "72%",
    maxWidth: 168,
    aspectRatio: 1008 / 606,
    maxHeight: 72,
  },
});
