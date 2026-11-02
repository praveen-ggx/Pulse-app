/** Page bounds for document photos — trim desk, never crop to ink. */

export type PixelBuffer = {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
};

export type DocumentContentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SAMPLE_MAX = 400;
const SCAN_BG_LUM = 200;
const PAPER_LUM_GAP = 36;
const MIN_LINE_RATIO = 0.08;
const MIN_LINE_HITS = 6;
const PAD_RATIO = 0.02;
const MIN_AREA_RATIO = 0.5;
const MIN_DIM_RATIO = 0.5;
const USEFUL_TRIM_RATIO = 0.05;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pixelAt(buffer: PixelBuffer, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const i = (y * buffer.width + x) * 4;
  const { data } = buffer;
  return {
    r: data[i] ?? 0,
    g: data[i + 1] ?? 0,
    b: data[i + 2] ?? 0,
    a: data[i + 3] ?? 255,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Median colour of a thin outer frame — desk, scanner bed, or page margin. */
export function borderBackground(buffer: PixelBuffer): { r: number; g: number; b: number; l: number } {
  const { width, height } = buffer;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 48));
  const push = (x: number, y: number) => {
    const p = pixelAt(buffer, x, y);
    if (p.a < 16) return;
    rs.push(p.r);
    gs.push(p.g);
    bs.push(p.b);
  };
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < band; y += step) push(x, y);
    for (let y = height - band; y < height; y += step) push(x, y);
  }
  for (let y = band; y < height - band; y += step) {
    for (let x = 0; x < band; x += step) push(x, y);
    for (let x = width - band; x < width; x += step) push(x, y);
  }
  const r = median(rs);
  const g = median(gs);
  const b = median(bs);
  return { r, g, b, l: luminance(r, g, b) };
}

/** Bright paper on a darker desk — not ink on a white form. */
export function isPaperPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  bg: { l: number },
): boolean {
  if (a < 16) return false;
  return luminance(r, g, b) >= bg.l + PAPER_LUM_GAP;
}

function lineHits(
  buffer: PixelBuffer,
  bg: { l: number },
  axis: "row" | "col",
  index: number,
): number {
  const span = axis === "row" ? buffer.width : buffer.height;
  let hits = 0;
  for (let i = 0; i < span; i += 1) {
    const x = axis === "row" ? i : index;
    const y = axis === "row" ? index : i;
    const p = pixelAt(buffer, x, y);
    if (isPaperPixel(p.r, p.g, p.b, p.a, bg)) hits += 1;
  }
  return hits;
}

function firstPaperIndex(
  buffer: PixelBuffer,
  bg: { l: number },
  axis: "row" | "col",
  fromStart: boolean,
): number {
  const limit = axis === "row" ? buffer.height : buffer.width;
  const span = axis === "row" ? buffer.width : buffer.height;
  const need = Math.max(MIN_LINE_HITS, Math.floor(span * MIN_LINE_RATIO));
  if (fromStart) {
    for (let i = 0; i < limit; i += 1) {
      if (lineHits(buffer, bg, axis, i) >= need) return i;
    }
    return 0;
  }
  for (let i = limit - 1; i >= 0; i -= 1) {
    if (lineHits(buffer, bg, axis, i) >= need) return i;
  }
  return limit - 1;
}

export function shouldUseContentCrop(
  image: { width: number; height: number },
  box: DocumentContentBox,
): boolean {
  if (box.width < 8 || box.height < 8) return false;
  if (box.x < 0 || box.y < 0) return false;
  if (box.x + box.width > image.width + 0.5) return false;
  if (box.y + box.height > image.height + 0.5) return false;
  const area = (box.width * box.height) / Math.max(1, image.width * image.height);
  if (area < MIN_AREA_RATIO) return false;
  if (box.width / image.width < MIN_DIM_RATIO) return false;
  if (box.height / image.height < MIN_DIM_RATIO) return false;
  const trimX = 1 - box.width / image.width;
  const trimY = 1 - box.height / image.height;
  return trimX >= USEFUL_TRIM_RATIO || trimY >= USEFUL_TRIM_RATIO;
}

/**
 * Desk photos: keep the full paper. White scans / ink islands: do not crop
 * (thin printed forms disappear when downsampled; cropping to handwriting
 * hides the rest of the page).
 */
export function contentBoxFromPixels(buffer: PixelBuffer): DocumentContentBox | null {
  const { width, height } = buffer;
  if (width < 8 || height < 8) return null;
  const bg = borderBackground(buffer);
  if (bg.l >= SCAN_BG_LUM) return null;
  const top = firstPaperIndex(buffer, bg, "row", true);
  const bottom = firstPaperIndex(buffer, bg, "row", false);
  const left = firstPaperIndex(buffer, bg, "col", true);
  const right = firstPaperIndex(buffer, bg, "col", false);
  if (bottom < top || right < left) return null;
  const pad = Math.max(2, Math.round(Math.max(width, height) * PAD_RATIO));
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  const x2 = Math.min(width, right + 1 + pad);
  const y2 = Math.min(height, bottom + 1 + pad);
  const box = { x, y, width: x2 - x, height: y2 - y };
  if (!shouldUseContentCrop({ width, height }, box)) return null;
  return box;
}

export function scaleContentBox(
  box: DocumentContentBox,
  from: { width: number; height: number },
  to: { width: number; height: number },
): DocumentContentBox {
  const sx = to.width / Math.max(1, from.width);
  const sy = to.height / Math.max(1, from.height);
  const x = Math.max(0, Math.floor(box.x * sx));
  const y = Math.max(0, Math.floor(box.y * sy));
  const width = Math.min(to.width - x, Math.ceil(box.width * sx));
  const height = Math.min(to.height - y, Math.ceil(box.height * sy));
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

function sampleSize(natural: { width: number; height: number }): { width: number; height: number } {
  const longSide = Math.max(natural.width, natural.height);
  if (longSide <= SAMPLE_MAX) return natural;
  const scale = SAMPLE_MAX / longSide;
  return {
    width: Math.max(8, Math.round(natural.width * scale)),
    height: Math.max(8, Math.round(natural.height * scale)),
  };
}

/**
 * Load the image, sample it, and return paper bounds in natural pixels.
 * Returns null when CORS, decode, or trim is not useful.
 */
export async function detectDocumentContentBox(uri: string): Promise<DocumentContentBox | null> {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (typeof document === "undefined") return null;
  try {
    const img = await loadHtmlImage(trimmed);
    if (!img) return null;
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    if (natural.width < 16 || natural.height < 16) return null;
    const sample = sampleSize(natural);
    const canvas = document.createElement("canvas");
    canvas.width = sample.width;
    canvas.height = sample.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, sample.width, sample.height);
    const pixels = ctx.getImageData(0, 0, sample.width, sample.height);
    const sampled = contentBoxFromPixels({
      data: pixels.data,
      width: pixels.width,
      height: pixels.height,
    });
    if (!sampled) return null;
    const box = scaleContentBox(sampled, sample, natural);
    return shouldUseContentCrop(natural, box) ? box : null;
  } catch {
    return null;
  }
}

function loadHtmlImage(uri: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
