import { TRIPS_PROMO_PRESETS } from "@/lib/tripsPromoAssets";
import {
  TRIPS_PROMO_HERO_LOTTIE,
  TRIPS_PROMO_HERO_VISUAL_SCALE,
} from "@/lib/tripsPromoLottieAssets";

describe("trip promo hero maps", () => {
  it("defines an animation and a scale for every promo variant, including cancelled history", () => {
    for (const variant of Object.keys(TRIPS_PROMO_PRESETS)) {
      expect(TRIPS_PROMO_HERO_LOTTIE[variant as keyof typeof TRIPS_PROMO_HERO_LOTTIE]).toBeTruthy();
      expect(typeof TRIPS_PROMO_HERO_VISUAL_SCALE[variant as keyof typeof TRIPS_PROMO_HERO_VISUAL_SCALE]).toBe("number");
    }
    expect(TRIPS_PROMO_HERO_LOTTIE.history_cancelled).toBeTruthy();
  });
});
