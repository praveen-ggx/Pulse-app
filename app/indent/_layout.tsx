import { Stack } from "expo-router";
import Theme from "@/constants/Theme";

/** Review Hub and allocation are full pages. */
export default function IndentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: {
          flex: 1,
          minHeight: 0,
          backgroundColor: Theme.analyticsCanvas,
        },
      }}
    />
  );
}
