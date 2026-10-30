import {
  contentBoxFromPixels,
  scaleContentBox,
  shouldUseContentCrop,
  type PixelBuffer,
} from "../documentPreviewContent.util";

function fill(buffer: PixelBuffer, r: number, g: number, b: number) {
  const { data, width, height } = buffer;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

function rect(
  buffer: PixelBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const o = (yy * buffer.width + xx) * 4;
      buffer.data[o] = r;
      buffer.data[o + 1] = g;
      buffer.data[o + 2] = b;
      buffer.data[o + 3] = 255;
    }
  }
}

function makeBuffer(width: number, height: number): PixelBuffer {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

describe("documentPreviewContent", () => {
  it("does not crop a white scan to handwriting or a dark ink island", () => {
    const buffer = makeBuffer(100, 120);
    fill(buffer, 250, 250, 250);
    rect(buffer, 18, 70, 64, 30, 20, 20, 20);
    expect(contentBoxFromPixels(buffer)).toBeNull();
  });

  it("crops dark desk around a bright paper so the full form stays in view", () => {
    const buffer = makeBuffer(120, 80);
    fill(buffer, 40, 36, 30);
    rect(buffer, 16, 6, 90, 68, 245, 245, 242);
    const box = contentBoxFromPixels(buffer);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.width).toBeGreaterThan(80);
    expect(box!.height).toBeGreaterThan(60);
    expect(box!.width).toBeLessThan(112);
  });

  it("skips a full-bleed page with no empty margin", () => {
    const buffer = makeBuffer(80, 80);
    fill(buffer, 248, 248, 248);
    rect(buffer, 2, 2, 76, 76, 18, 18, 18);
    expect(contentBoxFromPixels(buffer)).toBeNull();
  });

  it("rejects a tiny speck as noise", () => {
    const buffer = makeBuffer(80, 80);
    fill(buffer, 250, 250, 250);
    rect(buffer, 38, 38, 3, 3, 0, 0, 0);
    expect(contentBoxFromPixels(buffer)).toBeNull();
  });

  it("maps a sample box back to natural pixels", () => {
    const mapped = scaleContentBox(
      { x: 10, y: 20, width: 40, height: 60 },
      { width: 80, height: 120 },
      { width: 800, height: 1200 },
    );
    expect(mapped).toEqual({ x: 100, y: 200, width: 400, height: 600 });
  });

  it("requires a large remaining page before cropping", () => {
    expect(
      shouldUseContentCrop(
        { width: 100, height: 100 },
        { x: 2, y: 2, width: 96, height: 96 },
      ),
    ).toBe(false);
    expect(
      shouldUseContentCrop(
        { width: 100, height: 100 },
        { x: 18, y: 70, width: 64, height: 24 },
      ),
    ).toBe(false);
    expect(
      shouldUseContentCrop(
        { width: 100, height: 100 },
        { x: 8, y: 6, width: 84, height: 88 },
      ),
    ).toBe(true);
  });
});
