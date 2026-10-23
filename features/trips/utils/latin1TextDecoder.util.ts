/**
 * Expo's native `TextDecoder` (expo/src/winter) only accepts UTF-8 and throws
 * `RangeError: Unknown encoding: latin1` otherwise. jsPDF pulls in `fast-png`,
 * which runs `new TextDecoder('latin1')` at module load — so importing jsPDF
 * on Android/iOS crashes whatever screen imports it (E-LR → trip detail).
 *
 * Import this module before `jspdf`. It only patches the global when the
 * current decoder rejects latin1 (no-op on web); every other label is passed
 * through to the original decoder.
 */

const LATIN1_LABELS = new Set(["latin1", "iso-8859-1", "iso8859-1", "l1"]);

function isLatin1Label(label: unknown): boolean {
  return LATIN1_LABELS.has(String(label ?? "").trim().toLowerCase());
}

class Latin1TextDecoder {
  readonly encoding = "latin1";
  readonly fatal = false;
  readonly ignoreBOM = false;

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return "";
    const bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
    }
    return out;
  }
}

function supportsLatin1(Decoder: typeof TextDecoder): boolean {
  try {
    new Decoder("latin1");
    return true;
  } catch {
    return false;
  }
}

export function installLatin1TextDecoder(): void {
  const NativeTextDecoder = globalThis.TextDecoder;
  if (typeof NativeTextDecoder !== "function" || supportsLatin1(NativeTextDecoder)) return;

  const PatchedTextDecoder = function (label?: string, options?: TextDecoderOptions) {
    return isLatin1Label(label)
      ? new Latin1TextDecoder()
      : new NativeTextDecoder(label, options);
  } as unknown as typeof TextDecoder;
  PatchedTextDecoder.prototype = NativeTextDecoder.prototype;

  Object.defineProperty(globalThis, "TextDecoder", {
    value: PatchedTextDecoder,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

installLatin1TextDecoder();
