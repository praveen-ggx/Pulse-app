/**
 * Download a trip-documents storage object (LR, POD, etc.) to the device.
 * Web: browser save. Native: share sheet after cache write.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const BUCKET = "trip-documents";

function safeFileName(name?: string | null, fallback = "document"): string {
  const raw = (name ?? "").trim() || fallback;
  return raw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
}

export async function downloadTripDocumentFile(input: {
  storagePath: string;
  fileName?: string | null;
}): Promise<{ error: Error | null }> {
  const path = input.storagePath.trim().split("?")[0] ?? "";
  if (!path) return { error: new Error("No file to download.") };
  const fileName = safeFileName(
    input.fileName,
    path.split("/").pop() || "document",
  );

  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60, { download: fileName });
  if (error || !data?.signedUrl) {
    return {
      error: new Error(error?.message ?? "Could not prepare download."),
    };
  }

  if (Platform.OS === "web") {
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      return { error: null };
    } catch {
      const opened = window.open(data.signedUrl, "_blank");
      if (opened) opened.opener = null;
      return { error: null };
    }
  }

  try {
    const cacheDirectory = (
      FileSystem as { cacheDirectory?: string }
    ).cacheDirectory;
    if (!cacheDirectory) return { error: new Error("No cache directory") };
    const uri = `${cacheDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(data.signedUrl, uri);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { dialogTitle: fileName });
      return { error: null };
    }
    return { error: new Error("Sharing is not available on this device.") };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
