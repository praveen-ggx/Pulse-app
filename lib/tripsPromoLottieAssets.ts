import type { TripsPromoVariant } from "@/lib/tripsPromoAssets";
import type { AnimationObject } from "lottie-react-native";

/** Large hero Lottie per trips empty-state — one animation only, no orbit chips. */
export const TRIPS_PROMO_HERO_LOTTIE: Record<TripsPromoVariant, AnimationObject> = {
  indent: require("@/assets/Animated folder/website-startup.json"),
  unassigned: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  assigned: require("@/assets/Animated folder/chat-with-driver.json"),
  loading: require("@/assets/Animated folder/truck-loading.json"),
  in_transit: require("@/assets/Animated folder/online-tracking.json"),
  unloading: require("@/assets/Animated folder/truck-unloading.json"),
  delivered_docs_pending: require("@/assets/Animated folder/delivery completed.json"),
  first_trip: require("@/assets/Animated folder/website-startup.json"),
  filtered_out: require("@/assets/Animated folder/truck.json"),
  history_empty: require("@/assets/Animated folder/archive.json"),
  history_due_to_get: require("@/assets/Animated folder/finance-presentation.json"),
  history_no_due_to_get: require("@/assets/Animated folder/law approved.json"),
  history_due_to_pay: require("@/assets/Animated folder/withdraw-cash.json"),
  history_no_due_to_pay: require("@/assets/Animated folder/compare-scale.json"),
  history_pending_soft_pod: require("@/assets/Animated folder/delivery completed.json"),
  history_pending_hard_pod: require("@/assets/Animated folder/archive.json"),
  history_cancelled: require("@/assets/Animated folder/archive.json"),
};

/**
 * Per-animation render boost so every hero reads at the same visual weight inside
 * the fixed square slot (Lottie canvases have different padding / aspect ratios).
 */
export const TRIPS_PROMO_HERO_VISUAL_SCALE: Record<TripsPromoVariant, number> = {
  indent: 1.02,
  unassigned: 1.06,
  assigned: 1.02,
  loading: 1.12,
  in_transit: 1.04,
  unloading: 1.1,
  delivered_docs_pending: 1.04,
  first_trip: 1.02,
  filtered_out: 1.04,
  history_empty: 1.04,
  history_due_to_get: 1.08,
  history_no_due_to_get: 1.04,
  history_due_to_pay: 1.04,
  history_no_due_to_pay: 1.04,
  history_pending_soft_pod: 1.04,
  history_pending_hard_pod: 1.04,
  history_cancelled: 1.04,
};

export function resolveTripsPromoHeroLottie(
  variant: TripsPromoVariant,
): AnimationObject {
  return TRIPS_PROMO_HERO_LOTTIE[variant];
}

export function resolveTripsPromoHeroVisualScale(
  variant: TripsPromoVariant,
): number {
  return TRIPS_PROMO_HERO_VISUAL_SCALE[variant];
}

/** Fixed square slot — all trip tabs share the same outer frame. */
export const TRIPS_PROMO_HERO_SLOT = {
  compact: 112,
  mobile: 128,
  desktop: 144,
} as const;
