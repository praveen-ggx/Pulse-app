// expo-file-system SDK 54 moved readAsStringAsync/EncodingType to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";

import { sha256Hex } from "./sha256.util";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * URIs that must use fetch — native FileSystem.readAsStringAsync is unavailable on web
 * and does not support blob:/data:/http(s) schemes.
 */
function shouldFetchUri(uri: string): boolean {
  return (
    /^https?:\/\//i.test(uri) ||
    uri.startsWith("data:") ||
    uri.startsWith("blob:")
  );
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  if (shouldFetchUri(uri)) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not read file for fingerprint (${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(base64);
}

/** SHA-256 hex fingerprint of a local or remote image URI. */
export async function sha256File(uri: string): Promise<string> {
  const bytes = await readUriBytes(uri);
  return sha256Hex(bytes);
}
