import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { hubMobileChromeStyles as styles } from "./hubMobileChrome";

export interface HubMobileScreenHeaderProps {
  title: string;
  /** Leading control, such as the profile avatar. */
  leading?: ReactNode;
  action?: ReactNode;
}

/** Row 1 — hub title + primary action pill (Add Trip / Add Load). */
export function HubMobileScreenHeader({ title, leading, action }: HubMobileScreenHeaderProps) {
  return (
    <View style={styles.screenHeaderRow}>
      {leading}
      <Text style={styles.screenTitle}>{title}</Text>
      {action}
    </View>
  );
}
