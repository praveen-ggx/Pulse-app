import { Image, type ImageProps } from "expo-image";
import { memo } from "react";

/**
 * Default image for Pulse web + native. expo-image caches in memory/disk
 * and downscales to the laid-out size so list avatars and hub art do not
 * decode full-resolution bitmaps on every row.
 */
export const PulseImage = memo(function PulseImage({
  cachePolicy = "memory-disk",
  priority = "low",
  transition = 0,
  allowDownscaling = true,
  ...props
}: ImageProps) {
  return (
    <Image
      cachePolicy={cachePolicy}
      priority={priority}
      transition={transition}
      allowDownscaling={allowDownscaling}
      {...props}
    />
  );
});
