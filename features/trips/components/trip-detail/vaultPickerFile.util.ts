import type { DocumentPickerAsset } from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type VaultPickedFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
};

async function bufferFromUri(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Could not read the selected file. Choose it again.");
    }
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Could not read the selected file. Choose it again.");
    }
    return arrayBuffer;
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as const,
  });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

/** Read picker bytes immediately. Phone browsers drop blob URIs before confirm. */
export async function readVaultPickerAsset(
  asset: DocumentPickerAsset,
  fallbackName: string,
  mimeFromName: (name?: string | null, mime?: string | null) => string,
): Promise<VaultPickedFile> {
  const fileName = asset.name || fallbackName;
  const mimeType = mimeFromName(asset.name, asset.mimeType);
  const nativeFile = (asset as { file?: Blob }).file;
  if (nativeFile && typeof nativeFile.arrayBuffer === "function") {
    const arrayBuffer = await nativeFile.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      return { uri: asset.uri, fileName, mimeType, arrayBuffer };
    }
  }
  return {
    uri: asset.uri,
    fileName,
    mimeType,
    arrayBuffer: await bufferFromUri(asset.uri),
  };
}

export async function bytesForVaultFile(file: {
  uri: string;
  arrayBuffer?: ArrayBuffer;
}): Promise<ArrayBuffer> {
  if (file.arrayBuffer && file.arrayBuffer.byteLength > 0) return file.arrayBuffer;
  return bufferFromUri(file.uri);
}
