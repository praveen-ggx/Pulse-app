/**
 * Shared ticket-card tokens for Trips + Load Center (indents) mobile hub cards.
 * Commerce tokens mirror clean retail order-card hierarchy (status → product → actions).
 */
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

export const HUB_MOBILE_TICKET_REF = {
  card: Theme.screenBackground,
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
  accent: "#1a73e8",
  radius: 16,
} as const;

/** Soft page canvas so white ticket cards lift clearly. */
export const HUB_MOBILE_LIST_CANVAS_BG = "#F5F5F6";

/** Retail-clean accents for Compliance mobile list + document detail. */
export const HUB_MOBILE_COMMERCE_REF = {
  ink: "#282C3F",
  muted: "#94969F",
  hairline: "#EAEAEC",
  success: "#03A685",
  successSoft: "#E5F6F1",
  warning: "#F5A623",
  warningSoft: "#FFF6E5",
  danger: "#E11B23",
  dangerSoft: "#FDECEC",
  link: "#FF3F6C",
  cardRadius: 12,
  canvas: HUB_MOBILE_LIST_CANVAS_BG,
} as const;

export const hubMobileListCanvasStyles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
  },
  listPadded: {
    width: "100%",
    gap: 0,
    paddingHorizontal: 0,
  },
  cardWrap: {
    width: "100%",
    marginBottom: 8,
  },
});
