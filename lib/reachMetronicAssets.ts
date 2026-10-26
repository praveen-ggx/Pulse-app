/**
 * Metronic KeenThemes icon pack — Pulse Boost Campaign Manager widgets.
 * Sources: assets/business-3451 + assets/finance-1096 (SVG).
 */
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import IconAuction from "@/assets/business-3451/svg/auction-9139786.svg";
import IconDollarCoins from "@/assets/business-3451/svg/dollar-coins-9139749.svg";
import IconTarget from "@/assets/business-3451/svg/target-9139709.svg";
import IconFinancialEye from "@/assets/finance-1096/svg/financial-eye-9519151.svg";

export type ReachMetronicKpiId =
  | "balance"
  | "active"
  | "impressions"
  | "results";

export type ReachMetronicKpiAsset = {
  id: ReachMetronicKpiId;
  Icon: ComponentType<SvgProps>;
  /** Intrinsic art aspect (w/h) for fit helpers. */
  aspect: number;
};

export const REACH_METRONIC_KPI_ICONS: Record<
  ReachMetronicKpiId,
  ReachMetronicKpiAsset
> = {
  balance: {
    id: "balance",
    Icon: IconDollarCoins,
    aspect: 1,
  },
  active: {
    id: "active",
    Icon: IconTarget,
    aspect: 1,
  },
  impressions: {
    id: "impressions",
    Icon: IconFinancialEye,
    aspect: 1,
  },
  results: {
    id: "results",
    Icon: IconAuction,
    aspect: 1,
  },
};

/** Campaign Manager primary fill — Metronic brown ink (screenshot CTAs). */
export const REACH_METRONIC_PRIMARY = "#4D3636";

export {
  REACH_M,
  REACH_PAGE,
  REACH_PAGE_MAX,
} from "@/features/reach/styles/reachMetronic";
