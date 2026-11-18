import { useEffect, useRef, useState } from "react";
import { Animated, type StyleProp, type TextStyle } from "react-native";

/** Integer that slides in when it changes, like a scoreboard. */
export function ScoreboardNumber({
  value,
  style,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
}) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const slide = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value === shownRef.current) return;
    const rising = value > shownRef.current;
    Animated.parallel([
      Animated.timing(slide, {
        toValue: rising ? -10 : 10,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(scale, { toValue: 1.12, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      shownRef.current = value;
      setShown(value);
      slide.setValue(rising ? 10 : -10);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 7 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }),
      ]).start();
    });
  }, [scale, slide, value]);

  return (
    <Animated.Text style={[style, { transform: [{ translateY: slide }, { scale }] }]}>
      {shown}
    </Animated.Text>
  );
}
