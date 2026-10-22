import type { DimensionValue, ViewStyle } from "react-native";

/**
 * Web: min viewport for the multi-column hub grid (trips + load center).
 * Below this — phones **and tablets** — hubs stack one hub list card per row,
 * so no width falls between the stacked card and the grid card.
 */
export const HUB_GRID_MIN_WIDTH = 1024;

/**
 * CSS-pixel floor for one hub ticket. Browser zoom changes `innerWidth`, so a
 * hard 25%/33% grid crushes type when the visual card is narrower than this.
 */
export const HUB_GRID_CARD_MIN_WIDTH = 292;

/** Horizontal chrome (page pad + grid negative margin) reserved beside cards. */
export const HUB_GRID_VIEWPORT_CHROME = 64;

export function hubGridColumnCount(
  viewportWidth: number,
  maxColumns: number = 4,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth < HUB_GRID_MIN_WIDTH) {
    return 1;
  }
  const available = Math.max(0, viewportWidth - HUB_GRID_VIEWPORT_CHROME);
  const fitted = Math.floor(available / HUB_GRID_CARD_MIN_WIDTH);
  return Math.max(1, Math.min(maxColumns, fitted || 1));
}

export function hubGridItemStyle(
  columns: number,
  options?: { paddingHorizontal?: number; marginBottom?: number },
): ViewStyle {
  const n = Math.max(1, columns);
  const pct = `${Number((100 / n).toFixed(4))}%` as DimensionValue;
  return {
    width: pct,
    maxWidth: pct,
    flexBasis: pct,
    minWidth: 0,
    paddingHorizontal: options?.paddingHorizontal ?? 6,
    marginBottom: options?.marginBottom ?? 14,
    alignSelf: "stretch",
  };
}

/**
 * Web: min viewport where a stacked hub card is wide enough to also carry the
 * finance toolbar (tablets). Phones keep the card body only.
 */
export const HUB_CARD_TOOLBAR_MIN_WIDTH = 768;

/** Shared geometry for 4-column desktop hub cards (trips, indents). */
export const HUB_GRID_CARD_MIN_HEIGHT = 188;
export const HUB_GRID_ROUTE_MIN_HEIGHT = 30;
/** Client/org avatar in hub ticket card header (mobile list + desktop grid). */
export const HUB_CARD_HEAD_AVATAR = 40;
/** Supplier / driver chips in hub ticket card footer row. */
export const HUB_CARD_PARTY_CHIP_AVATAR = 32;
/** @deprecated Use `HUB_CARD_HEAD_AVATAR`. */
export const HUB_GRID_HEAD_AVATAR = HUB_CARD_HEAD_AVATAR;
export const HUB_CARD_HEAD_LEFT_GAP = 10;
/** @deprecated Use `HUB_CARD_HEAD_LEFT_GAP`. */
export const HUB_GRID_HEAD_LEFT_GAP = HUB_CARD_HEAD_LEFT_GAP;
export const HUB_GRID_HEAD_MARGIN_BOTTOM = 10;
export const HUB_GRID_DIVIDER_MARGIN_TOP = 10;
export const HUB_GRID_DIVIDER_MARGIN_BOTTOM = 8;
export const HUB_GRID_PARTY_MIN_HEIGHT = HUB_CARD_PARTY_CHIP_AVATAR;
export const HUB_GRID_TOOLBAR_ROW_HEIGHT = 32;
export const HUB_GRID_TOOLBAR_STATUS_SLOT_W = 52;
/** Awarded / amount status chips need room for ₹ values in 4-column grid. */
export const HUB_GRID_TOOLBAR_AWARDED_SLOT_W = 80;
export const HUB_GRID_TOOLBAR_PULSE_SLOT_W = 64;

/** Desktop hub grid list pagination (trips + load center). */
export const HUB_GRID_PAGE_SIZE_OPTIONS = [20, 40] as const;
export type HubGridPageSize = (typeof HUB_GRID_PAGE_SIZE_OPTIONS)[number];
export const HUB_GRID_DEFAULT_PAGE_SIZE: HubGridPageSize = 20;
