import { Stack } from "expo-router";

/** Transparent so Review Hub can sit over the previous screen as a dialog. */
export default function IndentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: {
          flex: 1,
          minHeight: 0,
          backgroundColor: "transparent",
        },
      }}
    />
  );
}
