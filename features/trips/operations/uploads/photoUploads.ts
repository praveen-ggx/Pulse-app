import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.75;
/** Smaller payload for Gemini OCR — balance readability in low light vs upload size. */
const OCR_MAX_DIMENSION = 1280;
const OCR_QUALITY = 0.76;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/\s/g, "");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  throw new Error("Could not decode image for upload.");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }
  throw new Error("Could not encode image for OCR.");
}

function dataUriBase64(uri: string): string | null {
  if (!uri.startsWith("data:")) return null;
  const base64 = uri.slice(uri.indexOf(",") + 1).replace(/\s/g, "");
  return base64 || null;
}

async function readUriBase64(uri: string): Promise<string> {
  const inline = dataUriBase64(uri);
  if (inline) return inline;

  if (
    Platform.OS === "web" ||
    uri.startsWith("blob:") ||
    uri.startsWith("data:") ||
    /^https?:\/\//i.test(uri)
  ) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not read bill photo.");
    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    if (!base64) throw new Error("Could not read bill photo.");
    return base64;
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64.trim()) throw new Error("Could not read bill photo.");
  return base64.replace(/\s/g, "");
}

/**
 * Copy a camera or library photo into a URI that still exists when the user submits.
 * Phone camera files are often temporary. Web frames are blob URLs.
 */
export async function keepPhotoForUpload(uri: string): Promise<string> {
  const trimmed = uri.trim();
  if (!trimmed) throw new Error("Could not read bill photo.");
  if (Platform.OS === "web") {
    if (trimmed.startsWith("data:")) return trimmed;
    const base64 = await readUriBase64(trimmed);
    return `data:image/jpeg;base64,${base64}`;
  }

  const root = FileSystem.cacheDirectory;
  if (!root) return trimmed;
  const dest = `${root}pulse-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && !info.isDirectory && (info.size ?? 1) > 0) return dest;
  } catch {
    // Camera and library URIs on a phone are not always copyable.
  }
  const base64 = await readUriBase64(trimmed);
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

async function compressToBase64(
  uri: string,
  maxDimension = IMAGE_MAX_DIMENSION,
  quality = IMAGE_QUALITY,
): Promise<string> {
  const source = await keepPhotoForUpload(uri).catch(() => uri.trim());
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      source,
      [{ resize: { width: maxDimension } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    const base64 = manipulated.base64?.trim();
    if (base64) return base64;
    return readUriBase64(manipulated.uri);
  } catch {
    return readUriBase64(source);
  }
}

export async function compressOperationsPhoto(uri: string): Promise<ArrayBuffer> {
  const base64 = await compressToBase64(uri);
  return base64ToArrayBuffer(base64);
}

/** Compressed JPEG suitable for Gemini vision OCR. */
export async function compressOperationsPhotoToBase64(
  uri: string,
): Promise<{ base64: string; mimeType: string }> {
  const base64 = await compressToBase64(uri, OCR_MAX_DIMENSION, OCR_QUALITY);
  if (!base64.trim()) {
    throw new Error("Could not read bill photo for OCR.");
  }
  return {
    base64,
    mimeType: "image/jpeg",
  };
}
