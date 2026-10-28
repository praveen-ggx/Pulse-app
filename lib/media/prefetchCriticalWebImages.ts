import { Asset } from "expo-asset";
import { Image } from "expo-image";
import { Platform } from "react-native";

const WELCOME_CORE = require("@/assets/illustrations/web/pulse_mascot_cutout.png");
const WELCOME_PILOT = require("@/assets/illustrations/web/otp_delivery_truck_mascot_cutout.png");

let started = false;

async function prefetchModule(mod: number): Promise<void> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (uri) await Image.prefetch(uri, "memory-disk");
}

/** Warm the welcome / hub mascots so the first paint does not wait on Metro asset fetch. */
export function prefetchCriticalWebImages(): void {
  if (started || Platform.OS !== "web") return;
  started = true;
  void Promise.all([
    prefetchModule(WELCOME_CORE),
    prefetchModule(WELCOME_PILOT),
  ]).catch(() => {});
}
