import { Platform, type ViewStyle } from "react-native";
import Theme from "@/constants/Theme";

export type HoverPressState = { pressed: boolean; hovered?: boolean };

export const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

export const WEB_TRANSITION: ViewStyle | null =
  Platform.OS === "web"
    ? ({
        transitionDuration: "140ms",
        transitionProperty: "background-color, opacity",
        transitionTimingFunction: "ease",
      } as ViewStyle)
    : null;

export function isHovered(state: HoverPressState): boolean {
  return Boolean(state.hovered) || state.pressed;
}

export const hoverRowWash: ViewStyle = {
  backgroundColor: Theme.tableRowHover,
};

export const hoverRowSelected: ViewStyle = {
  backgroundColor: Theme.complianceSelectedWash,
};

export const hoverOnDarkWash: ViewStyle = {
  backgroundColor: Theme.financeHeroRangeHoverBg,
};
