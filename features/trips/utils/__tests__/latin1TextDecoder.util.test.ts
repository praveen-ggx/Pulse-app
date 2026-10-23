import { installLatin1TextDecoder } from "@/features/trips/utils/latin1TextDecoder.util";

describe("installLatin1TextDecoder", () => {
  const original = globalThis.TextDecoder;

  afterEach(() => {
    Object.defineProperty(globalThis, "TextDecoder", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it("adds latin1 to a UTF-8-only decoder (Expo native) and passes other labels through", () => {
    class Utf8OnlyDecoder extends original {
      constructor(label = "utf-8", options?: TextDecoderOptions) {
        if (!/^utf-?8$/i.test(label.trim())) {
          throw new RangeError(`Unknown encoding: ${label}`);
        }
        super(label, options);
      }
    }
    Object.defineProperty(globalThis, "TextDecoder", {
      value: Utf8OnlyDecoder,
      configurable: true,
      writable: true,
    });

    installLatin1TextDecoder();

    const latin1 = new TextDecoder("latin1");
    expect(latin1.decode(new Uint8Array([0x50, 0x4e, 0x47, 0xe9, 0xff]))).toBe("PNGéÿ");
    expect(new TextDecoder("utf-8").decode(new Uint8Array([0xc3, 0xa9]))).toBe("é");
    expect(() => new TextDecoder("utf-16le")).toThrow(RangeError);
  });

  it("leaves a decoder that already supports latin1 untouched", () => {
    installLatin1TextDecoder();
    expect(globalThis.TextDecoder).toBe(original);
  });
});
