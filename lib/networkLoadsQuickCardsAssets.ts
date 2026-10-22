import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Illustration11 from "@/assets/illustrations/11.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Theme from "@/constants/Theme";

export type NetworkLoadsQuickActionId = "give" | "reach";

export type NetworkLoadsQuickAction = {
  id: NetworkLoadsQuickActionId;
  label: string;
  sub: string;
  chip: string;
  illustration: ComponentType<SvgProps>;
  aspect: number;
  accent: string;
  wash: string;
  /** Locked / coming-soon — tap shows notice, no navigation. */
  locked?: boolean;
};

/**
 * Marketplace quick-action cards — early Metronic line art
 * (bidding desk + delivery truck), not photoreal mascot PNGs.
 */
export const NETWORK_LOADS_QUICK_ACTIONS: NetworkLoadsQuickAction[] = [
  {
    id: "give",
    label: "Pulse Exchange",
    sub: "Post loads, win live bids",
    chip: "Exchange",
    illustration: Illustration11,
    aspect: 580 / 600,
    accent: Theme.brandBlueInk,
    wash: Theme.brandBlueWash,
  },
  {
    id: "reach",
    label: "Pulse Reach",
    sub: "Boost loads, earn credits",
    chip: "Growth",
    illustration: Illustration20,
    aspect: 600 / 480,
    accent: Theme.accentBrown,
    wash: Theme.accentBrownWash,
  },
];

export function fitNetworkLoadsIllustration(
  boxW: number,
  boxH: number,
  aspect: number,
): { width: number; height: number } {
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  return { width: w, height: h };
}
