import { Image as RNImage } from "react-native";

/** Chrome reserved above/below the image in full-screen viewers. */
export type ImageViewportChrome = {
  horizontal?: number;
  top?: number;
  bottom?: number;
};

const DEFAULT_CHROME: Required<ImageViewportChrome> = {
  horizontal: 16,
  top: 52,
  bottom: 56,
};

/**
 * Size an image for preview/lightbox:
 * - Downscale when larger than the visible viewport.
 * - When `allowUpscale` is true (full-screen lightbox), scale up to fill the viewport
 *   while preserving aspect ratio (object-fit: contain at max size).
 * - Tall pages: keep natural width (capped), scroll vertically for the rest.
 */
export function resolveFitImageLayout(
  natural: { width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
  chrome: ImageViewportChrome = {},
  options?: { allowUpscale?: boolean },
): { width: number; height: number; scrollable: boolean } {
  const padH = chrome.horizontal ?? DEFAULT_CHROME.horizontal;
  const padTop = chrome.top ?? DEFAULT_CHROME.top;
  const padBottom = chrome.bottom ?? DEFAULT_CHROME.bottom;

  const maxW = Math.max(1, viewportWidth - padH * 2);
  const maxH = Math.max(1, viewportHeight - padTop - padBottom);

  const natW = Math.max(1, natural.width);
  const natH = Math.max(1, natural.height);

  const allowUpscale = options?.allowUpscale === true;
  const isTallPage = natH / natW > maxH / maxW && natH > maxH;

  if (isTallPage) {
    // Fill desktop width when previewing; keep natural width on thumbnails.
    const width = allowUpscale ? maxW : Math.min(natW, maxW);
    const height = (width / natW) * natH;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
      scrollable: height > maxH + 1,
    };
  }

  let scale = Math.min(maxW / natW, maxH / natH);
  if (!allowUpscale) {
    scale = Math.min(scale, 1);
  }
  return {
    width: Math.max(1, natW * scale),
    height: Math.max(1, natH * scale),
    scrollable: false,
  };
}

/** Load intrinsic image dimensions before sizing the preview. */
export function loadImageNaturalSize(
  uri: string,
): Promise<{ width: number; height: number } | null> {
  const trimmed = uri.trim();
  if (!trimmed) return Promise.resolve(null);

  if (typeof globalThis.Image !== "undefined") {
    return new Promise((resolve) => {
      const img = new globalThis.Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = trimmed;
    });
  }

  return new Promise((resolve) => {
    RNImage.getSize(
      trimmed,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}
